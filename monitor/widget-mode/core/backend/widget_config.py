"""Validated, atomic user-editable shared widget settings (no live sessions)."""
from __future__ import annotations
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import tempfile
import threading
import xml.etree.ElementTree as ET

MAX_BYTES = 262144


def schema():
    here = Path(__file__).parent
    path = here/'widget-config.xml'
    if not path.exists():
        path = here.parent/'plasmoid/contents/config/main.xml'
    root = ET.parse(path).getroot()
    entries = {}
    for entry in root.iter('{http://www.kde.org/standards/kcfg/1.0}entry'):
        def text(tag):
            return entry.findtext('{http://www.kde.org/standards/kcfg/1.0}' + tag, '')
        if entry.attrib['name'] in ('settingsProfile', 'detachedModule', 'detachedParent'):
            continue  # Profile selection belongs to each Plasma instance.
        kind = entry.attrib['type']
        default = text('default')
        if kind == 'Int':
            default = int(default)
        elif kind == 'Bool':
            default = default == 'true'
        entries[entry.attrib['name']] = (kind, default, text('min'), text('max'))
    return entries


SCHEMA = schema()
DEFAULTS = {key: item[1] for key, item in SCHEMA.items()}
MODULES = set(DEFAULTS['moduleOrder'].split(','))


class Conflict(Exception):
    def __init__(self, state):
        self.state = state


def validate(settings):
    if not isinstance(settings, dict):
        raise ValueError('settings must be an object')
    for key, value in settings.items():
        if key not in SCHEMA:
            raise ValueError(f'Unknown setting: {key}')
        kind, _, low, high = SCHEMA[key]
        expected = {'Int': int, 'Bool': bool, 'String': str}[kind]
        if type(value) is not expected:
            raise ValueError(f'{key} must be {kind.lower()}')
        if kind == 'Int' and not int(low) <= value <= int(high):
            raise ValueError(f'{key} must be between {low} and {high}')
        if kind == 'String' and len(value.encode('utf-8')) > (65536 if key in ('noteText', 'todoItems') else 16384):
            raise ValueError(f'{key} is too long')
        if key in ('layoutHeights','layoutColumnWeights','layoutSplits'):
            try: data=json.loads(value)
            except ValueError as error: raise ValueError('Invalid layout JSON') from error
            if key == 'layoutHeights':
                if not isinstance(data,dict) or any(k not in MODULES | {'radios','powertimers','countdownBody','stopwatchBody','batteryBody'} or type(v) is not int or not 24 <= v <= 1800 for k,v in data.items()):
                    raise ValueError('Use known module heights between 24 and 1800')
            elif key == 'layoutColumnWeights':
                if not isinstance(data,list) or len(data)!=3 or any(type(v) not in (int,float) or not 0 < v <= 10000 for v in data):
                    raise ValueError('Use three positive column weights')
            elif not isinstance(data,dict) or any(k not in ('todos','power','radios','timers') or type(v) not in (int,float) or not 0.15 <= v <= 0.85 for k,v in data.items()):
                raise ValueError('Use bounded rectangular split ratios')
        if key in ('todoPendingTitle', 'todoUrgentTitle') and len(value) > 64:
            raise ValueError(f'{key} must contain at most 64 characters')
        if key == 'todoItems':
            try:
                tasks = json.loads(value)
            except ValueError as error:
                raise ValueError('todoItems must contain valid JSON') from error
            if not isinstance(tasks, dict) or set(tasks) != {'pending', 'urgent'}:
                raise ValueError('todoItems requires pending and urgent lists')
            identifiers = set()
            for rows in tasks.values():
                if not isinstance(rows, list) or len(rows) > 100:
                    raise ValueError('Use at most 100 tasks per list')
                for row in rows:
                    if not isinstance(row, dict) or set(row) != {'id', 'text', 'done'}:
                        raise ValueError('Each task requires id, text and done')
                    identifier = row['id']
                    if not isinstance(identifier, str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,64}', identifier) or identifier in identifiers:
                        raise ValueError('Task IDs must be unique letters, digits, underscores or hyphens')
                    identifiers.add(identifier)
                    text = row['text']
                    if not isinstance(text, str) or not text.strip() or len(text) > 300 or '\n' in text or '\r' in text or type(row['done']) is not bool:
                        raise ValueError('Tasks need 1-300 characters on one line and a boolean done state')
        if key.endswith('Shortcut') and (len(value) > 96 or any(ord(c) < 32 for c in value)):
            raise ValueError('Shortcut must be a single readable key sequence')
        if key.endswith(('Color', 'ColorHex')) and value and not re.fullmatch(r'#[0-9a-fA-F]{6}', value):
            raise ValueError(f'{key} must be empty or #rrggbb')
        if key.endswith('Style') and value not in ('minimal', 'digital', 'ring'):
            raise ValueError(f'{key} must be minimal, digital or ring')
        if key in ('moduleOrder', 'enabledModules'):
            modules = value.split(',') if value else []
            if any(item not in MODULES for item in modules) or len(modules) != len(set(modules)):
                raise ValueError(f'{key} must contain unique known module names')
    return settings


class WidgetConfig:
    def __init__(self, path=None):
        self.path = Path(path) if path is not None else Path(os.environ.get('XDG_CONFIG_HOME', str(Path.home()/'.config')))/'someProducts-monitor/config.json'
        self.lock = threading.RLock()
        self.profiles = {}

    def for_profile(self, name='default'):
        if not isinstance(name, str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,64}', name):
            raise ValueError('Profile name must contain 1-64 letters, digits, underscores or hyphens')
        if name == 'default':
            return self
        with self.lock:
            if name not in self.profiles:
                self.profiles[name] = WidgetConfig(self.path.parent/'profiles'/f'{name}.json')
            return self.profiles[name]

    def read(self):
        with self.lock:
            try:
                with self.path.open('rb') as stream:
                    raw = stream.read(MAX_BYTES + 1)
            except FileNotFoundError:
                return {'path': str(self.path), 'configured': False, 'revision': '', 'settings': dict(DEFAULTS)}
            if len(raw) > MAX_BYTES:
                raise ValueError('Config file is too large')
            try:
                doc = json.loads(raw)
            except (ValueError, UnicodeError) as error:
                raise ValueError('Config file must contain valid UTF-8 JSON') from error
            if not isinstance(doc, dict) or set(doc) - {'version', 'settings'} or type(doc.get('version')) is not int or doc['version'] != 1:
                raise ValueError('Config file requires version 1 and a settings object')
            settings = {**DEFAULTS, **validate(doc.get('settings'))}
            return {'path': str(self.path), 'configured': True, 'revision': hashlib.sha256(raw).hexdigest(), 'settings': settings}

    def update(self, changes, revision):
        validate(changes)
        if not isinstance(revision, str):
            raise ValueError('revision must be a string')
        with self.lock:
            current = self.read()  # Invalid manual drafts are never overwritten.
            if revision != current['revision']:
                raise Conflict(current)
            settings = {**current['settings'], **changes}
            raw = (json.dumps({'version': 1, 'settings': settings}, ensure_ascii=False, indent=2) + '\n').encode('utf-8')
            if len(raw) > MAX_BYTES:
                raise ValueError('Settings are too large')
            self.path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
            descriptor, temporary = tempfile.mkstemp(dir=self.path.parent, prefix='.config-', suffix='.json')
            try:
                with os.fdopen(descriptor, 'wb') as output:
                    output.write(raw)
                    output.flush()
                    os.fsync(output.fileno())
                # A manual atomic-save during validation must not be overwritten.
                latest = self.read()
                if latest['revision'] != revision:
                    raise Conflict(latest)
                os.replace(temporary, self.path)
            finally:
                if os.path.exists(temporary):
                    os.unlink(temporary)
            return self.read()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--init', action='store_true', help='Create defaults only if the file is missing')
    parser.add_argument('--check', action='store_true', help='Validate without printing private values')
    parser.add_argument('--profile', default='default', help='Named profile (default uses config.json)')
    args = parser.parse_args()
    try:
        store = WidgetConfig().for_profile(args.profile)
        state = store.read()
        if args.init and not state['configured']:
            state = store.update({}, '')
        if args.check and not state['configured']:
            raise ValueError('Config file does not exist yet')
    except (ValueError, OSError) as error:
        parser.exit(1, str(error) + '\n')
    print(store.path)


if __name__ == '__main__':
    main()

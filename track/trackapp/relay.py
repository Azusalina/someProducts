"""Persist relay choice separately from short-lived connection health."""
import json
import os
import re
from urllib.parse import urlsplit


def public_origin(value):
    if not isinstance(value, str):
        raise ValueError('Expected HTTPS origin')
    url = urlsplit(value)
    if (url.scheme != 'https' or url.username or url.password or url.port not in (None, 443)
            or url.path or url.query or url.fragment or not url.hostname
            or not re.fullmatch(r'[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?', url.hostname)
            or '.' not in url.hostname):
        raise ValueError('Expected an HTTPS hostname without path, credentials or custom port')
    return 'https://' + url.hostname


def quick_origin(value):
    return bool(isinstance(value, str) and re.fullmatch(r'https://[a-z0-9]+(?:-[a-z0-9]+)*\.trycloudflare\.com', value))


def load(folder):
    path = folder / 'relay-settings.json'
    if not path.exists():
        return {'enabled': False, 'mode': 'quick'}
    settings = json.loads(path.read_text())
    if settings.get('mode') not in ('quick', 'named'):
        raise ValueError('Invalid saved relay mode')
    if settings.get('public_url'):
        settings['public_url'] = public_origin(settings['public_url'])
        if settings['mode'] == 'quick' and not quick_origin(settings['public_url']):
            raise ValueError('Invalid saved Quick Tunnel URL')
    if settings['mode'] == 'named' and (not settings.get('public_url') or not settings.get('tunnel_config')):
        raise ValueError('Named Tunnel requires public URL and tunnel config')
    return settings


def save(folder, settings):
    path = folder / 'relay-settings.json'
    temporary = folder / 'relay-settings.tmp'
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, 'w') as file:
        json.dump(settings, file)
    os.replace(temporary, path)

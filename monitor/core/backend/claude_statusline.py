#!/usr/bin/env python3
"""Receive supported Claude Code status data, save quotas only, show a short line."""
import json
import os
from pathlib import Path
import sys
import tempfile
import time
from usage import numeric, parse_claude, state_dir


def main():
    try:
        data = json.loads(sys.stdin.read(1_000_001))
        rates = data.get('rate_limits') or {}
        # Ignore prompts, transcript paths, account IDs, credentials, context and cost fields.
        selected = {}
        for key in ('five_hour', 'seven_day'):
            value = rates.get(key)
            if isinstance(value, dict):
                selected[key] = {'used_percentage': numeric(value.get('used_percentage')),
                                 'resets_at': numeric(value.get('resets_at'))}
        observed = time.time()
        payload = {'rate_limits': selected, 'observed_at': observed}
        directory = state_dir()
        directory.mkdir(mode=0o700, parents=True, exist_ok=True)
        filename = None
        try:
            with tempfile.NamedTemporaryFile(mode='w', dir=directory, prefix='.claude-', delete=False) as output:
                filename = output.name
                json.dump(payload, output, allow_nan=False)
            os.chmod(filename, 0o600)
            os.replace(filename, directory / 'claude-usage.json')
        finally:
            if filename and os.path.exists(filename):
                os.unlink(filename)
        provider = parse_claude(payload, observed)
        parts = [f"{w['label']} {w['remaining_percent']:g}% left" for w in provider['windows'] if w['remaining_percent'] is not None]
        print('Claude' + (' · ' + ' · '.join(parts) if parts else ' · Monitor connected'))
    except (OSError, ValueError, TypeError, AttributeError):
        print('Claude · usage unavailable')


if __name__ == '__main__':
    main()

#!/usr/bin/env bash
set -euo pipefail
monitor_core="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
python "$monitor_core/scripts/migrate.py"
monitor_config="${XDG_CONFIG_HOME:-$HOME/.config}"
monitor_data="${XDG_DATA_HOME:-$HOME/.local/share}"
systemctl --user disable --now monitor-dashboard.service || true
if test -f "$monitor_config/systemd/user/monitor-dashboard.service"; then
    rm -- "$monitor_config/systemd/user/monitor-dashboard.service"
fi
for monitor_backend in monitor_service.py usage.py reset_news.py claude_statusline.py connectivity.py cava_audio.py terminal_sessions.py terminal_child.py; do
    if test -f "$monitor_data/monitor-dashboard/$monitor_backend"; then
        rm -- "$monitor_data/monitor-dashboard/$monitor_backend"
    fi
done
if test -d "$monitor_data/monitor-dashboard/.venv"; then rm -rf -- "$monitor_data/monitor-dashboard/.venv"; fi
rmdir -- "$monitor_data/monitor-dashboard" 2>/dev/null || true
systemctl --user daemon-reload
kpackagetool6 --type Plasma/Applet --remove local.monitor.dashboard
printf 'Monitor removed. Existing Plasma widget configurations were not edited.\n'

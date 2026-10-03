#!/usr/bin/env bash
set -euo pipefail
monitor_core="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
python "$monitor_core/scripts/connect-claude.py" --disconnect
monitor_config="${XDG_CONFIG_HOME:-$HOME/.config}"
monitor_data="${XDG_DATA_HOME:-$HOME/.local/share}"
systemctl --user disable --now monitor-dashboard.service || true
if test -f "$monitor_config/systemd/user/monitor-dashboard.service"; then
    rm -- "$monitor_config/systemd/user/monitor-dashboard.service"
fi
for monitor_backend in monitor_service.py usage.py reset_news.py claude_statusline.py connectivity.py; do
    if test -f "$monitor_data/monitor-dashboard/$monitor_backend"; then
        rm -- "$monitor_data/monitor-dashboard/$monitor_backend"
    fi
done
rmdir -- "$monitor_data/monitor-dashboard" 2>/dev/null || true
systemctl --user daemon-reload
kpackagetool6 --type Plasma/Applet --remove local.monitor.dashboard
printf 'Monitor removed. Existing Plasma widget configurations were not edited.\n'

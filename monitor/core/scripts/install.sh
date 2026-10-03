#!/usr/bin/env bash
# Install locally without touching system packages or desktop placement.
set -euo pipefail
monitor_core="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
monitor_data="${XDG_DATA_HOME:-$HOME/.local/share}"
monitor_config="${XDG_CONFIG_HOME:-$HOME/.config}"
monitor_python="$(command -v python)"
for monitor_tool in kpackagetool6 busctl ping systemctl; do
    command -v "$monitor_tool" >/dev/null || { printf 'Missing dependency: %s\n' "$monitor_tool" >&2; exit 1; }
done
monitor_service_dir="$monitor_data/monitor-dashboard"
monitor_working_folder="$(dirname -- "$monitor_core")"
monitor_working_folder="${monitor_working_folder//%/%%}"
mkdir -p "$monitor_service_dir" "$monitor_config/systemd/user"
python "$monitor_core/scripts/migrate.py"
python -m venv "$monitor_service_dir/.venv"
"$monitor_service_dir/.venv/bin/python" -m pip install --disable-pip-version-check -r "$monitor_core/requirements.txt"
monitor_python="$monitor_service_dir/.venv/bin/python"
for monitor_backend in monitor_service.py connectivity.py cava_audio.py terminal_sessions.py terminal_child.py; do
    install -m 644 "$monitor_core/backend/$monitor_backend" "$monitor_service_dir/$monitor_backend"
done
for monitor_retired in usage.py reset_news.py claude_statusline.py; do
    rm -f -- "$monitor_service_dir/$monitor_retired"
done
# Escape systemd's quoted ExecStart syntax, including specifier expansion.
monitor_quote() {
    python - "$1" <<'PY'
import sys
value = sys.argv[1].replace('\\', '\\\\').replace('"', '\\"').replace('%', '%%')
print('"' + value + '"')
PY
}
cat > "$monitor_config/systemd/user/monitor-dashboard.service" <<EOF
[Unit]
Description=someProducts-monitor desktop widget telemetry
After=graphical-session.target
PartOf=graphical-session.target

[Service]
Type=simple
ExecStart=$(monitor_quote "$monitor_python") $(monitor_quote "$monitor_service_dir/monitor_service.py")
WorkingDirectory=$monitor_working_folder
Restart=on-failure
RestartSec=5

[Install]
WantedBy=graphical-session.target
EOF
if test -d "$monitor_data/plasma/plasmoids/local.monitor.dashboard"; then
    kpackagetool6 --type Plasma/Applet --upgrade "$monitor_core/plasmoid"
else
    kpackagetool6 --type Plasma/Applet --install "$monitor_core/plasmoid"
fi
rm -f -- "$monitor_data/plasma/plasmoids/local.monitor.dashboard/contents/ui/UsageCard.qml" "$monitor_data/plasma/plasmoids/local.monitor.dashboard/contents/ui/ResetNewsCard.qml"
systemctl --user daemon-reload
systemctl --user enable monitor-dashboard.service
systemctl --user restart monitor-dashboard.service
printf '\nInstalled. Desktop → Edit Mode → Add Widgets → someProducts-monitor.\n'
printf 'Service: systemctl --user status monitor-dashboard.service\n'

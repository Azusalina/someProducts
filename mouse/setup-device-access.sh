#!/bin/bash
set -euo pipefail
if (( EUID != 0 )); then
    echo 'Run this setup through the GUI or sudo.' >&2
    exit 1
fi
install -d /etc/udev/rules.d
cat > /etc/udev/rules.d/70-g502x-mouse.rules <<'RULE'
# G502 X LIGHTSPEED receiver and wired mode: local active seat access only.
ACTION!="remove", SUBSYSTEM=="hidraw", ATTRS{idVendor}=="046d", ATTRS{idProduct}=="c547", TAG+="uaccess"
ACTION!="remove", SUBSYSTEM=="hidraw", ATTRS{idVendor}=="046d", ATTRS{idProduct}=="c098", TAG+="uaccess"
RULE
chmod 644 /etc/udev/rules.d/70-g502x-mouse.rules
udevadm control --reload-rules
udevadm trigger --action=change --subsystem-match=hidraw
echo 'G502 X access rule installed. Reconnect the receiver if necessary.'

# Proton VPN, Wi-Fi and Bluetooth

someProducts-monitor 1.2 adds **PROTON**, **WIFI** and **BLUETOOTH**. On an existing widget, enable them in **Settings → Modules**. All three can be hidden, reordered or split into separate someProducts-monitor instances. The default background remains fully transparent; optional color and opacity are set in Appearance.

## Keep the Proton GUI

The selected integration retains the official Proton GUI: the widget displays connection/server and configured Kill Switch mode, and **Open Proton ↗** opens or raises the app. Connect/disconnect in Proton; adjust Kill Switch in **Menu → Settings → Features**. The installed app has no supported command or D-Bus action for opening that settings subsection directly.

The installed official CLI refuses operation while the GUI is running. someProducts-monitor therefore does not invoke the CLI, terminate the GUI, or offer a direct VPN/Kill Switch toggle in this mode. This follows the user's explicit choice to retain the GUI.

Connection state is read from active NetworkManager VPN/WireGuard profiles whose name begins with `ProtonVPN`. This is a local profile-based indicator, not a public-IP or tunnel-health test. Manually renamed/imported profiles may not be recognized. Kill Switch is the configured setting read from `~/.config/Proton/VPN/settings.json` (XDG overrides respected), not an audit of live firewall rules. Unknown configuration is shown as **Unknown**. A `pvpn-killswitch-ipv6` dummy interface alone is IPv6 protection and does not establish that the standard Kill Switch is enabled.

Primary references: [Proton Linux CLI](https://protonvpn.com/support/use-linux-cli), [Kill Switch settings](https://protonvpn.com/support/what-is-kill-switch). GUI/CLI coexistence and available launch options were checked against this machine's installed Proton packages.

## Wi-Fi and Bluetooth settings

**WIFI** displays NetworkManager's wireless enabled state and active connection name. **Settings ↗** opens KDE's Network Connections page (`kcm_networkmanagement`).

**BLUETOOTH** displays whether any BlueZ adapter is powered and the names of connected devices. **Settings ↗** opens KDE's Bluetooth page (`kcm_bluetooth`). Adapter MAC addresses, device addresses and connection UUIDs are excluded from the dashboard snapshot.

These entries open native configuration pages; changes are made in those pages. Missing applications or unavailable system services are shown as unavailable. The launcher accepts only three fixed destinations, with no shell command input.

Runtime requirements: `networkmanager`/`nmcli`, BlueZ and the respective KDE settings modules. The installed machine has all of these and Proton GUI 4.18.2. A separate collector refreshes approximately every five seconds; observations older than twenty seconds show **Waiting for status**.

## Update and desktop placement

The local package and user service have been updated. If Plasma caches old QML and the new choices are missing, copy your note before removing and re-adding that instance. Add through desktop **Enter Edit Mode → Add Widgets → someProducts-monitor**, arrange it, then exit Edit Mode. The installer does not change desktop layout.

Evidence: `preview-connectivity.png`, `backend-tests.log`, `qml-tests.log`. State reads were checked against this machine. Launch destinations and button signals were tested without changing networking or opening extra settings windows; the resulting window presentation was not visually verified.

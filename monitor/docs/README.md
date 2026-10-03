# someProducts-monitor

## What is it?

A minimalist desktop dashboard with a fully transparent default background for Arch Linux, KDE Plasma 6 and Wayland.

## How to use

**Start now**

From `monitor/core`, open the preview with `./scripts/preview.sh`. If the installed service is not running, start the telemetry bridge in one terminal and the preview in another:

```bash
./scripts/start.sh
./scripts/preview.sh
```

The preview is a transparent Wayland window using the same dashboard as the desktop widget. Close it normally when finished. Stop the foreground bridge with Ctrl+C before installing the background service, since they use the same port.

**Install on the desktop**

```bash
./scripts/install.sh
```

This installs the widget under `~/.local/share/plasma/plasmoids/local.monitor.dashboard`, copies the telemetry bridge to `~/.local/share/monitor-dashboard`, and enables `monitor-dashboard.service` in the user systemd session. XDG data/config directory overrides are respected. It uses no root privileges and does not edit your desktop placement.

Right-click the desktop → **Enter Edit Mode** → **Add Widgets** → **someProducts-monitor**. Drag it into place and resize it with Plasma's native controls. Re-run the installer to update the widget and bridge. After an update, remove and re-add an existing widget if Plasma is still displaying its cached QML.

The generated `core/monitor.plasmoid` also works with Plasma's **Install Widget From Local File**. The telemetry bridge still needs to be started; the installer sets up both parts together.

Runtime dependencies on Arch: `plasma-workspace`, `qt6-declarative`, `kirigami`, `python`, `systemd`, `iputils`. `nvidia-utils` is optional for NVIDIA devices. The preview and development tests use the Qt 6 tools in `/usr/lib/qt6/bin` to avoid generic Qt launcher wrappers. Override `MONITOR_QT_BIN` if needed.

**Use and rearrange**

Right-click the widget → **someProducts-monitor Settings…** (Configure). The **Modules** page selects visible modules, chooses one to three columns, and reorders them by drag handles or arrows. The **Appearance** page sets text, border and background hex colors, border width and background opacity. The **Ping** page edits targets. Use **Apply** or **OK** to save; **Cancel** discards unapplied changes. Narrow widgets automatically use one column. The dashboard itself has no customization controls.

To split the dashboard into separate desktop pieces, add more someProducts-monitor widget instances. For example, leave CPU/RAM/GPU in one instance, media in another, and a note in a third. Each instance stores its own modules, order, text color, Ping targets and note. These settings are saved by Plasma and survive login/reboot. Recombine them by enabling the desired modules in one instance. Notes remain associated with their original widget; they are not automatically merged.

**Colors and configuration**

Open **Settings → Appearance** and enter a complete hex value such as `#aabbcc`. Set **Border width** above 0 to show an outline; set **Background opacity** above 0 to show its color. The default is 0% opacity with no border. Invalid input is flagged and does not replace the saved color. Text color may be left empty to use the original light/dark preference. See [CONFIGURATION.md](CONFIGURATION.md) for details.

In the standalone preview, right-click the dashboard or press **Ctrl+,** to open its separate settings window.

**Coding usage**

Version 1.1 adds Codex/Claude Code subscription allowances and a separate reset-news module. Enable **CODEX**, **CLAUDE** and **RESETS** in **Settings → Modules** on existing widgets. See [USAGE.md](USAGE.md) for live sources, reset timing, Claude integration and direct X API options.

**Ping labels and icons**

In **Settings → Ping**, enter one target per line and click **Apply**:

```text
Work | https://example.com | ◇
Router | 192.168.1.1 | network-wireless
Loopback | 127.0.0.1 | ⌂
```

The format is `label | URL or hostname | icon`. The icon may be a Unicode symbol/emoji or a KDE theme icon name such as `network-wireless`. A hostname alone is also accepted. Up to eight targets are shown. Labels sit beside the latency value. No target is preconfigured or contacted on your behalf. Valid configured targets are checked about every five seconds while a widget requests them.

**Check or remove**

```bash
systemctl --user status monitor-dashboard.service
journalctl --user -u monitor-dashboard.service -n 30
./scripts/uninstall.sh
```

**Connection controls and notes**

Enable **PROTON**, **WIFI** and **BLUETOOTH** in **Settings → Modules**; use their native settings entry points to manage connections. Proton VPN and Kill Switch changes happen in its GUI. See [CONNECTIVITY.md](CONNECTIVITY.md). Click the **NOTE** text area to type a local note. Use **Next GPU** or **Next player** when multiple sources are available, and Play/Pause to control a supported media player.

If the preview displays **Bridge offline**, run `./scripts/start.sh` from `monitor/core`.

See [description.md](description.md) for background and technical details.

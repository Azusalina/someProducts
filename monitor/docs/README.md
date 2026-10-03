# Monitor

A minimalist, fully transparent desktop dashboard for Arch Linux, KDE Plasma 6 and Wayland. The product lives in `core/`; design notes, verification logs and screenshots live in `docs/`. No Git commands were used.

Default compact size: **360 × 480**. Monitor is installed locally on this machine and its user service is running. Add it to the desktop with the steps below.

## Start now

From `monitor/core`, open the preview with `./scripts/preview.sh`. If the installed service is not running, start the telemetry bridge in one terminal and the preview in another:

```bash
./scripts/start.sh
./scripts/preview.sh
```

The preview is a transparent Wayland window using the same dashboard as the desktop widget. Close it normally when finished. Stop the foreground bridge with Ctrl+C before installing the background service, since they use the same port.

## Install on the desktop

```bash
./scripts/install.sh
```

This installs the widget under `~/.local/share/plasma/plasmoids/local.monitor.dashboard`, copies the telemetry bridge to `~/.local/share/monitor-dashboard`, and enables `monitor-dashboard.service` in the user systemd session. XDG data/config directory overrides are respected. It uses no root privileges and does not edit your desktop placement.

Right-click the desktop → **Enter Edit Mode** → **Add Widgets** → **Monitor**. Drag it into place and resize it with Plasma's native controls. Re-run the installer to update the widget and bridge. After an update, remove and re-add an existing widget if Plasma is still displaying its cached QML.

The generated `core/monitor.plasmoid` also works with Plasma's **Install Widget From Local File**. The telemetry bridge still needs to be started; the installer sets up both parts together.

Runtime dependencies on Arch: `plasma-workspace`, `qt6-declarative`, `kirigami`, `python`, `systemd`, `iputils`. `nvidia-utils` is optional for NVIDIA devices. The preview and development tests use the Qt 6 tools in `/usr/lib/qt6/bin` to avoid generic Qt launcher wrappers. Override `MONITOR_QT_BIN` if needed.

## Use and rearrange

Click **Customize** to select visible modules, choose one to three columns, switch between light/dark text, and reorder modules by dragging their handles or clicking the arrows. Narrow widgets automatically use one column.

To split the dashboard into separate desktop pieces, add more Monitor widget instances. For example, leave CPU/RAM/GPU in one instance, media in another, and a note in a third. Each instance stores its own modules, order, text color, Ping targets and note. These settings are saved by Plasma and survive login/reboot. Recombine them by enabling the desired modules in one instance. Notes remain associated with their original widget; they are not automatically merged.

The dashboard has no filled background, card surfaces, shadows or blur. The desktop wallpaper remains visible. Light text suits dark wallpaper; dark text suits light wallpaper. Native window frames, Plasma edit handles, and scrollbars are managed by Qt/Plasma independently of the transparent dashboard.

## Coding usage

Version 1.1 adds Codex/Claude Code subscription allowances and a separate reset-news module. Enable **CODEX**, **CLAUDE** and **RESETS** in Customize on existing widgets. See [USAGE.md](USAGE.md) for live sources, reset timing, Claude integration and direct X API options.

## Modules

- **PROTON / WIFI / BLUETOOTH:** connection/radio status and native settings entry points. Proton retains its GUI; VPN and Kill Switch changes happen there. Enable the new modules in Customize. See [CONNECTIVITY.md](CONNECTIVITY.md).

- **CPU:** total utilization, logical core count, available CPU temperature and approximately 80 seconds of history. The first sample is unknown until a second counter reading arrives.
- **RAM:** utilization and used/total GiB. Used RAM is total minus `MemAvailable`, so reclaimable caches are accounted for.
- **GPU:** device utilization where available, temperature and VRAM where exposed. NVIDIA uses `nvidia-smi`; AMD uses sysfs. Intel uses deduplicated DRM client engine counters readable by the current user. Intel's value is the busiest aggregated engine, capped at 100%, with the label **User-session engines**; it is not an all-users hardware counter. Missing values display **—**, not a fabricated zero. **Next GPU** appears when multiple devices are detected.
- **PING:** configurable target labels/icons and latency. Targets start empty. The service measures ICMP round-trip time to the URL's hostname, not HTTP page response time. A timeout can mean ICMP is blocked; it does not prove the website is down.
- **NOW PLAYING:** title, artist/source, playback state and a Play/Pause button. It uses the session MPRIS interface. When several players exist, a playing source is preferred and **Next player** lets you select another. Browser videos need Plasma Browser Integration or the browser's own MPRIS support; VLC and other MPRIS-capable players also work. No video frames are embedded. Buttons are disabled when a player does not permit control.
- **NOTE:** click directly into the text area, type plain text, and leave it on the desktop. Changes save after 400 ms and on focus loss. Your normal KDE keyboard/input-method support handles input. Notes are stored locally in the widget's Plasma configuration.

## Ping labels and icons

In **Customize**, enter one target per line and click **Apply targets**:

```text
Work | https://example.com | ◇
Router | 192.168.1.1 | network-wireless
Loopback | 127.0.0.1 | ⌂
```

The format is `label | URL or hostname | icon`. The icon may be a Unicode symbol/emoji or a KDE theme icon name such as `network-wireless`. A hostname alone is also accepted. Up to eight targets are shown. Labels sit beside the latency value. No target is preconfigured or contacted on your behalf. Valid configured targets are checked about every five seconds while a widget requests them.

## Widget catalog folders

- User-installed widgets: `~/.local/share/plasma/plasmoids/` (this machine: `/home/a/.local/share/plasma/plasmoids/`).
- System widgets: `/usr/share/plasma/plasmoids/`.
- Monitor source: `monitor/core/plasmoid/`.
- Installed Monitor: `~/.local/share/plasma/plasmoids/local.monitor.dashboard/`.

The user is handling cleanup manually. To identify an unfamiliar user widget, read its `metadata.json` and `KPlugin.Name`. Removing a custom widget via Add Widgets → Uninstall is preferable to deleting folders while Plasma has it loaded. System widgets belong to installed packages.

## Check or remove

```bash
systemctl --user status monitor-dashboard.service
journalctl --user -u monitor-dashboard.service -n 30
./scripts/uninstall.sh
```

For a development preview, **Bridge offline** means `./scripts/start.sh` is not running. The bridge listens only on `127.0.0.1:17341`. It accepts native widget requests with a custom header and rejects browser Origin headers and foreign Host headers. It exposes telemetry, validated MPRIS PlayPause, and three fixed native settings launch destinations. Notes never pass through the HTTP bridge. Subscription and reset-news collectors use the account/public services described in [USAGE.md](USAGE.md); Monitor has no hosted database.

## Validation

```bash
./scripts/verify.sh
./scripts/package.sh
```

The verification script runs backend tests, real QML interaction tests and an isolated MPRIS fixture. It reuses a running Monitor bridge or starts/stops a temporary one. The fixture never plays media or controls your real players. Test-only dependencies: `plasma-sdk`, `python-dbus`, `python-gobject`, `python-pillow`.

See `VALIDATION.md` for tested behavior and remaining hardware-specific limits. `preview-transparent.png` and `preview-customize.png` are exported RGBA images; transparent pixels may appear black in some viewers. Screenshots contain a clearly named integration-test media fixture and a local test Ping target, not a default target or real video.

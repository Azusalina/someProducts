# someProducts-monitor — Description

A minimalist desktop dashboard with a fully transparent default background for Arch Linux, KDE Plasma 6 and Wayland. The product lives in `core/`; design notes, verification logs and screenshots live in `docs/`. No Git commands were used.

Default compact size: **360 × 480**. someProducts-monitor is installed locally on this machine and its user service is running. Add it to the desktop with the steps below.

The dashboard defaults to no filled background or border, with no card surfaces, shadows or blur. **Settings → Appearance** accepts `#rrggbb` text, border and background colors. Background opacity 0% and border width 0 preserve full transparency; raise these values for a colored board or outline. Native window frames, Plasma edit handles and scrollbars remain managed by Qt/Plasma.

## Modules

- **PROTON / WIFI / BLUETOOTH:** connection/radio status and native settings entry points. Proton retains its GUI; VPN and Kill Switch changes happen there. Enable the new modules in **Settings → Modules**. See [CONNECTIVITY.md](CONNECTIVITY.md).

- **CPU:** total utilization, logical core count, available CPU temperature and approximately 80 seconds of history. The first sample is unknown until a second counter reading arrives.
- **RAM:** utilization and used/total GiB. Used RAM is total minus `MemAvailable`, so reclaimable caches are accounted for.
- **GPU:** device utilization where available, temperature and VRAM where exposed. NVIDIA uses `nvidia-smi`; AMD uses sysfs. Intel uses deduplicated DRM client engine counters readable by the current user. Intel's value is the busiest aggregated engine, capped at 100%, with the label **User-session engines**; it is not an all-users hardware counter. Missing values display **—**, not a fabricated zero. **Next GPU** appears when multiple devices are detected.
- **PING:** configurable target labels/icons and latency. Targets start empty. The service measures ICMP round-trip time to the URL's hostname, not HTTP page response time. A timeout can mean ICMP is blocked; it does not prove the website is down.
- **NOW PLAYING:** title, artist/source, playback state and a Play/Pause button. It uses the session MPRIS interface. When several players exist, a playing source is preferred and **Next player** lets you select another. Browser videos need Plasma Browser Integration or the browser's own MPRIS support; VLC and other MPRIS-capable players also work. No video frames are embedded. Buttons are disabled when a player does not permit control.
- **NOTE:** click directly into the text area, type plain text, and leave it on the desktop. Changes save after 400 ms and on focus loss. Your normal KDE keyboard/input-method support handles input. Notes are stored locally in the widget's Plasma configuration.

## Widget catalog folders

- User-installed widgets: `~/.local/share/plasma/plasmoids/` (this machine: `/home/a/.local/share/plasma/plasmoids/`).
- System widgets: `/usr/share/plasma/plasmoids/`.
- someProducts-monitor source: `monitor/core/plasmoid/`.
- Installed someProducts-monitor: `~/.local/share/plasma/plasmoids/local.monitor.dashboard/`.

The user is handling cleanup manually. To identify an unfamiliar user widget, read its `metadata.json` and `KPlugin.Name`. Removing a custom widget via Add Widgets → Uninstall is preferable to deleting folders while Plasma has it loaded. System widgets belong to installed packages.

For a development preview, **Bridge offline** means `./scripts/start.sh` is not running. The bridge listens only on `127.0.0.1:17341`. It accepts native widget requests with a custom header and rejects browser Origin headers and foreign Host headers. It exposes telemetry, validated MPRIS PlayPause, and three fixed native settings launch destinations. Notes never pass through the HTTP bridge. Subscription and reset-news collectors use the account/public services described in [USAGE.md](USAGE.md); someProducts-monitor has no hosted database.

## Validation

```bash
./scripts/verify.sh
./scripts/package.sh
```

The verification script runs backend tests, real QML interaction tests and an isolated MPRIS fixture. It reuses a running someProducts-monitor bridge or starts/stops a temporary one. The fixture never plays media or controls your real players. Test-only dependencies: `plasma-sdk`, `python-dbus`, `python-gobject`, `python-pillow`, `pyside6`.

See `VALIDATION.md` for tested behavior and remaining hardware-specific limits. `preview-transparent.png` is an RGBA export of the default dashboard; `preview-colored.png` shows a colored background and outline. The `preview-config-*.png` images show the separate configuration pages. Transparent pixels may appear black in some viewers. Screenshots contain a clearly named integration-test media fixture and a local test Ping target, not a default target or real video.

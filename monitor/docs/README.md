# someProducts-monitor

## What is it?

A minimalist desktop dashboard with a fully transparent default background for Arch Linux, KDE Plasma 6 and Wayland.

## How to use

**Start now**

From `monitor/core`, open the preview with `./scripts/preview.sh`. If the installed service is not running, start the telemetry bridge in one terminal and the preview in another:

```bash
./scripts/setup.sh     # first source checkout: prepare Python dependencies
./scripts/start.sh
./scripts/preview.sh
```

The preview is a transparent Wayland window using the same dashboard as the desktop widget. Close it normally when finished. Stop the foreground bridge with Ctrl+C before installing the background service, since they use the same port.

**Install on the desktop**

```bash
./scripts/install.sh
```

This installs the widget under `~/.local/share/plasma/plasmoids/local.monitor.dashboard`, copies the telemetry bridge to `~/.local/share/monitor-dashboard`, and enables `monitor-dashboard.service` in the user systemd session. XDG data/config directory overrides are respected. It uses no root privileges and does not edit your desktop placement.

Right-click the desktop → **Enter Edit Mode** → **Add Widgets** → **someProducts-monitor**. Drag it into place and resize it with Plasma's native controls. Re-run the installer to update the widget and bridge. If an existing instance still shows the old interface, run `python scripts/refresh-desktop.py` from `monitor/core`. It privately backs up this widget's settings and restarts the Plasma desktop shell, preserving instance settings and placement. The desktop and panel briefly reload. `--reveal-media-terminal` also places Media immediately after Terminal in existing module orders. `--reveal-power-timers` enables Battery and Timers while retaining other module selections.

The generated `core/monitor.plasmoid` also works with Plasma's **Install Widget From Local File**. The telemetry bridge still needs to be started; the installer sets up both parts together.

Runtime dependencies on Arch: `plasma-workspace`, `qt6-declarative`, `kirigami`, `python`, `systemd`, `iputils`. Battery data requires `upower`; power modes require `power-profiles-daemon`. Keep awake uses Plasma PowerDevil. For the audio background, install `cava` and `libpulse` (`pactl`) with an active PulseAudio-compatible server such as `pipewire-pulse`. `nvidia-utils` is optional for NVIDIA devices. The setup/installer downloads pinned `pyte`, `wcwidth` and `dbus-next` packages into a local Python virtual environment. The preview and development tests use the Qt 6 tools in `/usr/lib/qt6/bin`; override `MONITOR_QT_BIN` if needed.

**Use and rearrange**

Version 1.5 uses smooth graphs for CPU/RAM/GPU/Ping, with 9 px values in the upper-right corner. Hover for hardware details or Ping status. CAVA is a flowing background curve. The default widget is **300 × 360**; a stats-and-media composition fits about **300 × 220**. In Edit Mode, resize existing instances with Plasma's handles; saved desktop sizes are preserved during updates. Curves build from actual samples after opening.

Right-click the widget → **someProducts-monitor Settings…** (Configure). **Modules** selects visible modules, one to three columns, and their order. **Appearance** sets hex colors, border width and background opacity. **Flow colors** independently sets CPU, RAM, GPU, Ping and CAVA curve colors using `#rrggbb`; empty fields follow the dashboard color. **Ping** edits targets. **Media** selects a player and CAVA visibility/opacity; **Terminal** sets terminal height and font size. **Timers** sets countdown duration, stopwatch starting time, independent hex colors and Minimal/Digital/Ring styles. Use **Apply** or **OK** to save; **Cancel** discards unapplied changes. Narrow widgets automatically use one column.

CPU/RAM/GPU/Ping sample about every **0.5 seconds**; slower Ping replies take longer. Wi-Fi and Bluetooth share a row whenever both are enabled and at least 230 px of content width is available, including in a single-column dashboard. Hide either module to display the other independently.

To split the dashboard into separate desktop pieces, add more someProducts-monitor widget instances. For example, leave CPU/RAM/GPU in one instance, media in another, and a note in a third. Each instance stores its own modules, order, text color, Ping targets and note. These settings are saved by Plasma and survive login/reboot. Recombine them by enabling the desired modules in one instance. Notes remain associated with their original widget; they are not automatically merged.

**Colors and configuration**

Open **Settings → Appearance** and enter a complete hex value such as `#aabbcc`. Set **Border width** above 0 to show an outline; set **Background opacity** above 0 to show its color. The default is 0% opacity with no border. Invalid input is flagged and does not replace the saved color. Text color may be left empty to use the original light/dark preference. See [CONFIGURATION.md](CONFIGURATION.md) for details.

In the standalone preview, right-click the dashboard or press **Ctrl+,** to open its separate settings window.

**Media and terminal**

The media element shows only a progress bar and Pause/Resume button. Its CAVA background reacts to system playback audio, using the default output's monitor source. It does not use microphone input. Configure a preferred player in **Settings → Media**; browser playback requires MPRIS support or Plasma Browser Integration. CAVA's default opacity is now 40%; adjust it on that page. Scroll to modules below the viewport when using a small single-column widget.

Enable **TERMINAL** in **Settings → Modules**, then click **Start terminal** on the dashboard. Click its output to focus and type shell commands. Use **Ctrl+C** to interrupt, **Ctrl+Shift+V** to paste, **Ctrl+Shift+C** to copy the visible screen, and the wheel for scrollback. Each widget has its own session. Disabling the terminal or removing its widget closes that shell; rearranging modules keeps it running. The shell starts inside `monitor/`. Bash starts without profile/rc files. This is a compact terminal; see [description.md](description.md) for its limits.

Version 1.4 removes the Codex, Claude Code and reset-news modules and their background collectors. Existing notes and other instance settings are preserved.

**Battery and timers**

Enable **Battery** and **Timers** in Configure → Modules; scroll down to them if the widget is small. Battery shows charge percentage, charging/discharging power in watts and the available remaining-time estimate. **Powersave / Regular / Performance** choose the system power profile; Regular corresponds to Balanced. Unsupported modes are disabled. **Keep awake · On** prevents automatic sleep, screen off and idle locking while this widget remains active. Plasma takes about five seconds to activate this request; **Applying…** becomes **On** after confirmation. Click again to release it. Hiding Battery, removing the widget or stopping the bridge also releases its request.

The left countdown and right stopwatch each have Start/Pause and Reset buttons. Set times (seconds, up to 86400), colors (`#aabbcc`, or empty for the text color) and styles in **Configure → Timers**, then Apply. A new time resets and pauses that timer; changing colors/styles keeps its progress. Countdown displays **Done** at zero. Ring uses remaining countdown time or a repeating 60-second stopwatch sweep. Reordering modules keeps both timers running. Hiding Timers resets them; settings persist, live timer progress does not survive a bridge or desktop shell restart.

**Ping labels and icons**

In **Settings → Ping**, enter one target per line and click **Apply**:

```text
Work | https://example.com | ◇
Colored | https://example.org | ◇ | #66aaff
Router | 192.168.1.1 | network-wireless
Loopback | 127.0.0.1 | ⌂
```

The format is `label | URL or hostname | icon | optional #rrggbb`. The optional fourth field gives that target's curve its own color; otherwise it follows the Ping color from Flow colors. The icon may be a Unicode symbol/emoji or a KDE theme icon name such as `network-wireless`. A hostname alone is also accepted. Up to eight targets are shown. Labels sit beside the latency value. No target is preconfigured or contacted on your behalf. Valid configured targets are checked about every 0.5 seconds while a widget requests them; a pending probe is never duplicated.

**Check or remove**

```bash
systemctl --user status monitor-dashboard.service
journalctl --user -u monitor-dashboard.service -n 30
./scripts/uninstall.sh
```

**Connection controls and notes**

Enable **PROTON**, **WIFI** and **BLUETOOTH** in **Settings → Modules**; use their native settings entry points to manage connections. Proton is a compact transparent button with animated hover/press feedback and a pulsing connected indicator. Hover for server and Kill Switch status; click to open its GUI. VPN and Kill Switch changes happen there. See [CONNECTIVITY.md](CONNECTIVITY.md). Click the **NOTE** text area to type a local note. Use **Next GPU** when multiple GPUs are available.

If the preview displays **Bridge offline**, run `./scripts/start.sh` from `monitor/core`.

See [description.md](description.md) for background and technical details.

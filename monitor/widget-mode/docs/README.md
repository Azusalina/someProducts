# someProducts-monitor

## What is it?

A minimalist desktop dashboard with a fully transparent default background for Arch Linux, KDE Plasma 6 and Wayland.

## How to use

**Start now**

From `monitor/widget-mode/core`, open the preview with `./scripts/preview.sh`. If the installed service is not running, start the telemetry bridge in one terminal and the preview in another:

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

Right-click the desktop → **Enter Edit Mode** → **Add Widgets** → **someProducts-monitor**. Drag it into place and resize it with Plasma's native controls. Re-run the installer to update the widget and bridge. If an existing instance still shows the old interface, run `python scripts/refresh-desktop.py` from `monitor/widget-mode/core`. It privately backs up this widget's settings and restarts the Plasma desktop shell, preserving instance settings and placement. The desktop and panel briefly reload. `--reveal-media-terminal` also places Media immediately after Terminal in existing module orders. `--reveal-power-timers` enables Battery and Timers while retaining other module selections.

The generated `core/monitor.plasmoid` also works with Plasma's **Install Widget From Local File**. The telemetry bridge still needs to be started; the installer sets up both parts together.

Runtime dependencies on Arch: `plasma-workspace`, `qt6-declarative`, `kirigami`, `python`, `systemd`, `iputils`. Battery data requires `upower`; power modes require `power-profiles-daemon`. Keep awake uses Plasma PowerDevil. For the audio background, install `cava` and `libpulse` (`pactl`) with an active PulseAudio-compatible server such as `pipewire-pulse`. `nvidia-utils` is optional for NVIDIA devices. The setup/installer downloads pinned `pyte`, `wcwidth` and `dbus-next` packages into a local Python virtual environment. The preview and development tests use the Qt 6 tools in `/usr/lib/qt6/bin`; override `MONITOR_QT_BIN` if needed.

**Use and rearrange**

Version 1.5 uses smooth graphs for CPU/RAM/GPU/Ping, with 9 px values in the upper-right corner. Hover for hardware details or Ping status. CAVA is a flowing background curve. The default widget is **300 × 360**; a stats-and-media composition fits about **300 × 220**. In Edit Mode, resize existing instances with Plasma's handles; saved desktop sizes are preserved during updates. Curves build from actual samples after opening.

Right-click the widget → **someProducts-monitor Settings…** (Configure). **Modules** selects visible modules, one to three columns, and their order. **Appearance** sets hex colors, border width and background opacity. **Flow colors** independently sets CPU, RAM, GPU, Ping and CAVA curve colors using `#rrggbb`; empty fields follow the dashboard color. **Ping** edits targets. **Media** selects a player and CAVA visibility/opacity; **Terminal** sets terminal height and font size. **Timers** sets countdown duration, stopwatch starting time, independent hex colors and Minimal/Digital/Ring styles. **To-do lists** customizes the lists below Note. **Config file** opens the saved JSON file and selects a named profile. Use **Apply** or **OK** to save; **Cancel** discards unapplied changes. Narrow widgets automatically use one column.

CPU/RAM/GPU/Ping sample about every **0.5 seconds**; slower Ping replies take longer. Wi-Fi and Bluetooth share a row whenever both are enabled and at least 230 px of content width is available, including in a single-column dashboard. Hide either module to display the other independently.

To split the dashboard into separate desktop pieces, add more someProducts-monitor widget instances. For example, leave CPU/RAM/GPU in one instance, media in another, and a note in a third. Choose a different **Configure → Config file → Profile name** for each split widget (for example, `stats`, `media`, `note`). A new profile copies that widget's current settings. Each profile retains its own modules, order, text color, Ping targets and note across removal/re-adding and login/reboot. Widgets using the same profile share settings; new widgets start with `default`. Recombine them by enabling the desired modules in one profile. Notes from different profiles are not automatically merged.

**Saved config file**

The default profile is `~/.config/someProducts-monitor/config.json`; named profiles use `~/.config/someProducts-monitor/profiles/<name>.json`. `XDG_CONFIG_HOME` overrides `~/.config`. Open the file using **Configure → Config file → Open config file**, or edit it in your own editor. Save valid JSON to reload settings automatically within about one second. Configure **Apply/OK**, inline timer confirmation and note edits also update the file automatically, normally within 250–500 ms; allow the save to finish before closing the component. Removing the widget or uninstalling the product retains these files. Adding the widget again restores the default profile; choose a previous named profile on its Configure page to restore that profile.

Files have `"version": 1` and a `"settings"` object. Edit the supplied keys, using `#aabbcc` colors, seconds for time presets, and `minimal`, `digital` or `ring` for styles. See [../core/config.example.json](../core/config.example.json) for all fields. Missing settings use defaults; invalid JSON, unknown keys and invalid values leave the file untouched and keep the widget's current settings. The Config file page shows validation status. Conflicting manual file edits take priority over simultaneous widget edits to the same setting. Saved settings include notes and Ping targets, but exclude desktop placement, running timer progress, terminal sessions, VPN state and keep-awake. The standalone preview still uses separate preview settings.

**Colors and configuration**

Open **Settings → Appearance** and enter a complete hex value such as `#aabbcc`. Set **Border width** above 0 to show an outline; set **Background opacity** above 0 to show its color. The default is 0% opacity with no border. Invalid input is flagged and does not replace the saved color. Text color may be left empty to use the original light/dark preference. See [CONFIGURATION.md](CONFIGURATION.md) for details.

In the standalone preview, right-click the dashboard or press **Ctrl+,** to open its separate settings window.

**Media and terminal**

The media element shows only a progress bar and Pause/Resume button. Its CAVA background reacts to system playback audio, using the default output's monitor source. It does not use microphone input. Configure a preferred player in **Settings → Media**; browser playback requires MPRIS support or Plasma Browser Integration. CAVA's default opacity is now 40%; adjust it on that page. Scroll to modules below the viewport when using a small single-column widget.

Enable **TERMINAL** in **Settings → Modules**, then click **Start terminal** on the dashboard. Click its output to focus and type shell commands. Use **Ctrl+C** to interrupt, **Ctrl+Shift+V** to paste, **Ctrl+Shift+C** to copy the visible screen, and the wheel for scrollback. Each widget has its own session. Disabling the terminal or removing its widget closes that shell; rearranging modules keeps it running. The shell starts inside `monitor/`. Bash uses the native Arch-style `[user@hostname directory]$` prompt with the real user/host and current directory. It starts without profile/rc files. This is a compact terminal; see [description.md](description.md) for its limits.

Version 1.4 removes the Codex, Claude Code and reset-news modules and their background collectors. Existing notes and other instance settings are preserved.

**Battery and timers**

Enable **Battery** and **Timers** in Configure → Modules; scroll down to them if the widget is small. Battery shows charge percentage, charging/discharging power in watts and the available remaining-time estimate. **Powersave / Regular / Performance** choose the system power profile; Regular corresponds to Balanced. Unsupported modes are disabled. **Keep awake · On** prevents automatic sleep, screen off and idle locking while this widget remains active. Plasma takes about five seconds to activate this request; **Applying…** becomes **On** after confirmation. Click again to release it. Hiding Battery, removing the widget or stopping the bridge also releases its request.

When both Battery and Timers are enabled, battery controls form the left column; the stopwatch is above the countdown in the right column. Hide either module to show the other independently. Each timer has Start/Pause and Reset buttons. Click its time to enter `HH:MM:SS`, then press **Enter** to confirm and save. Countdown also accepts 1–6 digits without colons, grouped from the right as HHMMSS: `23000` → `02:30:00`, `2935` → `00:29:35`, `5` → `00:00:05`; **Escape** or clicking elsewhere cancels. Confirmation resets and pauses that timer, including when the entered time matches its saved preset. Invalid times stay in the editor with a range hint. Set times (seconds, up to 86400), colors (`#aabbcc`, or empty for the text color) and styles in **Configure → Timers**, then Apply. A new time resets and pauses that timer; changing colors/styles keeps its progress. At zero, countdown displays **Done** and its area blinks. With the countdown or widget focused, **Enter** (including keypad Enter) stops blinking and restores the saved countdown time, paused. Enter in the time editor still confirms its input; note and terminal input keep their normal behavior. Ring uses remaining countdown time or a repeating 60-second stopwatch sweep. Reordering modules keeps both timers running. Hiding Timers resets them; settings persist, live timer progress does not survive a bridge or desktop shell restart.

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

**To-do lists**

The Note module now places two equal-width lists directly below the note, separated by a vertical line. Their default titles are **pending** (left) and **urgent** (right). Click the button before a task to mark it done: the text gains a strikethrough and dims. Click again to reopen it. Completion state saves automatically to the current Profile and survives removing/re-adding the widget.

Open **Configure → To-do lists** to edit each side's tasks (one per line), titles, independent `#rrggbb` colors (empty follows dashboard text), font size, list height and visibility. Use **Apply/OK** to save; **Cancel** discards drafts. Unchanged task text retains completion, including duplicated task text; renamed or newly added tasks start unfinished. Each side supports up to 100 tasks, 300 characters per task. Both sides remain adjacent at narrow widget widths and scroll independently. Hiding Note hides this attached section; disable only the lists on their Configure page if desired. Notes retain their existing Save-to-file and drag-height controls.

**Connection controls and notes**

Enable **PROTON**, **WIFI** and **BLUETOOTH** in **Settings → Modules**; Wi-Fi and Bluetooth show status without Settings buttons; manage them through Plasma's native tray/settings. Proton is a compact transparent button with animated hover/press feedback and a pulsing connected indicator. Hover for server and Kill Switch status; click to open its GUI. VPN and Kill Switch changes happen there. See [CONNECTIVITY.md](CONNECTIVITY.md). Click the **NOTE** text area to type a local note. Drag its bottom border up/down to change the note height (48–800 px); releasing it saves the height in the current profile. Longer notes scroll inside this area. Click **Save** in the note heading's top-right corner to choose a destination folder and filename using the Save dialog; the last destination is remembered. Confirm an existing filename in the dialog to overwrite it, or Cancel to leave the file untouched. Export writes the current note as UTF-8 plain text; editing the note still automatically saves its text to the profile separately. Hover Save to see the export result or destination. Use **Next GPU** when multiple GPUs are available.

If the preview displays **Bridge offline**, run `./scripts/start.sh` from `monitor/widget-mode/core`.

See [description.md](description.md) for background and technical details.

Type in either to-do list's **Add task · Enter** field and press Enter to create an item. Click an item's text to edit; Enter confirms, Escape cancels, and Delete removes the item being edited. Completion survives a text edit. Drag rectangular panel borders to adjust height, shared column boundaries to adjust width, and the pending/urgent divider to adjust their split. Outer borders resize the native Plasma widget; minimum sizes prevent panel overlap/collapse. Internal layout sizes save with the current Profile; native outer placement stays in Plasma.

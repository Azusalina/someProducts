# someProducts-monitor core

## What is it?

A transparent modular KDE Plasma 6 desktop widget.

## How to use

```bash
./scripts/setup.sh      # first checkout: local Python dependencies
./scripts/start.sh      # foreground telemetry bridge
./scripts/preview.sh    # separate terminal: transparent Wayland preview
./scripts/install.sh    # optional persistent local install
```

Run these commands from `monitor/widget-mode/core`. Start the bridge and preview in separate terminals. Stop the foreground bridge with Ctrl+C before installing the background service. After installation, add **someProducts-monitor** through the desktop's **Add Widgets** menu. See [../docs/README.md](../docs/README.md) for dependencies, configuration, service checks and removal.

Build/install prerequisites on Arch: `base-devel`, `cmake`, `qt6-declarative`, `kglobalaccel` and `libplasma` (in addition to the existing runtime dependencies). Packaging and installation build the native KDE integration with `scripts/build-native.sh`; rebuild it after a Qt/Plasma upgrade.

In **Configure → Flows**, set **CPU / RAM / GPU / Ping (ms)** to 100–5000ms (default 200ms), and **CAVA (ms)** to 50–1000ms (default 100ms). **History window (seconds)** sets the visible CPU/RAM/GPU/Ping time range, from 5–120 seconds (default 30); a larger range scrolls more slowly, independently of the refresh interval. These are target intervals; slow GPU/Ping probes can limit the achieved rate. Smaller values refresh faster; Apply saves them to the current profile, including detached widgets and fullscreen audio backgrounds. Multiple views share the fastest active hardware rate while displaying at their own intervals. System metrics and ping default to **200ms** (5 Hz), with timestamped history that scrolls horizontally. Recorded peaks retain their heights; Ping uses a stable automatic scale with headroom. Slow/failed ping probes remain bounded and do not overlap. Approximate measured memory budget for one full widget plus bridge/helpers: **60–100 MiB**, depending on terminal contents and detached views; see [description.md](description.md) for measurement limits.

With Timers enabled, default global fullscreen shortcuts are **Meta+Ctrl+Alt+C** (countdown) and **Meta+Ctrl+Alt+S** (stopwatch). Change or clear them in **Configure → Timers**, then Apply. Conflicts are reported on the widget and existing shortcuts are not replaced. Global registration is available in the installed Plasma widget.

Drag a panel’s **⠿** handle outside the main widget to create an independent native desktop widget. Combined Battery/Timers and Wi-Fi/Bluetooth rows expose one handle per module. Hold a detached widget’s non-interactive surface or its **⠿** handle for about **0.45 seconds**, then drag to move it freely without grid/edge snapping or an edit-mode frame; the pointer keeps its original grab offset. Release to save its position; drop it inside its original main widget to merge it back into the configured order. Positions survive Plasma restarts; appearance, notes and tasks share the original profile. Timers, terminal and power controls share their main widget’s runtime owners during splitting/merging. Unlock desktop widgets if needed. Note and its two to-do columns travel together. Preview mode cannot create native desktop widgets.

Configure → Modules enables Battery and Timers. Battery controls the system power profile and automatic sleep/screen-off inhibition. Configure → Timers sets countdown and stopwatch times, colors and styles. Click either dashboard time to enter HH:MM:SS and press Enter. Countdown also accepts digits without colons: 23000 → 02:30:00, 2935 → 00:29:35. At zero, the countdown area blinks; with countdown/widget focused, Enter stops blinking and resets it to its saved time, paused. Both clocks display **HH:MM:SS.mmm**; editing still uses whole-second HH:MM:SS (countdown also accepts digits). Click either clock header’s **⛶** button to enter fullscreen **Focus Mode**. Click the time to edit; Start/Pause/Reset and completion blinking work there too. In fullscreen, press **Space** to start/pause; the larger **Paused / Running / Done** label shows the current status. Space does not control the countdown while editing its time. Press **Esc** or **Exit** to return to the desktop; the same clock continues without resetting. Focus Mode uses a dark background and the selected clock’s configured color/style. Move the mouse to reveal a bottom-right media progress/play-pause control; it hides after 3 seconds of inactivity and stays visible while hovered. The background breathes with system playback audio. Configure → Media controls CAVA visibility/opacity; Configure → Flows controls its color. Quiet audio is amplified visually, including playback from apps without MPRIS support. With both Battery and Timers enabled, battery sits left and stopwatch/countdown stack on the right.

Drag the note's bottom border to resize its height; the current profile remembers it. Click **Save** in the note's top-right corner to choose a folder and filename and export UTF-8 text.

Configure → Config file opens `~/.config/someProducts-monitor/config.json`. Settings save automatically after Apply/OK and reload when you add the widget again; valid manual JSON edits reload automatically. Use distinct profile names for split widgets; named files live under `~/.config/someProducts-monitor/profiles/`. The preview retains its separate preview settings.

Below Note, the left **pending** and right **urgent** lists have completion buttons; clicking toggles strikethrough and saves the state. **Configure → To-do lists** edits tasks (one per line), titles, colors, font size, height and visibility. Click Apply/OK to save to the current Profile.

See [description.md](description.md) for background and technical details.

Type in either to-do list's **Add task · Enter** field and press Enter to create an item. Click an item's text to edit; Enter confirms, Escape cancels, and Delete removes the item being edited. Completion survives a text edit. Drag rectangular panel borders to adjust height, shared column boundaries to adjust width, and the pending/urgent divider to adjust their split. Outer borders resize the native Plasma widget; minimum sizes prevent panel overlap/collapse. Internal layout sizes save with the current Profile; native outer placement stays in Plasma.

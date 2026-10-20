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

Configure → Modules enables Battery and Timers. Battery controls the system power profile and automatic sleep/screen-off inhibition. Configure → Timers sets countdown and stopwatch times, colors and styles. Click either dashboard time to enter HH:MM:SS and press Enter. Countdown also accepts digits without colons: 23000 → 02:30:00, 2935 → 00:29:35. At zero, the countdown area blinks; with countdown/widget focused, Enter stops blinking and resets it to its saved time, paused. Both clocks display **HH:MM:SS.mmm**; editing still uses whole-second HH:MM:SS (countdown also accepts digits). Click either clock header’s **⛶** button to enter fullscreen **Focus Mode**. Click the time to edit; Start/Pause/Reset and completion blinking work there too. In fullscreen, press **Space** to start/pause; the larger **Paused / Running / Done** label shows the current status. Space does not control the countdown while editing its time. Press **Esc** or **Exit** to return to the desktop; the same clock continues without resetting. Focus Mode uses a dark background and the selected clock’s configured color/style. With both Battery and Timers enabled, battery sits left and stopwatch/countdown stack on the right.

Drag the note's bottom border to resize its height; the current profile remembers it. Click **Save** in the note's top-right corner to choose a folder and filename and export UTF-8 text.

Configure → Config file opens `~/.config/someProducts-monitor/config.json`. Settings save automatically after Apply/OK and reload when you add the widget again; valid manual JSON edits reload automatically. Use distinct profile names for split widgets; named files live under `~/.config/someProducts-monitor/profiles/`. The preview retains its separate preview settings.

Below Note, the left **pending** and right **urgent** lists have completion buttons; clicking toggles strikethrough and saves the state. **Configure → To-do lists** edits tasks (one per line), titles, colors, font size, height and visibility. Click Apply/OK to save to the current Profile.

See [description.md](description.md) for background and technical details.

Type in either to-do list's **Add task · Enter** field and press Enter to create an item. Click an item's text to edit; Enter confirms, Escape cancels, and Delete removes the item being edited. Completion survives a text edit. Drag rectangular panel borders to adjust height, shared column boundaries to adjust width, and the pending/urgent divider to adjust their split. Outer borders resize the native Plasma widget; minimum sizes prevent panel overlap/collapse. Internal layout sizes save with the current Profile; native outer placement stays in Plasma.

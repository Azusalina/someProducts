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

Run these commands from `monitor/core`. Start the bridge and preview in separate terminals. Stop the foreground bridge with Ctrl+C before installing the background service. After installation, add **someProducts-monitor** through the desktop's **Add Widgets** menu. See [../docs/README.md](../docs/README.md) for dependencies, configuration, service checks and removal.

Configure → Modules enables Battery and Timers. Battery controls the system power profile and automatic sleep/screen-off inhibition. Configure → Timers sets countdown and stopwatch times, colors and styles. Click either dashboard time to enter HH:MM:SS and press Enter. Countdown also accepts digits without colons: 23000 → 02:30:00, 2935 → 00:29:35. At zero, the countdown area blinks; with countdown/widget focused, Enter stops blinking and resets it to its saved time, paused. With both Battery and Timers enabled, battery sits left and stopwatch/countdown stack on the right.

Drag the note's bottom border to resize its height; the current profile remembers it. Click **Save** in the note's top-right corner to choose a folder and filename and export UTF-8 text.

Configure → Config file opens `~/.config/someProducts-monitor/config.json`. Settings save automatically after Apply/OK and reload when you add the widget again; valid manual JSON edits reload automatically. Use distinct profile names for split widgets; named files live under `~/.config/someProducts-monitor/profiles/`. The preview retains its separate preview settings.

See [description.md](description.md) for background and technical details.

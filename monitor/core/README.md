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

Configure → Modules enables Battery and Timers. Battery controls the system power profile and automatic sleep/screen-off inhibition. Configure → Timers sets the left countdown and right stopwatch times, colors and styles.

See [description.md](description.md) for background and technical details.

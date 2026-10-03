# monitor-cli

## What is it?

A standalone Linux terminal version of Monitor. Type `monitor-cli` to turn your current terminal into a live dashboard with CPU, RAM, GPU, ping, media playback/audio, connectivity and notes. Quit to return to your shell. See [description.md](description.md) for architecture, limitations and development details.

## How to use

Requires **Linux and Python 3.11+ with curses**. No Python packages, Plasma session or Monitor bridge are required. Optional tools enable individual features: `ping` (iputils), `busctl` (MPRIS/BlueZ), `nmcli` (Wi-Fi/Proton), and `cava` plus `pactl` (playback spectrum). GPU tools such as `nvidia-smi` are used when available.

From this directory:

```bash
./monitor-cli                     # run directly, without installing
./scripts/install.sh              # installs into ~/.local; no sudo
monitor-cli --init-config         # creates TOML, preserving existing files
monitor-cli                       # live terminal display
```

Ensure `~/.local/bin` is in `PATH`. The installer reports its full command path otherwise. Edit `~/.config/monitor-cli/config.toml` (or `$XDG_CONFIG_HOME/monitor-cli/config.toml`) to select and order modules, set columns, colors, ASCII/Unicode, sampling rate, ping targets, preferred media player and note file/editor. Paths for notes are relative to the config. See [config.example.toml](config.example.toml). No ping targets are contacted by default.

Press **q / Esc / Ctrl+C** to quit, **r** to reload configuration, **Space** to play/pause, **n** to cycle players, **e** to edit the note through `$VISUAL`, `$EDITOR` or `vi`, **p** to pause the display, **↑/↓ / j/k / PageUp/PageDown** to scroll, and **?** for help. Invalid reloads keep the current settings. Resizing automatically adapts the columns.

```bash
monitor-cli --config ./my-config.toml  # alternate configuration
monitor-cli --check-config            # validate without sampling
monitor-cli --once                    # plain-text snapshot
monitor-cli --json                    # JSON snapshot
./scripts/uninstall.sh                # removes installed command; keeps config/notes
```

Redirected output automatically uses one plain snapshot. If you have removed the source checkout, uninstall with `~/.local/share/monitor-cli/scripts/uninstall.sh`. To remove settings too, manually delete your monitor-cli config directory after saving any notes you want to keep.

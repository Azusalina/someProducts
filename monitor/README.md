# Monitor

## What is it?

A Linux monitoring product with two independently runnable modes in one
repository: a KDE Plasma desktop widget and a terminal dashboard. See
[description.md](description.md) for structure and repository history.

## How to use

Choose the mode suited to your session:

- [Widget mode](widget-mode/README.md) requires KDE Plasma 6 and its Python/Qt
  dependencies. From `widget-mode/core`, run `./scripts/setup.sh`, then start the
  bridge with `./scripts/start.sh` and the preview with `./scripts/preview.sh` in
  another terminal. `./scripts/install.sh` installs the persistent widget;
  `./scripts/uninstall.sh` removes it. Add **someProducts-monitor** through KDE's
  **Add Widgets** menu. Settings remain in `~/.config/someProducts-monitor/`.
- [CLI mode](cli-mode/README.md) requires Linux and Python 3.11+ with curses.
  Run `./cli-mode/monitor-cli` directly, or `./cli-mode/scripts/install.sh` to
  install the `monitor-cli` command. Press `q`, Esc, or Ctrl+C to return to your
  shell. Run `monitor-cli --init-config` to create settings in
  `~/.config/monitor-cli/config.toml`, and press `r` to reload them.
  `./cli-mode/scripts/uninstall.sh` removes the installed command while retaining
  configuration and notes.

Both modes retain their existing installation and configuration locations. Their
linked READMEs cover module controls, optional tools, preview configuration, and
the available configuration profiles. Commit and push changes through the
parent `someProducts` workspace; both modes publish to `Azusalina/monitor`.

# Monitor — combined product

## Layout

```text
monitor/
  README.md
  description.md
  widget-mode/
    README.md
    description.md
    core/                 Plasma package, bridge, scripts, and tests
    docs/                 Existing widget documentation and validation evidence
  cli-mode/               Standalone Python terminal command, scripts, and tests
```

The existing widget `core` and `docs` directories move together into
`widget-mode`, preserving their relative links and QML/test imports. The entire
previous `monitor-cli` directory moves into `cli-mode`. Neither runtime depends
on the other, and no collector implementations are merged by this reorganization.

Detailed widget documentation remains in
[widget-mode/core/description.md](widget-mode/core/description.md) and
[widget-mode/docs/description.md](widget-mode/docs/description.md). CLI architecture,
limitations, licensing, and development history remain in
[cli-mode/description.md](cli-mode/description.md).

## Configuration and installation

The widget continues using package ID `local.monitor.dashboard`, its installed
bridge, and `~/.config/someProducts-monitor/`. The CLI retains the command name
`monitor-cli`, its installed data under `~/.local/share/monitor-cli`, and
`~/.config/monitor-cli/config.toml`. Existing installed copies are independent
of the moved source folders. This migration does not reinstall either mode,
restart Plasma, or alter the user's settings, notes, or widget placement.

The relocated source development virtual environment has its launcher and
activation paths updated to `widget-mode/core/.venv`. Fresh checkouts continue
using the widget's existing setup script. Its installer resolves paths relative
to itself, as does the CLI installer.

## Git history and maintenance

Both modes publish as one product to `Azusalina/monitor`. The parent workspace
retains the complete source and owns the sole local `.git` directory. The
publication registry no longer contains a separate `monitor-cli` product.

The combined product's first layout commit has two product-history parents:
the existing Monitor history and the existing CLI history. Previous commit IDs
are retained as ancestors, so the existing Monitor destination advances normally
without force-pushing. `historyImports` in the workspace's `products.json`
records the CLI history tip and the `cli-mode` path that introduces it. Future
changes in either mode advance the same product branch.

After successful publication and history verification, the former
`Azusalina/monitor-cli` repository is archived as a historical reference. Active
development and publication use `Azusalina/monitor`. A fresh hub clone can obtain
the imported CLI commits from the combined Monitor repository if they are absent
from its local object database.

## Validation

Run CLI tests with `python3 -B -m unittest discover -s monitor/cli-mode/tests -v`.
Run widget backend tests with
`monitor/widget-mode/core/.venv/bin/python -B -m unittest discover -s monitor/widget-mode/core/tests -v`.
The widget's existing full verification script remains at
`widget-mode/core/scripts/verify.sh`; it exercises the real Qt/Plasma preview and
may write validation artifacts in `widget-mode/docs`.

The workspace synchronization integration suite includes combining two existing
product repositories, retaining both historical parents, updating the combined
product, and rebuilding its projection cache without rewriting the destination.
After relocation, all 17 CLI tests, 56 widget backend tests, and 12 workspace
synchronization tests passed. Direct CLI configuration validation and the moved
virtual environment's Python/pip launchers also passed. This reorganization did
not rerun live Qt/Plasma preview checks or reinstall either mode.

## History

2026-10-12: Combined the local and GitHub Monitor products into widget and CLI
modes in one repository, preserving both runtime configurations and histories.

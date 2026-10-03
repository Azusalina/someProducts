# monitor-cli — Description

## Purpose and scope

This product brings the current Monitor dashboard into an existing Linux terminal. The `monitor-cli` command enters curses' alternate screen; normal exit, Ctrl+C and SIGTERM restore terminal settings and return control to the shell. It runs as one foreground process, with no web server, GUI windows, background service or connection to the installed Monitor widget.

The display provides CPU load/temperature, RAM/swap, readable GPU load/VRAM/temperature, ICMP latency, MPRIS media metadata/progress/play-pause, optional playback audio spectrum, Proton VPN indicators, Wi-Fi, Bluetooth devices and a file-backed note. Module order, enablement, layout and behavior are configured through TOML. An embedded shell is unnecessary for the requested workflow: quitting returns to the user's existing shell.

## Configuration

The default configuration path is `$XDG_CONFIG_HOME/monitor-cli/config.toml`, falling back to `~/.config/monitor-cli/config.toml`. A missing default file uses built-in settings without creating files. Explicit `--config` paths and `--check-config` require a readable file. `--init-config` creates the commented example and refuses to overwrite an existing configuration. No targets are pinged until configured.

`[dashboard]` accepts ordered, unique `modules` chosen from `cpu`, `ram`, `gpu`, `ping`, `media`, `proton`, `wifi`, `bluetooth`, `note`; `columns` (1–3); `refresh_seconds` (0.5–60); `history_size` (5–600); and Boolean `color`/`unicode`. `NO_COLOR` disables colors. Terminals narrower than 36 cells per column use fewer columns. Short terminals show a scrollable dashboard.

`[ping]` accepts `interval_seconds` (2–300) and at most eight `{ label, host }` targets. Hosts accept hostnames and HTTP(S) URLs; URLs are normalized to their hostname. Checks use ICMP, not an HTTP health request. Invalid schemes, credentials and option-like hosts are rejected; subprocess arguments never go through a shell.

`[media]` accepts an optional complete `org.mpris.MediaPlayer2.*` service and `cava`. Empty service selects a playing player first. A configured but unavailable service remains visibly unavailable; `n` selects another active player for the current session. Player capability flags are checked again at playback action time. CAVA reads only the default playback sink's `.monitor` source. It never selects a microphone; missing tools/audio remain visibly unavailable.

`[note]` accepts `file` and `editor`. Relative note paths resolve beside the selected config; `~` expands to the user's home. The editor command uses configured `editor`, then `VISUAL`, then `EDITOR`, then `vi`. Arguments are parsed with `shlex` and executed without a shell. Opening the editor temporarily restores the terminal and resumes the dashboard when it exits. Notes are plain text, read afresh each frame, limited to 16 KiB for display and six preview lines. Editing preserves the complete file.

Unknown keys, malformed TOML, duplicate modules, invalid types, out-of-range values and oversized configuration files are errors. Reload parses and validates a complete replacement before switching; errors preserve the running configuration. Successful reload restarts collectors and clears in-memory graph history. `p` freezes the displayed snapshot while collectors continue sampling.

## Architecture and provenance

The CPU/RAM/GPU/MPRIS and ICMP collectors are adapted from the working tree of `monitor/core/backend/monitor_service.py` in the workspace, with separate copies of its connectivity and playback-spectrum collectors. This deliberate separation makes the installed command independent of the source widget, its Python environment and HTTP bridge. Original MIT licensing is preserved in [LICENSE](LICENSE). Changes to upstream collectors must be reviewed and ported explicitly.

`monitor_cli/config.py` owns validation. `collectors.py`, `connectivity.py` and `audio.py` own Linux sampling. `engine.py` starts bounded background workers and publishes snapshots under a lock. System, GPU, media, connectivity and each configured ping target run independently, so slow commands do not block input or other collectors. External commands have timeouts. Audio subprocesses are terminated and reaped on shutdown. Probe threads are daemon threads; outstanding bounded probes can finish after a configuration reload.

`display.py` formats cards, bars and graph history for both curses and plain output. Control characters from external text are removed before rendering; CJK text is clipped using display-cell widths. `tui.py` manages columns, scrolling, alternate-screen lifecycle and keyboard interactions. It redraws every 200 ms, independently of system sampling. `cli.py` handles live display, configuration creation/checking, text and JSON snapshots. `--timeout` (0.2–30 seconds, default 3) bounds the initial wait for snapshots, not live sampling. Unfinished collectors are shown as waiting; one-shot audio may not yet have a frame. JSON contains `updated`, `errors` and collector timestamps alongside measurements.

The launcher `monitor-cli` resolves its own symlink before importing the package. `scripts/install.sh` copies the standalone product to `~/.local/share/monitor-cli` and adds `~/.local/bin/monitor-cli`. Only installations carrying its ownership marker can be replaced or removed; unrelated commands/files are preserved. `--prefix` supports isolated installation checks. Installation does not edit shell startup files or create a service. Uninstallation preserves configuration and notes.

## Measurement limits

CPU uses counter deltas excluding duplicated guest accounting. RAM uses `MemAvailable`. GPU load depends on driver support: NVIDIA uses `nvidia-smi`, AMD can expose sysfs device utilization, and Intel DRM engine counters cover readable user-session clients. Missing or first-sample engine counters are unknown, never fabricated as zero. The GPU history line plots the maximum available load across devices; each device is listed separately.

MPRIS requires a user D-Bus session and a compliant player. Playback progress can be unavailable and is extrapolated between samples only while Playing. Wi-Fi requires NetworkManager; Bluetooth requires BlueZ. Proton detection follows active NetworkManager profile names plus the GUI's stored kill-switch mode, which is an indicator rather than a verified packet-filter state. Connectivity is read-only; no GUI settings apps are launched. Unknown values remain unknown.

ICMP can be blocked even when a site is reachable through HTTP. Hardware temperature sensors may be inaccessible. System/media card timestamps become visibly stale when collection falls behind. Configuration/source changes and exit lose graph history. Unicode width is based on standard Unicode cell categories; complex emoji sequences can differ between terminal implementations. Linux is the supported operating system; Windows/macOS collectors are not implemented.

## Development and validation

Run from this product directory in the source checkout:

```bash
python3 -m unittest discover -s tests -v
./monitor-cli --config config.example.toml --check-config
./monitor-cli --once
./monitor-cli --json
```

Tests cover meaningful configuration errors, counter deltas, command safety, display width/sanitization, asynchronous sampling, installation/removal, and a real pseudo-terminal session including resize, reload, note editing and terminal restoration. Optional feature support must be evaluated on the target machine; successful CPU/RAM and terminal tests do not prove every GPU driver, audio server or MPRIS player works.

Validation on 2026-10-03: all 17 automated tests passed on Python 3.14.7. Live pseudo-terminal output was inspected at 100×38, and interaction tests covered a smaller 40×10 viewport. A real player fixture on an isolated D-Bus session verified metadata, duration, position and PlayPause. The local playback monitor produced 32 normalized CAVA bars and its collector stopped cleanly. Live CPU/RAM, Intel user-session engine counters and NetworkManager/BlueZ state were observed. No load accuracy comparison or NVIDIA/AMD hardware check was performed.

## Project history

2026-10-03: Created as a separate product after the user requested a pure CLI version of Monitor with configuration files, then clarified that typing `monitor-cli` should put the current terminal into display mode. Existing Monitor work was used as a reference and preserved.

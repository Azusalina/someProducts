# filex-linux-gui — description

## Architecture

- `src/main.rs` compiles `config`, `edit`, `files`, `git_actions`, `git_status`, `jobs`, `links`, `model`, `ordering`, `transfer` directly from `../fileX/src` via `#[path]`, so tree model, ordering, Git status, transfers and config parsing stay identical to the TUI. `terminal_profile.rs` is a small stand-in (language + desktop flag). `FILEX_ROOT` defaults to `../fileX` so `{filex}` opener paths resolve.
- `app.rs`: non-blocking port of the TUI `Ui`. Key → action resolution is copied from `tui.rs`; the TUI's blocking prompt / choose / confirm / pager / reorder loops are modals with continuations (copy/move replacement confirmations, Git menu → message → confirm, open-with, hidden items, trash).
- `layout.rs`: pixel version of `model::Layout` (classic and grouped `v`), plus the ancestor route.
- `view.rs`: header (breadcrumb, mode chips, client-side window controls), tree, dashboard (`q`), status line, modals. `paint.rs`: software painter on the 0RGB framebuffer. `font.rs`: embedded Geist / Geist Mono (SIL OFL, `assets/fonts/OFL.txt`) with fontconfig fallbacks (CJK etc.) memory-mapped on demand.
- `main.rs`: winit 0.30 + softbuffer, `ControlFlow::Wait` (redraw only on input, brief 200 ms polling while Git snapshots finish, short eased animations). `launch.rs`: terminal programs run in `[gui] terminal` / `$TERMINAL` / first detected emulator; the tree refreshes when that window closes.
- `dnd.rs`: outbound drag-and-drop. winit cannot be a drag source, so a private Wayland event queue on winit's own connection (`Backend::from_foreign_display`) binds `wl_seat` and `wl_data_device_manager`; a second `wl_pointer` records the button-press serial that `start_drag` needs. A press on a node that moves 8 px starts the drag; the source offers `text/uri-list` (RFC 8089 `file://` URIs, percent-encoded bytes) and `text/plain`, action copy. Marked items travel together when the dragged node is marked. X11 sessions report that dragging needs Wayland.
- Design: constructivist minimalism, graphite / paper palettes with one red accent; configured filex colours are harmonised into the palette; clean Git states (P/C) are muted.

## Differences from the TUI

- Terminal openers, `@`, Git actions open a terminal emulator window instead of suspending the screen; tmux right-pane reuse does not apply.
- `x` writes `FILEX_CWD_FILE` if set; started from a terminal it then opens `$SHELL` in the folder, otherwise it opens a terminal emulator there.
- Fcitx auto-English is replaced by enabling the input method only inside prompts.
- Search runs on Enter (not incrementally), like the TUI.

## Integration

- `scripts/install.sh` copies the release binary to `~/.local/bin/filex-gui`, writes `~/.local/share/applications/filex-gui.desktop` (Name `filex`, `StartupWMClass=filex-gui`, matching the Wayland app id) and `hicolor/scalable/apps/filex-gui.svg`, then refreshes the desktop database, KDE's sycoca and the icon cache. It does not register a MIME type, so the default file manager is unchanged. `--rebuild`, `--remove`.
- `../fileX/filex.sh` accepts `--gui` anywhere in its arguments: it runs `~/.local/bin/filex-gui` (or this folder's build) with the remaining arguments via `setsid -f`, unsets `FILEX_CWD_FILE`, and returns to the shell.

## Validation (2026-10-25, KDE Plasma Wayland, scale 1.25)

- `cargo test --release`: 27 passed (13 GUI parity/layout/key/URI tests + 14 shared fileX module tests).
- 2026-10-26: the drag source initialises on the live KWin session (seat and data-device manager bound, window unaffected, RSS 22.7 MB); `desktop-file-validate` passes and KDE's service cache contains the entry; `filex --gui` through the Bash function returns immediately with the GUI detached.
- RSS 23 MB idle (heap ~2 MB, rest is the shared framebuffer), 27 MB with CJK fallback loaded, 29 MB after `E` expanding 5,000 nodes. Idle CPU: 0 ticks over 10 s; 1 thread. Frame 2–3 ms; layout rebuild ~19 ms at 5,000 nodes.
- Visual checks by screenshot: tree/route, dashboard, open-with, copy mode with `+` and marks, help, rename prompt, trash confirm, pager, grouped mode, light theme, CJK names, symlink target selection.

## Development

`FILEX_GUI_KEYS="right enter q"` replays space-separated key names at startup (`space`, `ctrl+f` aliases); `FILEX_GUI_TRACE=1` prints frame times.

## Limitations

- A complete drag into a browser was not exercised automatically: Wayland does not let a test synthesise the compositor's press serial, so the drop itself needs a manual check.
- Building the standalone repository needs `fileX` checked out next to it (`../fileX`); release archives contain a prebuilt binary.
- Real mouse/keyboard input under X11 and other compositors untested; IME composition tested only through code paths, not live.

## History

- v1.0 (2026-10-26): first release: GUI, outbound drag, launcher entry, `filex --gui`.

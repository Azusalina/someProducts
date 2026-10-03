# Configure someProducts-monitor

Right-click the desktop widget and choose **someProducts-monitor Settings…** / **Configure**. You can also use Plasma's Configure action in Edit Mode. There is no inline Customize panel on the dashboard.

## Modules

Select the modules to display, choose one to three columns and reorder rows using drag handles or up/down arrows. Saved order is preserved when upgrading, and new modules are appended to the choices. Narrow widgets use one column automatically.

For separate desktop pieces, add another widget instance and select different modules. Configuration remains local to each instance; its note is preserved when modules are disabled. Notes are still edited directly in the desktop display.

## Appearance

| Setting | Example | Default |
| --- | --- | --- |
| Text / dashboard color | `#aabbcc` | Empty uses the previous light/dark text preference |
| Border color | `#aabbcc` | `#aabbcc` |
| Border width | `1` px | `0` (hidden) |
| Background color | `#102030` | `#1b1b1b` |
| Background opacity | `75` percent | `0` (fully transparent) |

Use six-digit RGB hex values including `#`. The optional background is a single board surface. The border is the outline around that board. A sample on the page previews the draft colors. To show a background, raise its opacity above 0%; to show the border, raise its width above 0. Default settings retain full transparency.

Incomplete or invalid hex input is flagged and cannot replace the last valid draft color. The text color field may be cleared to restore the previous light/dark choice. Color, border and opacity settings are saved independently per instance.

## Ping

Enter one target per line as `label | URL or hostname | icon`, up to eight targets. Use a Unicode symbol or a KDE theme icon name. An applied target is checked while the widget requests telemetry. Draft edits do not contact a target before Apply.

## Media

Choose Automatic or an available MPRIS player. A saved preferred player is used when present; otherwise the first available source is shown, with playing sources preferred. Enable the CAVA background and set its opacity (default 40% in 1.6; explicit previous choices are preserved). CAVA always captures system playback from the default audio output's monitor, never the microphone. The desktop element contains only progress and Pause/Resume.

## Terminal

Set height (120–800 px) and font size (9–24 px). Enable TERMINAL on the Modules page, Apply, then click Start terminal on the dashboard. Keyboard entry, resizing, Ctrl+C, paste and scrollback act on an independent shell for that widget. Reordering or adding modules preserves its running session. Disabling Terminal or removing the widget ends the shell; settings changes do not run commands automatically.

## Saving

Use **Apply** to save the current page, or **OK** to save and close. **Cancel** discards unapplied changes; Plasma may ask whether to discard when switching away from an edited page. Notes have their own local autosave and do not enter this configuration transaction.

In the standalone preview, right-click or press **Ctrl+,** to open a separate settings window with the same pages. Its Apply/OK actions save the staged pages; Cancel discards the uncommitted draft.

If an existing widget still shows an older interface, run `python scripts/refresh-desktop.py` from `monitor/core` to back up its settings and reload the Plasma shell. Its desktop and panel briefly reload. `--reveal-media-terminal` additionally moves Media immediately after Terminal while keeping the other modules in order. Alternatively copy your note before removing/re-adding the widget. Installation preserves package ID `local.monitor.dashboard` and existing preferences.

Native configuration follows [KDE's configuration contract](https://develop.kde.org/docs/plasma/widget/configuration/). Evidence: `qml-tests.log`, `preview-configuration-test.log`, `preview-config-modules.png`, `preview-config-appearance.png`, `preview-colored.png`.

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

## Saving

Use **Apply** to save the current page, or **OK** to save and close. **Cancel** discards unapplied changes; Plasma may ask whether to discard when switching away from an edited page. Notes have their own local autosave and do not enter this configuration transaction.

In the standalone preview, right-click or press **Ctrl+,** to open a separate settings window with the same pages. Its Apply/OK actions save the staged pages; Cancel discards the uncommitted draft.

If an existing widget still shows its old inline Customize button, Plasma is using cached QML. Copy its note before removing and re-adding that instance. The new installed package is available as **someProducts-monitor** in Add Widgets. Installation preserves its package ID `local.monitor.dashboard` and does not rewrite existing instance preferences.

Native configuration follows [KDE's configuration contract](https://develop.kde.org/docs/plasma/widget/configuration/). Evidence: `qml-tests.log`, `preview-configuration-test.log`, `preview-config-modules.png`, `preview-config-appearance.png`, `preview-colored.png`.

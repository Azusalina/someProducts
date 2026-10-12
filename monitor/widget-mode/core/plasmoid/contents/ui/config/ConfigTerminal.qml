import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

ColumnLayout {
    id: page
    property int cfg_terminalHeight: 230
    property int cfg_terminalFontSize: 11
    implicitWidth: 480
    spacing: 16
    Label { text: "Embedded terminal"; font.bold: true }
    RowLayout { Label { text: "Height (px)" } SpinBox { from: 120; to: 800; stepSize: 10; value: page.cfg_terminalHeight; onValueModified: page.cfg_terminalHeight = value } }
    RowLayout { Label { text: "Font size (px)" } SpinBox { from: 9; to: 24; value: page.cfg_terminalFontSize; onValueModified: page.cfg_terminalFontSize = value } }
    Label { Layout.fillWidth: true; text: "Enable Terminal in Modules, then click Start terminal. Click its contents to type. Ctrl+C interrupts; Ctrl+Shift+V pastes; Ctrl+Shift+C copies the visible screen. The mouse wheel browses scrollback."; wrapMode: Text.Wrap }
    Label { Layout.fillWidth: true; text: "Each widget has its own shell session. Hiding the module or removing its widget closes the session. Sessions do not survive service restart. The terminal opens in the installed product's monitor folder."; wrapMode: Text.Wrap; opacity: 0.7 }
    Item { Layout.fillHeight: true }
}

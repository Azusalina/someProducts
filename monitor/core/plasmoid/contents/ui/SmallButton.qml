import QtQuick
import QtQuick.Controls

AbstractButton {
    id: button
    property color ink: "#f5f5f4"
    property bool outlined: false
    implicitWidth: label.implicitWidth + 16
    implicitHeight: 28
    font.pixelSize: 12
    hoverEnabled: true
    opacity: enabled ? 1 : 0.35
    background: Rectangle {
        color: "transparent"
        radius: 5
        border.width: button.outlined || button.hovered || button.activeFocus ? 1 : 0
        border.color: Qt.rgba(button.ink.r, button.ink.g, button.ink.b, button.hovered ? 0.55 : 0.22)
    }
    contentItem: Text {
        id: label
        text: button.text
        color: button.ink
        font: button.font
        horizontalAlignment: Text.AlignHCenter
        verticalAlignment: Text.AlignVCenter
    }
    Accessible.name: text
}

import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import org.kde.kirigami as Kirigami

AbstractButton {
    id: button
    objectName: "settings_proton"
    property color ink: "#f5f5f4"
    property var status: ({})
    property bool stale: false
    property bool opening: false
    signal openRequested()
    readonly property string stateText: stale ? "Waiting" : status.connected === true ? "Connected" : status.connected === false ? "Disconnected" : "Unavailable"
    implicitWidth: label.implicitWidth + 56
    implicitHeight: 32
    hoverEnabled: true
    enabled: !!status.can_open && !opening
    opacity: status.can_open ? 1 : 0.4
    scale: down ? 0.97 : 1
    Behavior on scale { NumberAnimation { duration: 120 } }
    background: Rectangle {
        radius: 16
        color: "transparent"
        border.width: 1
        border.color: Qt.rgba(button.ink.r, button.ink.g, button.ink.b, button.hovered || button.activeFocus ? 0.65 : 0.25)
        Behavior on border.color { ColorAnimation { duration: 180 } }
    }
    contentItem: RowLayout {
        spacing: 7
        Item { implicitWidth: 3 }
        Kirigami.Icon {
            implicitWidth: 14; implicitHeight: 14
            source: "network-vpn"
            color: button.ink
            isMask: true
            RotationAnimation on rotation { from: 0; to: 360; duration: 1100; loops: Animation.Infinite; running: button.opening && button.visible }
        }
        Text {
            id: label
            text: button.opening ? "Opening Proton…" : "Proton · " + button.stateText
            color: button.ink
            font.pixelSize: 11
        }
        Rectangle {
            implicitWidth: 4; implicitHeight: 4; radius: 2
            color: button.ink
            opacity: 0.4
            SequentialAnimation on opacity {
                running: button.visible && !button.stale && button.status.connected === true && !button.opening
                loops: Animation.Infinite
                NumberAnimation { to: 0.95; duration: 900 }
                NumberAnimation { to: 0.4; duration: 900 }
            }
        }
        Item { implicitWidth: 3 }
    }
    onClicked: openRequested()
    Accessible.name: "Open Proton VPN settings; " + stateText
    ToolTip.visible: hovered
    ToolTip.delay: 500
    ToolTip.text: (status.server || "Proton VPN") + " · Kill Switch: " + (status.kill_switch || "Unknown") + "\nOpen Proton → Menu → Settings → Features"
}

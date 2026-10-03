import QtQuick
import QtQuick.Layouts
Item {
    id: card
    property color ink: "#f5f5f4"
    property string kind: "proton"
    property var status: ({})
    property bool stale: false
    property bool opening: false
    signal openRequested(string target)
    readonly property string stateText: {
        if (stale) return "Waiting for status"
        if (kind === "proton") return status.connected === true ? "Connected" : status.connected === false ? "Disconnected" : "Unavailable"
        return status.enabled === true ? "On" : status.enabled === false ? "Off" : "Unavailable"
    }
    implicitHeight: content.implicitHeight
    ColumnLayout {
        id: content
        width: card.width
        spacing: 6
        Text { text: card.stateText; color: card.ink; font.pixelSize: 21; font.weight: Font.Light }
        Text {
            Layout.fillWidth: true
            text: {
                if (card.kind === "proton") return (card.status.server || "Proton VPN") + " · Kill Switch: " + (card.status.kill_switch || "Unknown")
                if (card.kind === "wifi") return card.status.network || (card.status.connected === false ? "No connection" : "NetworkManager")
                return (card.status.devices || []).join(" · ") || "No connected devices"
            }
            color: card.ink; opacity: 0.6; font.pixelSize: 10; wrapMode: Text.Wrap; textFormat: Text.PlainText
        }
        SmallButton {
            objectName: "settings_" + card.kind
            text: card.opening ? "Opening…" : card.kind === "proton" ? "Open Proton ↗" : "Settings ↗"
            ink: card.ink
            outlined: true
            enabled: !!card.status.can_open && !card.opening
            onClicked: card.openRequested(card.kind)
        }
        Text {
            Layout.fillWidth: true
            visible: card.kind === "proton"
            text: "Kill Switch: Menu → Settings → Features"
            color: card.ink; opacity: 0.4; font.pixelSize: 9; wrapMode: Text.Wrap
        }
    }
}

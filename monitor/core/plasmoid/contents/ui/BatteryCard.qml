pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Layouts
import QtQuick.Controls

ColumnLayout {
    id: card
    required property var owner
    property var status: ({})
    property color ink: "#f5f5f4"
    property bool stale: true
    readonly property var battery: status.battery || ({})
    spacing: 3
    RowLayout {
        Layout.fillWidth: true
        Text { objectName: "batteryPercent"; text: !card.stale && card.battery.percent != null ? Math.round(card.battery.percent) + "%" : "—"; color: card.ink; font.pixelSize: 18 }
        Text {
            Layout.fillWidth: true
            text: card.stale ? "Waiting for battery" : (card.battery.state || "Unavailable") + (card.battery.watts != null ? " · " + card.battery.watts.toFixed(1) + " W" : "") + (card.battery.remaining_seconds ? " · " + Math.ceil(card.battery.remaining_seconds / 60) + " min" : "")
            color: card.ink; opacity: 0.65; font.pixelSize: 9; wrapMode: Text.Wrap
        }
    }
    RowLayout {
        Layout.fillWidth: true
        spacing: 2
        Repeater {
            model: [{key: "power-saver", label: "Powersave"}, {key: "balanced", label: "Regular"}, {key: "performance", label: "Performance"}]
            delegate: SmallButton {
                required property var modelData
                objectName: "power_" + modelData.key
                text: modelData.label
                ink: card.ink
                Layout.fillWidth: true
                implicitWidth: 0
                implicitHeight: 24
                font.pixelSize: 9
                outlined: card.status.profile === modelData.key
                enabled: !card.stale && !card.owner.busy && (card.status.profiles || []).includes(modelData.key)
                Accessible.name: "Power mode: " + modelData.label
                onClicked: card.owner.setProfile(modelData.key)
            }
        }
    }
    SmallButton {
        objectName: "keepAwakeButton"
        Layout.fillWidth: true
        implicitHeight: 24
        font.pixelSize: 10
        ink: card.ink
        outlined: card.owner.awake
        text: card.owner.busy && ["enable", "disable"].includes(card.owner.operation) ? "Keep awake · Applying…" : card.owner.awake ? "Keep awake · On" : "Keep awake · Off"
        enabled: !card.owner.busy
        Accessible.name: "Prevent automatic sleep and screen off"
        ToolTip.visible: hovered
        ToolTip.text: "Prevents automatic sleep, screen off and idle locking. Manual locking remains available."
        onClicked: card.owner.toggle()
    }
    Text { Layout.fillWidth: true; visible: card.owner.error.length > 0 || !!card.status.degraded; text: card.owner.error || card.status.degraded || ""; textFormat: Text.PlainText; wrapMode: Text.Wrap; color: card.ink; font.pixelSize: 9; opacity: 0.65 }
}

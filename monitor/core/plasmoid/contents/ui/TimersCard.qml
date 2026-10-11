import QtQuick
import QtQuick.Layouts
ColumnLayout {
    id: card
    required property var owner
    required property var preferences
    property bool stacked: false
    property color ink: "#f5f5f4"
    function colorFor(kind) { const value = preferences[kind + "Color"]; return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value) ? value : ink }
    spacing: 3
    GridLayout {
        Layout.fillWidth: true
        columns: card.stacked ? 1 : 3
        columnSpacing: 6; rowSpacing: 6
        ClockFace { objectName: "countdownFace"; Layout.row: card.stacked ? 2 : 0; Layout.column: 0; Layout.fillWidth: true; Layout.preferredWidth: 1; Layout.alignment: Qt.AlignTop; owner: card.owner; kind: "countdown"; ink: card.colorFor(kind); style: card.preferences.countdownStyle || "minimal" }
        Rectangle { Layout.row: card.stacked ? 1 : 0; Layout.column: card.stacked ? 0 : 1; Layout.fillHeight: !card.stacked; Layout.fillWidth: card.stacked; implicitWidth: 1; implicitHeight: card.stacked ? 1 : 0; color: card.ink; opacity: 0.12 }
        ClockFace { objectName: "stopwatchFace"; Layout.row: 0; Layout.column: card.stacked ? 0 : 2; Layout.fillWidth: true; Layout.preferredWidth: 1; Layout.alignment: Qt.AlignTop; owner: card.owner; kind: "stopwatch"; ink: card.colorFor(kind); style: card.preferences.stopwatchStyle || "minimal" }
    }
    Text { visible: card.owner.error.length > 0; text: card.owner.error; color: card.ink; opacity: 0.6; font.pixelSize: 9; wrapMode: Text.Wrap; Layout.fillWidth: true }
}

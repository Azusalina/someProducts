import QtQuick
import QtQuick.Layouts
Item {
    id: group
    required property var powerControls
    required property var timerControls
    required property var preferences
    property var status: ({})
    property bool stale: true
    property color ink: "#f5f5f4"
    implicitHeight: row.implicitHeight
    RowLayout {
        id: row
        width: group.width
        spacing: 8
        ColumnLayout {
            objectName: "batteryColumn"
            Layout.fillWidth: true
            Layout.preferredWidth: 1
            Layout.minimumWidth: 80
            Layout.alignment: Qt.AlignTop
            spacing: 4
            Rectangle { Layout.fillWidth: true; implicitHeight: 1; color: group.ink; opacity: 0.18 }
            Text { text: "BATTERY"; color: group.ink; opacity: 0.5; font.pixelSize: 8; font.letterSpacing: 1 }
            BatteryCard { objectName: "batteryCard"; Layout.fillWidth: true; vertical: true; owner: group.powerControls; status: group.status; stale: group.stale; ink: group.ink }
        }
        Rectangle { Layout.fillHeight: true; implicitWidth: 1; color: group.ink; opacity: 0.12 }
        TimersCard { objectName: "timersCard"; Layout.fillWidth: true; Layout.preferredWidth: 1.2; Layout.minimumWidth: 85; Layout.alignment: Qt.AlignTop; stacked: true; owner: group.timerControls; preferences: group.preferences; ink: group.ink }
    }
}

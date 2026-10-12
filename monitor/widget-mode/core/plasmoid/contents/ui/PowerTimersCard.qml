import QtQuick
import QtQuick.Layouts
import "ResizeTools.js" as ResizeTools
Item {
    id: group
    required property var powerControls
    required property var timerControls
    required property var preferences
    property var status: ({})
    property bool stale: true
    property color ink: "#f5f5f4"
    property real previewSplit: -1
    readonly property real fraction: Math.max(80/(width-17),Math.min(1-85/(width-17),previewSplit < 0 ? ResizeTools.fraction(preferences.layoutSplits,"power",0.45) : previewSplit))
    implicitHeight: row.implicitHeight
    RowLayout {
        id: row
        width: group.width
        spacing: 8
        ColumnLayout {
            objectName: "batteryColumn"
            Layout.fillWidth: true
            Layout.preferredWidth: (group.width-17)*group.fraction
            Layout.maximumWidth: (group.width-17)*group.fraction
            Layout.minimumWidth: 80
            Layout.alignment: Qt.AlignTop
            spacing: 4
            Rectangle { Layout.fillWidth: true; implicitHeight: 1; color: group.ink; opacity: 0.18 }
            Text { text: "BATTERY"; color: group.ink; opacity: 0.5; font.pixelSize: 8; font.letterSpacing: 1 }
            BatteryCard { objectName: "batteryCard"; Layout.fillWidth: true; vertical: true; owner: group.powerControls; status: group.status; stale: group.stale; ink: group.ink }
        }
        SplitGrip { Layout.fillHeight: true; implicitWidth: 7; preferences: group.preferences; splitKey: "power"; available: group.width-17; minimumLeft: 80; minimumRight: 85; fraction: group.fraction; ink: group.ink; onChanged: ratio => group.previewSplit=ratio; onPressedChanged: if (!pressed) group.previewSplit=-1 }
        TimersCard { objectName: "timersCard"; Layout.fillWidth: true; Layout.preferredWidth: (group.width-17)*(1-group.fraction); Layout.maximumWidth: (group.width-17)*(1-group.fraction); Layout.minimumWidth: 85; Layout.alignment: Qt.AlignTop; stacked: true; owner: group.timerControls; preferences: group.preferences; ink: group.ink }
    }
}

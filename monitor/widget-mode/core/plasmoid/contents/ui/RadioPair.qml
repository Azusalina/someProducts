pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Layouts
import "ResizeTools.js" as ResizeTools

Item {
    id: pair
    property var preferences: null
    property real previewSplit: -1
    readonly property real fraction: Math.max(100/(width-10),Math.min(1-100/(width-10),previewSplit < 0 ? ResizeTools.fraction(preferences ? preferences.layoutSplits : "{}","radios",0.5) : previewSplit))
    property color ink: "#f5f5f4"
    property var wifiStatus: ({})
    property var bluetoothStatus: ({})
    property bool stale: false
    property string openingSettings: ""
    signal openRequested(string target)
    implicitHeight: row.implicitHeight
    RowLayout {
        id: row
        width: pair.width
        spacing: 10
        Repeater {
            model: ["wifi", "bluetooth"]
            delegate: ColumnLayout {
                id: column
                required property string modelData
                objectName: "radio_" + modelData
                Layout.fillWidth: true
                Layout.preferredWidth: (pair.width-10)*(modelData === "wifi" ? pair.fraction : 1-pair.fraction)
                Layout.maximumWidth: (pair.width-10)*(modelData === "wifi" ? pair.fraction : 1-pair.fraction)
                Layout.minimumWidth: 100
                Layout.alignment: Qt.AlignTop
                spacing: 4
                Rectangle { Layout.fillWidth: true; implicitHeight: 1; color: pair.ink; opacity: 0.18 }
                Text { text: column.modelData.toUpperCase(); color: pair.ink; opacity: 0.5; font.pixelSize: 8; font.letterSpacing: 1 }
                ConnectivityCard {
                    objectName: "connectivity_" + column.modelData
                    Layout.fillWidth: true
                    ink: pair.ink
                    kind: column.modelData
                    status: kind === "wifi" ? pair.wifiStatus : pair.bluetoothStatus
                    stale: pair.stale
                    opening: pair.openingSettings === kind
                    onOpenRequested: target => pair.openRequested(target)
                }
            }
        }
    }
    SplitGrip { visible: pair.preferences !== null; x: (pair.width-10)*pair.fraction+1; height: pair.height; preferences: pair.preferences; splitKey: "radios"; available: pair.width-10; minimumLeft: 100; minimumRight: 100; fraction: pair.fraction; ink: pair.ink; onChanged: ratio => pair.previewSplit=ratio; onPressedChanged: if(!pressed) pair.previewSplit=-1 }
}

pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Layouts

Item {
    id: pair
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
                Layout.preferredWidth: 1
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
}

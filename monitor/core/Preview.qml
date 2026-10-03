import QtQuick
import QtQuick.Controls
import QtCore
import "plasmoid/contents/ui"
ApplicationWindow {
    id: window
    width: 400
    height: 520
    visible: true
    color: "transparent"
    title: "Monitor · desktop widget preview"
    Settings {
        id: preferences
        category: "MonitorPreview"
        property string moduleOrder: "cpu,ram,ping,gpu,media,note,codex,claude,resets,proton,wifi,bluetooth"
        property string enabledModules: "cpu,ram,ping,gpu,media,note,codex,claude,resets,proton,wifi,bluetooth"
        property int columns: 2
        property string targetsText: ""
        property string noteText: ""
        property bool darkInk: false
    }
    Dashboard { id: dashboard; anchors.fill: parent; anchors.margins: 20; preferences: preferences }
}

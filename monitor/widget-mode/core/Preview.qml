import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import QtCore
import "plasmoid/contents/ui"
import "plasmoid/contents/ui/config"
ApplicationWindow {
    id: window
    width: 320
    height: 380
    visible: true
    color: "transparent"
    title: "someProducts-monitor · desktop widget preview"
    Settings {
        id: savedPreferences
        objectName: "previewPreferences"
        category: "MonitorPreview"
        property string moduleOrder: "cpu,ram,ping,gpu,media,note,proton,wifi,bluetooth,terminal,battery,timers"
        property string enabledModules: "cpu,ram,ping,gpu,media,note,proton,wifi,bluetooth,terminal,battery,timers"
        property int columns: 2
        property string targetsText: ""
        property bool todoEnabled: true
        property string todoPendingTitle: "pending"
        property string todoUrgentTitle: "urgent"
        property string todoPendingColor: ""
        property string todoUrgentColor: ""
        property int todoFontSize: 11
        property int todoHeight: 130
        property string todoItems: '{"pending":[],"urgent":[]}'
        property string layoutSplits: "{}"
        property string layoutHeights: "{}"
        property string layoutColumnWeights: "[1,1,1]"
        property string noteText: ""
        property int noteHeight: 85
        property string noteExportUrl: ""
        property bool darkInk: false
        property string textColorHex: ""
        property int flowHistorySeconds: 30
        property int flowRefreshMs: 200
        property int audioRefreshMs: 100
        property string cpuFlowColor: ""
        property string ramFlowColor: ""
        property string gpuFlowColor: ""
        property string pingFlowColor: ""
        property string cavaFlowColor: ""
        property string borderColorHex: "#aabbcc"
        property string backgroundColorHex: "#1b1b1b"
        property int borderWidth: 0
        property int backgroundOpacity: 0
        property string mediaService: ""
        property bool cavaEnabled: true
        property int cavaOpacity: 40
        property int terminalHeight: 230
        property int terminalFontSize: 11
        property string countdownShortcut: "Meta+Ctrl+Alt+C"
        property string stopwatchShortcut: "Meta+Ctrl+Alt+S"
        property int countdownSeconds: 300
        property int stopwatchSeconds: 0
        property string countdownColor: ""
        property string stopwatchColor: ""
        property string countdownStyle: "minimal"
        property string stopwatchStyle: "minimal"
    }
    function transfer(page, keys, save) {
        for (const key of keys) {
            if (save) savedPreferences[key] = page["cfg_" + key]
            else page["cfg_" + key] = savedPreferences[key]
        }
    }
    function syncConfiguration(save) {
        transfer(modulesPage, ["moduleOrder", "enabledModules", "columns"], save)
        transfer(appearancePage, ["textColorHex", "borderColorHex", "backgroundColorHex", "borderWidth", "backgroundOpacity", "darkInk"], save)
        transfer(flowsPage, ["flowHistorySeconds", "flowRefreshMs", "audioRefreshMs", "cpuFlowColor", "ramFlowColor", "gpuFlowColor", "pingFlowColor", "cavaFlowColor"], save)
        transfer(pingPage, ["targetsText"], save)
        transfer(mediaPage, ["mediaService", "cavaEnabled", "cavaOpacity"], save)
        transfer(timersPage, ["countdownShortcut", "stopwatchShortcut", "countdownSeconds", "stopwatchSeconds", "countdownColor", "stopwatchColor", "countdownStyle", "stopwatchStyle"], save)
        transfer(todosPage, ["todoEnabled", "todoPendingTitle", "todoUrgentTitle", "todoPendingColor", "todoUrgentColor", "todoFontSize", "todoHeight", "todoItems"], save)
        transfer(terminalPage, ["terminalHeight", "terminalFontSize"], save)
    }
    function configure() { syncConfiguration(false); configWindow.show(); configWindow.requestActivate() }
    Shortcut { sequence: "Ctrl+,"; onActivated: window.configure() }
    Dashboard {
        id: dashboard
        anchors.fill: parent
        anchors.margins: 10
        onOuterResizeRequested: (edge,delta) => {
            if (edge === "left" || edge === "right") window.width=Math.max(200,window.width+(edge === "left" ? -delta : delta))
            else window.height=Math.max(120,window.height+(edge === "top" ? -delta : delta))
        }
        preferences: savedPreferences
        MouseArea {
            anchors.fill: parent
            acceptedButtons: Qt.RightButton
            onClicked: contextMenu.popup()
        }
        Menu { id: contextMenu; MenuItem { text: "Configure someProducts-monitor…"; onTriggered: window.configure() } }
    }
    ApplicationWindow {
        id: configWindow
        objectName: "previewConfiguration"
        width: 760
        height: 680
        visible: false
        title: "someProducts-monitor Settings"
        transientParent: window
        modality: Qt.WindowModal
        flags: Qt.Dialog
        header: TabBar {
            id: tabs
            TabButton { text: "Modules" }
            TabButton { text: "Appearance" }
            TabButton { text: "Flows" }
            TabButton { text: "Ping" }
            TabButton { text: "Media" }
            TabButton { text: "Terminal" }
            TabButton { text: "Timers" }
            TabButton { text: "To-do lists" }
        }
        StackLayout {
            anchors.fill: parent
            anchors.margins: 20
            currentIndex: tabs.currentIndex
            ConfigModules { id: modulesPage; objectName: "previewModulesPage" }
            ConfigAppearance { id: appearancePage; objectName: "previewAppearancePage" }
            ConfigFlows { id: flowsPage; objectName: "previewFlowsPage" }
            ConfigPing { id: pingPage; objectName: "previewPingPage" }
            ConfigMedia { id: mediaPage }
            ConfigTerminal { id: terminalPage }
            ConfigTimers { id: timersPage; objectName: "previewTimersPage" }
            ConfigTodos { id: todosPage; objectName: "previewTodosPage" }
        }
        footer: DialogButtonBox {
            objectName: "previewConfigurationButtons"
            standardButtons: DialogButtonBox.Ok | DialogButtonBox.Apply | DialogButtonBox.Cancel
            onApplied: window.syncConfiguration(true)
            onAccepted: { window.syncConfiguration(true); configWindow.hide() }
            onRejected: configWindow.hide()
        }
    }
}

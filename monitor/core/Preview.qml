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
        id: preferences
        objectName: "previewPreferences"
        category: "MonitorPreview"
        property string moduleOrder: "cpu,ram,ping,gpu,media,note,proton,wifi,bluetooth,terminal"
        property string enabledModules: "cpu,ram,ping,gpu,media,note,proton,wifi,bluetooth,terminal"
        property int columns: 2
        property string targetsText: ""
        property string noteText: ""
        property bool darkInk: false
        property string textColorHex: ""
        property string borderColorHex: "#aabbcc"
        property string backgroundColorHex: "#1b1b1b"
        property int borderWidth: 0
        property int backgroundOpacity: 0
        property string mediaService: ""
        property bool cavaEnabled: true
        property int cavaOpacity: 40
        property int terminalHeight: 230
        property int terminalFontSize: 11
    }
    function transfer(page, keys, save) {
        for (const key of keys) {
            if (save) preferences[key] = page["cfg_" + key]
            else page["cfg_" + key] = preferences[key]
        }
    }
    function syncConfiguration(save) {
        transfer(modulesPage, ["moduleOrder", "enabledModules", "columns"], save)
        transfer(appearancePage, ["textColorHex", "borderColorHex", "backgroundColorHex", "borderWidth", "backgroundOpacity", "darkInk"], save)
        transfer(pingPage, ["targetsText"], save)
        transfer(mediaPage, ["mediaService", "cavaEnabled", "cavaOpacity"], save)
        transfer(terminalPage, ["terminalHeight", "terminalFontSize"], save)
    }
    function configure() { syncConfiguration(false); configWindow.show(); configWindow.requestActivate() }
    Shortcut { sequence: "Ctrl+,"; onActivated: window.configure() }
    Dashboard {
        id: dashboard
        anchors.fill: parent
        anchors.margins: 10
        preferences: preferences
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
        width: 600
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
            TabButton { text: "Ping" }
            TabButton { text: "Media" }
            TabButton { text: "Terminal" }
        }
        StackLayout {
            anchors.fill: parent
            anchors.margins: 20
            currentIndex: tabs.currentIndex
            ConfigModules { id: modulesPage; objectName: "previewModulesPage" }
            ConfigAppearance { id: appearancePage; objectName: "previewAppearancePage" }
            ConfigPing { id: pingPage; objectName: "previewPingPage" }
            ConfigMedia { id: mediaPage }
            ConfigTerminal { id: terminalPage }
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

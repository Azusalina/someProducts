import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

ColumnLayout {
    id: page
    property string cfg_settingsProfile: "default"
    property string filePath: ""
    property bool fileExists: false
    property string status: "Loading config file location…"
    property var request: null
    spacing: 12
    Label { text: "Saved config file"; font.bold: true }
    Label { text: "Profile name" }
    TextField {
        id: profileName
        objectName: "settingsProfileName"
        Layout.fillWidth: true
        text: page.cfg_settingsProfile
        property bool valid: /^[A-Za-z0-9_-]{1,64}$/.test(text)
        onTextEdited: if (/^[A-Za-z0-9_-]{1,64}$/.test(text)) page.cfg_settingsProfile = text
    }
    Label { visible: !profileName.valid; text: "Use 1–64 letters, digits, underscores or hyphens"; color: "#e06c75" }
    Label {
        Layout.fillWidth: true
        wrapMode: Text.WordWrap
        text: "Use default for config.json. Give split widgets different names to keep their layouts and notes independent. Apply or OK activates the selected profile; a new name copies the current settings."
    }
    TextField { Layout.fillWidth: true; text: page.filePath; readOnly: true; selectByMouse: true; placeholderText: "~/.config/someProducts-monitor/config.json" }
    Label {
        Layout.fillWidth: true
        wrapMode: Text.WordWrap
        text: "Settings are saved automatically and reused when you add this widget again. Edit the JSON file and save to update the widget. Instances with the same profile share this file."
    }
    Button {
        text: "Open config file"
        enabled: page.filePath.length > 0 && page.fileExists
        onClicked: Qt.openUrlExternally("file://" + page.filePath.split("/").map(encodeURIComponent).join("/"))
    }
    Label { Layout.fillWidth: true; wrapMode: Text.WordWrap; text: page.status }
    Label {
        Layout.fillWidth: true
        wrapMode: Text.WordWrap
        opacity: 0.65
        text: "Configure changes are saved after Apply or OK. Invalid file edits are left untouched; the widget keeps its current settings. Live timer progress, terminal sessions and keep-awake are not saved."
    }
    Item { Layout.fillHeight: true }
    function refresh() {
        if (request) return
        const selectedProfile = cfg_settingsProfile
        const xhr = new XMLHttpRequest()
        request = xhr
        xhr.onreadystatechange = function() {
            if (xhr.readyState !== XMLHttpRequest.DONE || request !== xhr) return
            request = null
            if (selectedProfile !== cfg_settingsProfile) { Qt.callLater(refresh); return }
            try {
                const result = JSON.parse(xhr.responseText)
                if (result.path) filePath = result.path
                fileExists = xhr.status === 200 ? result.configured : Boolean(result.path)
                status = xhr.status === 200 ? (result.configured ? "Saved file is valid · automatic reload is enabled" : "New profile · Apply or OK to create its file") : result.error || "Config file unavailable"
            } catch (e) { status = "Config file bridge unavailable" }
        }
        xhr.open("GET", "http://127.0.0.1:17341/config?profile=" + encodeURIComponent(selectedProfile))
        xhr.setRequestHeader("X-Monitor-Client", "plasma-widget")
        xhr.send()
    }
    onCfg_settingsProfileChanged: { filePath = ""; fileExists = false; Qt.callLater(refresh) }
    Timer { interval: 2000; running: page.visible; repeat: true; onTriggered: page.refresh() }
    Component.onCompleted: refresh()
    Component.onDestruction: if (request) request.abort()
}

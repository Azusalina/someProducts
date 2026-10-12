import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

ColumnLayout {
    id: page
    property string cfg_mediaService: ""
    property bool cfg_cavaEnabled: true
    property int cfg_cavaOpacity: 40
    property var players: []
    readonly property var choices: [{service: "", name: "Automatic — prefer playing media"}].concat(players)
    implicitWidth: 480
    spacing: 16
    Label { text: "Media player"; font.bold: true }
    ComboBox {
        Layout.fillWidth: true
        model: page.choices
        textRole: "name"
        currentIndex: Math.max(0, page.choices.findIndex(p => p.service === page.cfg_mediaService))
        onActivated: page.cfg_mediaService = page.choices[currentIndex].service
    }
    CheckBox { text: "CAVA background from system playback audio"; checked: page.cfg_cavaEnabled; onClicked: page.cfg_cavaEnabled = checked }
    RowLayout {
        Label { text: "Visualizer opacity (%)" }
        SpinBox { from: 0; to: 100; value: page.cfg_cavaOpacity; enabled: page.cfg_cavaEnabled; onValueModified: page.cfg_cavaOpacity = value }
    }
    Label { Layout.fillWidth: true; text: "The desktop element shows only progress and a pause/resume icon. CAVA reads the current output monitor, never the microphone. If the player has no duration/position, the progress track remains empty."; wrapMode: Text.Wrap; opacity: 0.7 }
    Item { Layout.fillHeight: true }
    function loadPlayers() {
        const xhr = new XMLHttpRequest()
        xhr.onreadystatechange = function() {
            if (xhr.readyState !== XMLHttpRequest.DONE || xhr.status !== 200) return
            try { players = JSON.parse(xhr.responseText).media.players || [] } catch (error) {}
        }
        xhr.open("GET", "http://127.0.0.1:17341/snapshot")
        xhr.setRequestHeader("X-Monitor-Client", "plasma-widget")
        xhr.send()
    }
    Component.onCompleted: loadPlayers()
}

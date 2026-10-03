pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Layouts

Item {
    id: card
    property color ink: "#f5f5f4"
    property var players: []
    property string selectedService: ""
    readonly property var player: players.find(p => p.service === selectedService) || players[0] || null
    property bool cavaEnabled: true
    property real cavaOpacity: 0.4
    property var audioBars: []
    property var audioRequest: null
    property real clock: Date.now() / 1000
    readonly property real position: {
        if (!player || player.position === null || player.position === undefined) return 0
        const elapsed = player.status === "Playing" ? Math.max(0, clock - (player.observed_at || clock)) * (player.rate || 1) : 0
        return Math.max(0, player.position + elapsed)
    }
    readonly property bool hasProgress: !!player && player.duration > 0 && player.position !== null && player.position !== undefined
    readonly property real progress: hasProgress ? Math.min(1, position / player.duration) : 0
    signal toggleRequested(string service)
    implicitHeight: 40
    clip: true
    function pollAudio() {
        if (audioRequest) return
        const xhr = new XMLHttpRequest()
        audioRequest = xhr
        audioTimeout.restart()
        xhr.onreadystatechange = function() {
            if (xhr.readyState !== XMLHttpRequest.DONE) return
            audioTimeout.stop()
            audioRequest = null
            try { audioBars = xhr.status === 200 ? JSON.parse(xhr.responseText).bars || [] : [] }
            catch (error) { audioBars = [] }
        }
        xhr.open("GET", "http://127.0.0.1:17341/audio")
        xhr.setRequestHeader("X-Monitor-Client", "plasma-widget")
        xhr.send()
    }
    Timer { interval: 100; running: !!card.player && card.player.status === "Playing"; repeat: true; onTriggered: card.clock = Date.now() / 1000 }
    Timer {
        interval: 100
        running: card.visible && card.cavaEnabled && !!card.player && card.player.status === "Playing"
        repeat: true
        onTriggered: card.pollAudio()
        onRunningChanged: if (!running) card.audioBars = []
    }
    Timer {
        id: audioTimeout
        interval: 2000
        onTriggered: { if (card.audioRequest) card.audioRequest.abort(); card.audioRequest = null; card.audioBars = [] }
    }
    Component.onDestruction: if (audioRequest) audioRequest.abort()
    Item {
        objectName: "cavaBackground"
        anchors.fill: parent
        visible: card.cavaEnabled && !!card.player && card.player.status === "Playing"
        opacity: card.cavaOpacity
        Sparkline {
            objectName: "cavaFlow"
            anchors.fill: parent
            ink: card.ink
            values: card.audioBars
            sampleCount: 0
            maximum: 1
            strokeWidth: 2
            transitionDuration: 100
        }
    }
    RowLayout {
        anchors.fill: parent
        anchors.leftMargin: 2
        anchors.rightMargin: 2
        spacing: 12
        Item {
            Layout.fillWidth: true
            implicitHeight: 12
            Accessible.role: Accessible.ProgressBar
            Accessible.name: "Media playback progress"
            Accessible.description: card.hasProgress ? Math.round(card.progress * 100) + "%" : "Player has no progress information"
            Rectangle { anchors.verticalCenter: parent.verticalCenter; width: parent.width; height: 2; color: card.ink; opacity: 0.2 }
            Rectangle { objectName: "mediaProgress"; anchors.verticalCenter: parent.verticalCenter; width: parent.width * card.progress; height: 2; color: card.ink }
        }
        SmallButton {
            objectName: "mediaToggle"
            text: card.player && card.player.status === "Playing" ? "Ⅱ" : "▷"
            ink: card.ink
            Accessible.name: card.player && card.player.status === "Playing" ? "Pause media" : "Resume media"
            enabled: !!card.player && card.player.can_control && (card.player.status === "Playing" ? card.player.can_pause : card.player.can_play)
            onClicked: card.toggleRequested(card.player.service)
        }
    }
}

import QtQuick
import QtQuick.Window
import "../plasmoid/contents/ui"
Window {
    id: root
    property string lastMediaService: ""
    visible: true
    width: 300; height: 200
    QtObject {
        id: prefs
        property int audioRefreshMs: 75
        property int countdownSeconds: 20
        property int stopwatchSeconds: 0
        property string countdownColor: "#aabbcc"
        property string countdownStyle: "digital"
        property string stopwatchColor: "#88ddaa"
        property string stopwatchStyle: "digital"
    }
    TimerOwner {
        id: timers; objectName: "focusTimerOwner"; preferences: prefs; active: true
        onMediaToggleRequested: service => {
            root.lastMediaService = service
            mediaPlayers = mediaPlayers.map(player => Object.assign({}, player, {status: player.status === "Playing" ? "Paused" : "Playing"}))
        }
    }
    function seedMedia() {
        timers.mediaPlayers = [{service: "org.mpris.MediaPlayer2.FocusTest", status: "Playing", position: 30, duration: 120,
            observed_at: Date.now()/1000, rate: 1, can_control: true, can_pause: true, can_play: true}]
    }
    ClockFace { anchors.fill: parent; owner: timers; kind: "countdown" }
    ClockFace { x: 320; width: 200; height: 150; owner: timers; kind: "stopwatch" }
    function start() { timers.control("countdown", "start") }
    function preset(seconds) { timers.setTime("countdown", seconds) }
}

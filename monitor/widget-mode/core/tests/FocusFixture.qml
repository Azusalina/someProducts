import QtQuick
import QtQuick.Window
import "../plasmoid/contents/ui"
Window {
    visible: true
    width: 300; height: 200
    QtObject {
        id: prefs
        property int countdownSeconds: 20
        property int stopwatchSeconds: 0
        property string countdownColor: "#aabbcc"
        property string countdownStyle: "digital"
    }
    TimerOwner { id: timers; objectName: "focusTimerOwner"; preferences: prefs; active: true }
    ClockFace { anchors.fill: parent; owner: timers; kind: "countdown" }
    function start() { timers.control("countdown", "start") }
    function preset(seconds) { timers.setTime("countdown", seconds) }
}

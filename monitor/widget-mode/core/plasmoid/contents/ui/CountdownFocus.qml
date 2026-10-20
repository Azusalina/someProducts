import QtQuick
import QtQuick.Window

Window {
    id: focusWindow
    required property var owner
    readonly property string kind: owner.focusKind
    objectName: kind + "FocusWindow"
    title: (kind === "countdown" ? "Countdown" : "Stopwatch") + " · Focus Mode"
    width: 960; height: 640
    color: "#101010"
    visible: true
    visibility: Window.FullScreen
    readonly property color ink: /^#[0-9a-fA-F]{6}$/.test(owner.preferences[kind + "Color"] || "") ? owner.preferences[kind + "Color"] : "#f5f5f4"
    function exitFocus() { owner.focusOpen = false }
    onClosing: close => {
        close.accepted = false
        Qt.callLater(exitFocus)
    }
    Component.onCompleted: { requestActivate(); clock.forceActiveFocus() }
    Shortcut { sequence: "Escape"; onActivated: focusWindow.exitFocus() }
    Shortcut {
        sequence: "Space"
        autoRepeat: false
        enabled: !clock.editing
        onActivated: {
            if (focusWindow.owner.session && !focusWindow.owner.busy && !clock.reading.finished)
                focusWindow.owner.control(focusWindow.kind, clock.reading.running ? "pause" : "start")
        }
    }
    SmallButton {
        objectName: focusWindow.kind + "ExitFocus"
        anchors.top: parent.top; anchors.right: parent.right
        anchors.margins: 24
        text: "Exit · Esc"; ink: focusWindow.ink
        onClicked: focusWindow.exitFocus()
    }
    ClockFace {
        id: clock
        objectName: focusWindow.kind === "countdown" ? "focusCountdownFace" : "focusStopwatchFace"
        anchors.centerIn: parent
        width: Math.max(100, Math.min(900, focusWindow.width - 64))
        height: implicitHeight
        owner: focusWindow.owner
        kind: focusWindow.kind
        focusPresentation: true
        ink: focusWindow.ink
        style: owner.preferences[kind + "Style"] || "minimal"
    }
    Text {
        anchors.bottom: parent.bottom; anchors.horizontalCenter: parent.horizontalCenter
        anchors.bottomMargin: 24
        text: focusWindow.owner.error || "Space starts / pauses · Click time to edit · Enter confirms · Esc exits"
        color: focusWindow.ink; opacity: 0.5
        font.pixelSize: 12
        width: parent.width - 48
        horizontalAlignment: Text.AlignHCenter
        wrapMode: Text.Wrap
    }
}

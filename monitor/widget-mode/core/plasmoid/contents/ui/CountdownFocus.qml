import QtQuick
import QtQuick.Window

Window {
    id: focusWindow
    required property var owner
    objectName: "countdownFocusWindow"
    title: "Countdown · Focus Mode"
    width: 960; height: 640
    color: "#101010"
    visible: true
    visibility: Window.FullScreen
    readonly property color ink: /^#[0-9a-fA-F]{6}$/.test(owner.preferences.countdownColor || "") ? owner.preferences.countdownColor : "#f5f5f4"
    function exitFocus() { owner.focusOpen = false }
    onClosing: close => {
        close.accepted = false
        Qt.callLater(exitFocus)
    }
    Component.onCompleted: { requestActivate(); clock.forceActiveFocus() }
    Shortcut { sequence: "Escape"; onActivated: focusWindow.exitFocus() }
    SmallButton {
        objectName: "exitCountdownFocus"
        anchors.top: parent.top; anchors.right: parent.right
        anchors.margins: 24
        text: "Exit · Esc"; ink: focusWindow.ink
        onClicked: focusWindow.exitFocus()
    }
    ClockFace {
        id: clock
        objectName: "focusCountdownFace"
        anchors.centerIn: parent
        width: Math.max(100, Math.min(900, focusWindow.width - 64))
        height: implicitHeight
        owner: focusWindow.owner
        kind: "countdown"
        focusPresentation: true
        ink: focusWindow.ink
        style: owner.preferences.countdownStyle || "minimal"
    }
    Text {
        anchors.bottom: parent.bottom; anchors.horizontalCenter: parent.horizontalCenter
        anchors.bottomMargin: 24
        text: focusWindow.owner.error || "Click time to edit · Enter confirms · Esc exits"
        color: focusWindow.ink; opacity: 0.5
        font.pixelSize: 12
        width: parent.width - 48
        horizontalAlignment: Text.AlignHCenter
        wrapMode: Text.Wrap
    }
}

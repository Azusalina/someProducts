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
    property bool mediaAwake: false
    property point lastPointer: Qt.point(-1, -1)
    function wakeMedia() { mediaAwake = true; mediaHide.restart() }
    function trackPointer(position) {
        if (position.x === lastPointer.x && position.y === lastPointer.y) return
        lastPointer = Qt.point(position.x, position.y)
        wakeMedia()
    }
    Timer {
        id: mediaHide
        interval: 3000
        onTriggered: { if (mediaHover.hovered) restart(); else focusWindow.mediaAwake = false }
    }
    Item {
        anchors.fill: parent
        HoverHandler { onPointChanged: focusWindow.trackPointer(point.position) }
    }
    FocusAmbient {
        objectName: "focusAmbient"
        refreshInterval: Math.max(50, Math.min(1000, focusWindow.owner.preferences.audioRefreshMs === undefined ? 100 : focusWindow.owner.preferences.audioRefreshMs))
        anchors.fill: parent
        enabled: focusWindow.owner.preferences.cavaEnabled !== false
        ink: /^#[0-9a-fA-F]{6}$/.test(focusWindow.owner.preferences.cavaFlowColor || "") ? focusWindow.owner.preferences.cavaFlowColor : focusWindow.ink
        opacity: (focusWindow.owner.preferences.cavaOpacity === undefined ? 40 : focusWindow.owner.preferences.cavaOpacity) / 100
    }
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
        visible: !focusWindow.mediaAwake
        text: focusWindow.owner.error || "Space starts / pauses · Click time to edit · Enter confirms · Esc exits"
        color: focusWindow.ink; opacity: 0.5
        font.pixelSize: 12
        width: parent.width - 48
        horizontalAlignment: Text.AlignHCenter
        wrapMode: Text.Wrap
    }
    Rectangle {
        id: mediaPanel
        objectName: "focusMediaPanel"
        anchors.right: parent.right; anchors.bottom: parent.bottom
        anchors.margins: 24
        width: Math.min(300, focusWindow.width - 48); height: 62
        color: "#ee101010"
        opacity: focusWindow.mediaAwake ? 1 : 0
        visible: opacity > 0
        enabled: focusWindow.mediaAwake
        Behavior on opacity { NumberAnimation { duration: 180 } }
        HoverHandler {
            id: mediaHover
            onHoveredChanged: {
                if (hovered) focusWindow.wakeMedia()
                else if (focusWindow.mediaAwake) mediaHide.restart()
            }
        }
        MediaCard {
            id: media
            objectName: "focusMediaCard"
            anchors.fill: parent; anchors.margins: 12
            ink: focusWindow.ink
            players: focusWindow.owner.mediaPlayers
            selectedService: focusWindow.owner.preferences.mediaService || ""
            cavaEnabled: false
            visible: !!player
            onToggleRequested: service => focusWindow.owner.mediaToggleRequested(service)
        }
        Text {
            anchors.centerIn: parent
            visible: !media.player
            text: "No active media"
            font.pixelSize: 12; color: focusWindow.ink
        }
    }
}

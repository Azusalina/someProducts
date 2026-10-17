import QtQuick
import QtQuick.Layouts
import QtQuick.Controls
import QtQuick.Shapes

Item {
    id: face
    required property var owner
    required property string kind
    property var reading: owner.readings[kind] || ({})
    property color ink: "#f5f5f4"
    property string style: "minimal"
    property bool focusPresentation: false
    readonly property real seconds: reading.seconds || 0
    readonly property bool ring: style === "ring"
    property bool editing: false
    property string editError: ""
    readonly property bool blinking: kind === "countdown" && owner.countdownFinished && !owner.completionAcknowledged && !editing
    activeFocusOnTab: true
    onEditingChanged: if (kind === "countdown") owner.countdownEditing = editing
    Component.onDestruction: if (kind === "countdown" && editing) owner.countdownEditing = false
    Keys.onPressed: event => {
        if ((event.key === Qt.Key_Return || event.key === Qt.Key_Enter) && face.kind === "countdown" && face.owner.acknowledgeCountdown()) {
            event.accepted = true
        }
    }
    SequentialAnimation {
        running: face.blinking
        loops: Animation.Infinite
        NumberAnimation { target: face; property: "opacity"; from: 1; to: 0.18; duration: 350 }
        NumberAnimation { target: face; property: "opacity"; from: 0.18; to: 1; duration: 350 }
        onStopped: face.opacity = 1
    }
    function beginEdit() {
        if (!owner.session) return
        editError = ""
        timeInput.text = timeText(seconds)
        editing = true
        timeInput.forceActiveFocus()
        timeInput.selectAll()
    }
    function confirmEdit() {
        let text = timeInput.text
        if (kind === "countdown" && /^\d{1,6}$/.test(text)) {
            const digits = text.padStart(6, "0")
            text = digits.slice(0, 2) + ":" + digits.slice(2, 4) + ":" + digits.slice(4, 6)
        }
        const parts = /^(\d{2}):([0-5]\d):([0-5]\d)$/.exec(text)
        const value = parts ? Number(parts[1]) * 3600 + Number(parts[2]) * 60 + Number(parts[3]) : -1
        if (value < (kind === "countdown" ? 1 : 0) || value > 86400) {
            editError = kind === "countdown" ? "Use HH:MM:SS or digits · 1s–24h" : "Use 00:00:00–24:00:00"
            return
        }
        owner.setTime(kind, value)
        editing = false
        editError = ""
    }
    function timeText(value) {
        const seconds = Math.max(0, kind === "countdown" ? Math.ceil(value) : Math.floor(value))
        const hours = Math.floor(seconds / 3600)
        return (String(hours).padStart(2, "0") + ":") + String(Math.floor(seconds / 60) % 60).padStart(2, "0") + ":" + String(seconds % 60).padStart(2, "0")
    }
    implicitHeight: contents.implicitHeight
    signal borderResizeRequested(string edge, real delta)
    BorderGrip { anchors.fill: parent; visible: !face.focusPresentation; z: 20; edges: ["top","bottom"]; ink: face.ink; onFinished: (edge,delta) => face.borderResizeRequested(edge,delta) }
    ColumnLayout {
        id: contents
        anchors.fill: parent
        spacing: 2
    RowLayout {
        Layout.fillWidth: true
        spacing: 0
    Text { Layout.fillWidth: true; text: face.kind === "countdown" ? "COUNTDOWN" : "STOPWATCH"; color: face.ink; opacity: 0.5; font.pixelSize: 8; horizontalAlignment: Text.AlignHCenter; font.letterSpacing: 0.7 }
        SmallButton {
            objectName: "countdownFocus"
            visible: face.kind === "countdown" && !face.focusPresentation
            implicitWidth: 22; implicitHeight: 24
            text: "⛶"; ink: face.ink
            enabled: face.owner.session.length > 0 && !face.editing
            Accessible.name: "Open countdown in fullscreen Focus Mode"
            ToolTip.visible: hovered
            ToolTip.text: "Focus Mode"
            onClicked: face.owner.openFocus()
        }
    }
    Item {
        Layout.fillWidth: true
        implicitHeight: face.focusPresentation ? 300 : face.ring ? 76 : 34
        Item {
            id: arc
            objectName: face.kind + "Arc"
            anchors.centerIn: parent
            width: 74; height: 74
            scale: face.focusPresentation ? 3.8 : 1
            visible: face.ring
            readonly property real amount: face.kind === "countdown" ? face.seconds / Math.max(1, face.reading.initial || 1) : (face.seconds % 60) / 60
            Rectangle {
                anchors.centerIn: parent
                width: 68; height: 68; radius: 34
                color: "transparent"
                border.width: 1.5
                border.color: Qt.rgba(face.ink.r, face.ink.g, face.ink.b, 0.15)
            }
            Shape {
                anchors.fill: parent
                ShapePath {
                    strokeColor: Qt.rgba(face.ink.r, face.ink.g, face.ink.b, 0.85)
                    strokeWidth: 1.5
                    fillColor: "transparent"
                    capStyle: ShapePath.RoundCap
                    PathAngleArc { centerX: 37; centerY: 37; radiusX: 34; radiusY: 34; startAngle: -90; sweepAngle: 360 * Math.max(0, Math.min(1, arc.amount)) }
                }
            }
        }
        Text {
            objectName: face.kind + "Time"
            anchors.centerIn: parent
            width: parent.width
            visible: !face.editing
            text: face.timeText(face.seconds)
            color: face.ink
            font.pixelSize: face.focusPresentation ? (face.ring ? 48 : 110) : face.ring ? 14 : 20
            font.family: face.style === "digital" ? "monospace" : ""
            font.weight: face.style === "digital" ? Font.Medium : Font.Light
            horizontalAlignment: Text.AlignHCenter
            fontSizeMode: Text.Fit; minimumPixelSize: 10
            MouseArea { anchors.fill: parent; cursorShape: Qt.IBeamCursor; onClicked: face.beginEdit() }
        }
        TextField {
            id: timeInput
            objectName: face.kind + "TimeInput"
            anchors.centerIn: parent
            width: parent.width
            height: face.focusPresentation ? 100 : 30
            visible: face.editing
            color: face.ink
            font.family: "monospace"
            font.pixelSize: face.focusPresentation ? Math.min(80, width / 5.5) : Math.min(16, Math.max(10, width / 5.5))
            horizontalAlignment: TextInput.AlignHCenter
            selectByMouse: true
            maximumLength: 8
            padding: 0
            Accessible.name: "Set " + face.kind + " time in HH:MM:SS; Enter to confirm"
            Accessible.description: face.kind === "countdown" ? "Colons are optional: 23000 means 02:30:00; 2935 means 00:29:35" : ""
            background: Rectangle { color: "transparent"; Rectangle { anchors.bottom: parent.bottom; width: parent.width; height: 1; color: face.editError ? "#e06c75" : face.ink; opacity: 0.6 } }
            onAccepted: face.confirmEdit()
            onActiveFocusChanged: if (!activeFocus && face.editing) { face.editing = false; face.editError = "" }
            Keys.onEscapePressed: event => { face.editing = false; face.editError = ""; event.accepted = true }
        }
    }
    Text { Layout.fillWidth: true; visible: face.editError.length > 0; text: face.editError; color: "#e06c75"; font.pixelSize: 8; wrapMode: Text.Wrap; horizontalAlignment: Text.AlignHCenter }
    RowLayout {
        Layout.alignment: Qt.AlignHCenter
        spacing: 2
        SmallButton {
            objectName: face.kind + "Toggle"
            implicitWidth: face.focusPresentation ? 64 : 34; implicitHeight: face.focusPresentation ? 40 : 24
            text: face.reading.running ? "Ⅱ" : "▶"
            ink: face.ink
            enabled: face.owner.session.length > 0 && !face.owner.busy && !face.editing && !face.reading.finished
            Accessible.name: (face.reading.running ? "Pause " : "Start ") + face.kind
            onClicked: { face.owner.control(face.kind, face.reading.running ? "pause" : "start"); face.forceActiveFocus() }
        }
        SmallButton {
            objectName: face.kind + "Reset"
            implicitWidth: face.focusPresentation ? 64 : 34; implicitHeight: face.focusPresentation ? 40 : 24
            text: "↺"; ink: face.ink
            enabled: face.owner.session.length > 0 && !face.owner.busy && !face.editing
            Accessible.name: "Reset " + face.kind
            onClicked: {
                if (face.kind !== "countdown" || !face.owner.acknowledgeCountdown()) face.owner.control(face.kind, "reset")
                face.forceActiveFocus()
            }
        }

    }
    Text { Layout.fillWidth: true; text: face.reading.finished ? "Done" : face.reading.running ? "Running" : "Paused"; color: face.ink; opacity: 0.55; font.pixelSize: 8; horizontalAlignment: Text.AlignHCenter }
    }
}

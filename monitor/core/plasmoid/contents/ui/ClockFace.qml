import QtQuick
import QtQuick.Layouts

ColumnLayout {
    id: face
    required property var owner
    required property string kind
    property var reading: owner.readings[kind] || ({})
    property color ink: "#f5f5f4"
    property string style: "minimal"
    readonly property real seconds: reading.seconds || 0
    readonly property bool ring: style === "ring"
    spacing: 2
    function timeText(value) {
        const seconds = Math.max(0, kind === "countdown" ? Math.ceil(value) : Math.floor(value))
        const hours = Math.floor(seconds / 3600)
        return (hours > 0 ? String(hours).padStart(2, "0") + ":" : "") + String(Math.floor(seconds / 60) % 60).padStart(2, "0") + ":" + String(seconds % 60).padStart(2, "0")
    }
    Text { Layout.fillWidth: true; text: face.kind === "countdown" ? "COUNTDOWN" : "STOPWATCH"; color: face.ink; opacity: 0.5; font.pixelSize: 8; horizontalAlignment: Text.AlignHCenter; font.letterSpacing: 0.7 }
    Item {
        Layout.fillWidth: true
        implicitHeight: face.ring ? 76 : 34
        Canvas {
            id: arc
            anchors.centerIn: parent
            width: 74; height: 74
            visible: face.ring
            property real amount: face.kind === "countdown" ? face.seconds / Math.max(1, face.reading.initial || 1) : (face.seconds % 60) / 60
            onAmountChanged: requestPaint()
            onVisibleChanged: requestPaint()
            Connections { target: face; function onInkChanged() { arc.requestPaint() } }
            onPaint: {
                const ctx = getContext("2d"); ctx.clearRect(0, 0, width, height)
                ctx.strokeStyle = face.ink; ctx.lineWidth = 1.5
                ctx.globalAlpha = 0.15; ctx.beginPath(); ctx.arc(width / 2, height / 2, 34, 0, Math.PI * 2); ctx.stroke()
                ctx.globalAlpha = 0.85; ctx.beginPath(); ctx.arc(width / 2, height / 2, 34, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0, Math.min(1, amount))); ctx.stroke()
            }
        }
        Text {
            objectName: face.kind + "Time"
            anchors.centerIn: parent
            width: parent.width
            text: face.timeText(face.seconds)
            color: face.ink
            font.pixelSize: face.ring ? 14 : 20
            font.family: face.style === "digital" ? "monospace" : ""
            font.weight: face.style === "digital" ? Font.Medium : Font.Light
            horizontalAlignment: Text.AlignHCenter
            fontSizeMode: Text.Fit; minimumPixelSize: 10
        }
    }
    RowLayout {
        Layout.alignment: Qt.AlignHCenter
        spacing: 2
        SmallButton {
            objectName: face.kind + "Toggle"
            implicitWidth: 34; implicitHeight: 24
            text: face.reading.running ? "Ⅱ" : "▶"
            ink: face.ink
            enabled: face.owner.session.length > 0 && !face.owner.busy && !face.reading.finished
            Accessible.name: (face.reading.running ? "Pause " : "Start ") + face.kind
            onClicked: face.owner.control(face.kind, face.reading.running ? "pause" : "start")
        }
        SmallButton {
            objectName: face.kind + "Reset"
            implicitWidth: 34; implicitHeight: 24
            text: "↺"; ink: face.ink
            enabled: face.owner.session.length > 0 && !face.owner.busy
            Accessible.name: "Reset " + face.kind
            onClicked: face.owner.control(face.kind, "reset")
        }
    }
    Text { Layout.fillWidth: true; text: face.reading.finished ? "Done" : face.reading.running ? "Running" : "Paused"; color: face.ink; opacity: 0.55; font.pixelSize: 8; horizontalAlignment: Text.AlignHCenter }
}

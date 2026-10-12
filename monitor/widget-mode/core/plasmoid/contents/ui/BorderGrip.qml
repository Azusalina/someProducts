pragma ComponentBehavior: Bound
import QtQuick

Item {
    id: frame
    property color ink: "#f5f5f4"
    property var edges: ["left", "right", "top", "bottom"]
    signal moved(string edge, real delta)
    signal finished(string edge, real delta)
    signal canceled()
    Repeater {
        model: frame.edges
        MouseArea {
            id: grip
            required property string modelData
            readonly property bool vertical: modelData === "left" || modelData === "right"
            width: vertical ? 5 : frame.width - 10
            height: vertical ? frame.height : 5
            x: modelData === "right" ? frame.width - 5 : vertical ? 0 : 5
            y: modelData === "bottom" ? frame.height - 5 : 0
            hoverEnabled: true
            preventStealing: true
            cursorShape: vertical ? Qt.SizeHorCursor : Qt.SizeVerCursor
            property real origin: 0
            property real delta: 0
            onPressed: mouse => { const p=mapToItem(null,mouse.x,mouse.y);origin=vertical?p.x:p.y;delta=0 }
            onPositionChanged: mouse => {
                if (!pressed) return
                const p=mapToItem(null,mouse.x,mouse.y)
                delta=(vertical?p.x:p.y)-origin
                frame.moved(modelData,delta)
            }
            onReleased: frame.finished(modelData,delta)
            onCanceled: frame.canceled()
            Rectangle {
                anchors.centerIn: parent
                width: grip.vertical ? 1 : parent.width
                height: grip.vertical ? parent.height : 1
                color: frame.ink
                opacity: grip.pressed ? 0.6 : grip.containsMouse ? 0.35 : 0.08
            }
        }
    }
}

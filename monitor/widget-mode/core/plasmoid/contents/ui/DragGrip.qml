import QtQuick
import QtQuick.Window
import QtQuick.Controls
Item {
    id: grip
    property string module: ""
    property color ink: "#f5f5f4"
    property bool moving: false
    property point position: Qt.point(0,0)
    signal released(point position)
    width: 18; height: 16
    Text { anchors.centerIn: parent; text: "⠿"; color: grip.ink; font.pixelSize: 12; opacity: mouse.containsMouse ? 1 : 0.35 }
    MouseArea {
        id: mouse
        anchors.fill: parent; hoverEnabled: true
        cursorShape: pressed ? Qt.ClosedHandCursor : Qt.OpenHandCursor
        preventStealing: true
        property point origin
        onPressed: event => { origin = mapToGlobal(event.x,event.y); grip.position=origin }
        onPositionChanged: event => {
            if(!pressed)return
            grip.position=mapToGlobal(event.x,event.y)
            if(Math.abs(grip.position.x-origin.x)+Math.abs(grip.position.y-origin.y)>8)grip.moving=true
        }
        onReleased: event => {
            const moved=grip.moving;grip.moving=false
            if(moved)grip.released(mapToGlobal(event.x,event.y))
        }
        onCanceled: grip.moving=false
    }
    ToolTip.visible: mouse.containsMouse && !mouse.pressed
    ToolTip.text: "Drag " + module + " out to split; drag back to restore"
    Rectangle {
        parent: grip.Window.window ? grip.Window.window.contentItem : grip
        z: 10000
        x: parent.mapFromGlobal(grip.position).x + 12
        y: parent.mapFromGlobal(grip.position).y + 12
        width: 110; height: 28
        visible: grip.moving
        color: "#ee181818"; border.color: grip.ink
        Text { anchors.centerIn: parent; text: grip.module; color: grip.ink; font.pixelSize: 12 }
    }
}

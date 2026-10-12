import QtQuick

MouseArea {
    id: grip
    required property var preferences
    required property string splitKey
    property real available: 200
    property real minimumLeft: 70
    property real minimumRight: 70
    property real fraction: 0.5
    property color ink: "#f5f5f4"
    signal changed(real ratio)
    width: 7
    hoverEnabled: true
    preventStealing: true
    cursorShape: Qt.SizeHorCursor
    property real origin: 0
    property real base: 0
    property real ratio: fraction
    onPressed: mouse => { origin=mapToItem(null,mouse.x,mouse.y).x;base=fraction;ratio=base }
    onPositionChanged: mouse => {
        if(!pressed) return
        ratio=Math.max(Math.max(0.15,minimumLeft/available),Math.min(Math.min(0.85,1-minimumRight/available),base+(mapToItem(null,mouse.x,mouse.y).x-origin)/available))
        changed(ratio)
    }
    onReleased: {
        const data=JSON.parse(preferences.layoutSplits || "{}")
        data[splitKey]=Math.max(0.15,Math.min(0.85,ratio))
        preferences.layoutSplits=JSON.stringify(data)
    }
    Rectangle { anchors.horizontalCenter: parent.horizontalCenter; height: parent.height; width: 1; color: grip.ink; opacity: grip.containsMouse || grip.pressed ? 0.55 : 0.18 }
}

import QtQuick
import QtQuick.Layouts
import "ResizeTools.js" as ResizeTools
ColumnLayout {
    id: card
    required property var owner
    required property var preferences
    property bool stacked: false
    property color ink: "#f5f5f4"
    function resizeFace(kind, face, edge, delta) {
        const saved=ResizeTools.heights(preferences.layoutHeights)
        saved[kind+"Body"]=Math.round(Math.max(face.implicitHeight,Math.min(600,face.height+(edge === "top" ? -delta : delta))))
        preferences.layoutHeights=JSON.stringify(saved)
    }
    function colorFor(kind) { const value = preferences[kind + "Color"]; return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value) ? value : ink }
    readonly property real timerFraction: Math.max(85/Math.max(170,width-13),Math.min(1-85/Math.max(170,width-13),ResizeTools.fraction(preferences.layoutSplits,"timers",0.5)))
    property real separatorOrigin: 0
    spacing: 3
    GridLayout {
        Layout.fillWidth: true
        columns: card.stacked ? 1 : 3
        columnSpacing: 6; rowSpacing: 6
        ClockFace { id: countdown; objectName: "countdownFace"; Layout.preferredHeight: Math.max(implicitHeight,ResizeTools.heights(card.preferences.layoutHeights).countdownBody || 0); Layout.row: card.stacked ? 2 : 0; Layout.column: 0; Layout.fillWidth: true; Layout.preferredWidth: card.stacked ? 1 : (card.width-13)*card.timerFraction; Layout.maximumWidth: card.stacked ? Infinity : (card.width-13)*card.timerFraction; Layout.alignment: Qt.AlignTop; owner: card.owner; kind: "countdown"; ink: card.colorFor(kind); style: card.preferences.countdownStyle || "minimal"; onBorderResizeRequested: (edge,delta) => card.resizeFace("countdown",countdown,edge,delta) }
        Rectangle { Layout.row: card.stacked ? 1 : 0; Layout.column: card.stacked ? 0 : 1; Layout.fillHeight: !card.stacked; Layout.fillWidth: card.stacked; implicitWidth: 1; implicitHeight: card.stacked ? 1 : 0; color: card.ink; opacity: 0.12
            MouseArea {
                anchors.fill: parent
                anchors.margins: -3
                preventStealing: true
                cursorShape: card.stacked ? Qt.SizeVerCursor : Qt.SizeHorCursor
                onPressed: mouse => { const p=mapToItem(null,mouse.x,mouse.y);card.separatorOrigin=card.stacked ? p.y : p.x }
                onReleased: mouse => {
                    const p=mapToItem(null,mouse.x,mouse.y),delta=(card.stacked ? p.y : p.x)-card.separatorOrigin
                    if(card.stacked) card.resizeFace("stopwatch",stopwatch,"bottom",delta)
                    else ResizeTools.saveSplit(card.preferences,"timers",card.timerFraction+delta/Math.max(170,card.width-13))
                }
            }
        }
        ClockFace { id: stopwatch; objectName: "stopwatchFace"; Layout.preferredHeight: Math.max(implicitHeight,ResizeTools.heights(card.preferences.layoutHeights).stopwatchBody || 0); Layout.row: 0; Layout.column: card.stacked ? 0 : 2; Layout.fillWidth: true; Layout.preferredWidth: card.stacked ? 1 : (card.width-13)*(1-card.timerFraction); Layout.maximumWidth: card.stacked ? Infinity : (card.width-13)*(1-card.timerFraction); Layout.alignment: Qt.AlignTop; owner: card.owner; kind: "stopwatch"; ink: card.colorFor(kind); style: card.preferences.stopwatchStyle || "minimal"; onBorderResizeRequested: (edge,delta) => card.resizeFace("stopwatch",stopwatch,edge,delta) }
    }
    Text { visible: card.owner.error.length > 0; text: card.owner.error; color: card.ink; opacity: 0.6; font.pixelSize: 9; wrapMode: Text.Wrap; Layout.fillWidth: true }
}

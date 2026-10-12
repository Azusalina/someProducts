import QtQuick
import QtQuick.Layouts
import "TodoTools.js" as TodoTools
import "ResizeTools.js" as ResizeTools

Item {
    id: card
    objectName: "todoCard"
    required property var preferences
    property color ink: "#f5f5f4"
    readonly property var tasks: TodoTools.parse(preferences.todoItems)
    readonly property int textSize: preferences.todoFontSize === undefined ? 11 : preferences.todoFontSize
    property real previewSplit: -1
    property real resizeHeight: -1
    readonly property real fraction: Math.max(70/(width-17),Math.min(1-70/(width-17),previewSplit < 0 ? ResizeTools.fraction(preferences.layoutSplits,"todos",0.5) : previewSplit))
    implicitHeight: resizeHeight >= 0 ? resizeHeight : preferences.todoHeight === undefined ? 130 : preferences.todoHeight
    function colorFor(value) { return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value) ? value : ink }
    function change(kind, id, text, remove) {
        const value = TodoTools.change(preferences.todoItems, kind, id, text, remove)
        if (value === null) return false
        preferences.todoItems = value
        return true
    }
    function toggle(kind, taskId) { preferences.todoItems = TodoTools.toggle(preferences.todoItems, kind, taskId) }
    RowLayout {
        anchors.fill: parent
        spacing: 17
        TodoColumn {
            controller: card
            kind: "pending"
            title: card.preferences.todoPendingTitle === undefined ? "pending" : card.preferences.todoPendingTitle
            items: card.tasks.pending
            ink: card.colorFor(card.preferences.todoPendingColor)
            textSize: card.textSize
            Layout.fillWidth: true
            Layout.fillHeight: true
            Layout.minimumWidth: 0
            Layout.preferredWidth: (card.width - 17) * card.fraction
            Layout.maximumWidth: (card.width - 17) * card.fraction
            onToggled: taskId => card.toggle("pending", taskId)
        }
        TodoColumn {
            controller: card
            kind: "urgent"
            title: card.preferences.todoUrgentTitle === undefined ? "urgent" : card.preferences.todoUrgentTitle
            items: card.tasks.urgent
            ink: card.colorFor(card.preferences.todoUrgentColor)
            textSize: card.textSize
            Layout.fillWidth: true
            Layout.fillHeight: true
            Layout.minimumWidth: 0
            Layout.preferredWidth: (card.width - 17) * (1-card.fraction)
            Layout.maximumWidth: (card.width - 17) * (1-card.fraction)
            onToggled: taskId => card.toggle("urgent", taskId)
        }
    }
    SplitGrip {
        objectName: "todoDivider"
        x: (card.width-17)*card.fraction+5
        height: card.height
        preferences: card.preferences
        splitKey: "todos"
        available: card.width-17
        fraction: card.fraction
        ink: card.ink
        onChanged: ratio => card.previewSplit=ratio
        onPressedChanged: if(!pressed) card.previewSplit=-1
    }
    BorderGrip {
        anchors.fill: parent
        edges: ["top","bottom"]
        ink: card.ink
        onMoved: (edge,delta) => card.resizeHeight=Math.max(80,Math.min(600,(card.preferences.todoHeight || 130)+(edge === "top" ? -delta : delta)))
        onFinished: (edge,delta) => { card.preferences.todoHeight=Math.round(card.resizeHeight < 0 ? card.height : card.resizeHeight);card.resizeHeight=-1 }
        onCanceled: card.resizeHeight=-1
    }
}

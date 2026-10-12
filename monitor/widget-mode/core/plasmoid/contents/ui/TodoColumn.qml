pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

ColumnLayout {
    id: column
    required property var controller
    property string editingId: ""
    property string inputError: ""
    required property string kind
    required property string title
    required property var items
    property color ink: "#f5f5f4"
    property int textSize: 11
    signal toggled(string taskId)
    spacing: 6
    Text {
        objectName: column.kind + "TodoTitle"
        Layout.fillWidth: true
        text: column.title
        textFormat: Text.PlainText
        color: column.ink
        font.pixelSize: column.textSize
        font.weight: Font.Medium
        elide: Text.ElideRight
    }
    TextField {
        id: newTask
        objectName: column.kind + "TodoInput"
        Layout.fillWidth: true
        Layout.minimumWidth: 0
        Layout.preferredHeight: 24
        placeholderText: "Add task · Enter"
        color: column.ink
        font.pixelSize: column.textSize
        maximumLength: 300
        background: Rectangle { color: "transparent"; border.width: 1; border.color: Qt.rgba(column.ink.r,column.ink.g,column.ink.b,0.2) }
        onAccepted: {
            if (column.controller.change(column.kind, "", text, false)) { text = ""; column.inputError = "" }
            else column.inputError = "Use 1–300 characters; up to 100 tasks per side"
        }
        ToolTip.visible: activeFocus && column.inputError.length > 0
        ToolTip.text: column.inputError
        ToolTip.timeout: 4000
    }
    Flickable {
        id: viewport
        objectName: column.kind + "TodoViewport"
        Layout.fillWidth: true
        Layout.fillHeight: true
        Layout.minimumWidth: 0
        clip: true
        contentWidth: width
        contentHeight: rows.height
        boundsBehavior: Flickable.StopAtBounds
        ScrollBar.vertical: ScrollBar { }
        ColumnLayout {
            id: rows
            width: viewport.width
            spacing: 3
            Repeater {
                model: column.items
                delegate: RowLayout {
                    id: task
                    required property var modelData
                    Layout.fillWidth: true
                    spacing: 4
                    SmallButton {
                        objectName: "todoToggle_" + task.modelData.id
                        Layout.alignment: Qt.AlignTop
                        implicitWidth: 18
                        implicitHeight: 18
                        ink: column.ink
                        font.pixelSize: 11
                        text: task.modelData.done ? "✓" : "□"
                        Accessible.name: (task.modelData.done ? "Mark pending: " : "Mark done: ") + task.modelData.text
                        onClicked: column.toggled(task.modelData.id)
                    }
                    Text {
                        objectName: "todoText_" + task.modelData.id
                        Layout.fillWidth: true
                        Layout.minimumWidth: 0
                        visible: column.editingId !== task.modelData.id
                        text: task.modelData.text
                        MouseArea {
                            anchors.fill: parent
                            cursorShape: Qt.IBeamCursor
                            onClicked: {
                                column.editingId = task.modelData.id
                                Qt.callLater(() => { editor.forceActiveFocus(); editor.selectAll() })
                            }
                        }
                        textFormat: Text.PlainText
                        wrapMode: Text.Wrap
                        color: column.ink
                        font.pixelSize: column.textSize
                        font.strikeout: task.modelData.done
                        opacity: task.modelData.done ? 0.45 : 1
                    }
                    TextField {
                        id: editor
                        objectName: "todoEdit_" + task.modelData.id
                        visible: column.editingId === task.modelData.id
                        Layout.fillWidth: true
                        Layout.minimumWidth: 0
                        Layout.preferredHeight: 24
                        text: task.modelData.text
                        color: column.ink
                        font.pixelSize: column.textSize
                        maximumLength: 300
                        selectByMouse: true
                        background: Rectangle { color: "transparent"; border.width: 1; border.color: column.ink }
                        onAccepted: if (column.controller.change(column.kind, task.modelData.id, text, false)) column.editingId = ""
                        onActiveFocusChanged: if (!activeFocus && visible) column.editingId = ""
                        Keys.onEscapePressed: event => { column.editingId = ""; event.accepted = true }
                        Keys.onDeletePressed: event => {
                            const id = task.modelData.id
                            column.editingId = ""
                            column.controller.change(column.kind, id, "", true)
                            event.accepted = true
                        }
                        ToolTip.visible: activeFocus
                        ToolTip.text: "Enter: save · Escape: cancel · Delete: remove task"
                        ToolTip.timeout: 4000
                    }
                }
            }
            Text {
                visible: column.items.length === 0
                Layout.fillWidth: true
                text: "No tasks"
                color: column.ink
                opacity: 0.35
                font.pixelSize: column.textSize
            }
        }
    }
}

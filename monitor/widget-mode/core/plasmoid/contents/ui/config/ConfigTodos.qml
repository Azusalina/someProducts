pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import "../TodoTools.js" as TodoTools

ScrollView {
    id: page
    property bool cfg_todoEnabled: true
    property string cfg_todoPendingTitle: "pending"
    property string cfg_todoUrgentTitle: "urgent"
    property string cfg_todoPendingColor: ""
    property string cfg_todoUrgentColor: ""
    property int cfg_todoFontSize: 11
    property int cfg_todoHeight: 130
    property string cfg_todoItems: '{"pending":[],"urgent":[]}'
    property bool editingItems: false
    property var originalTasks: TodoTools.empty()
    onCfg_todoItemsChanged: if (!editingItems) originalTasks = TodoTools.parse(cfg_todoItems)
    function editTasks(kind, text) {
        const value = TodoTools.edit(cfg_todoItems, kind, text, originalTasks)
        if (value !== null && TodoTools.lines(TodoTools.parse(cfg_todoItems), kind) !== text.split(/\r?\n/).map(line => line.trim()).filter(Boolean).join("\n")) {
            editingItems = true
            cfg_todoItems = value
            editingItems = false
        }
        return value !== null
    }
    implicitWidth: 480
    implicitHeight: 540
    contentWidth: availableWidth
    ScrollBar.horizontal.policy: ScrollBar.AlwaysOff
    ColumnLayout {
        width: page.availableWidth
        spacing: 12
        CheckBox { text: "Show to-do lists below the note"; checked: page.cfg_todoEnabled; onClicked: page.cfg_todoEnabled = checked }
        Label { Layout.fillWidth: true; text: "One task per line. Unchanged tasks keep their completion state; new or renamed tasks start pending. Apply or OK saves your changes."; wrapMode: Text.Wrap; opacity: 0.7 }
        RowLayout {
            Label { text: "Font size" }
            SpinBox { from: 9; to: 18; value: page.cfg_todoFontSize; onValueModified: page.cfg_todoFontSize = value }
            Label { text: "Height" }
            SpinBox { from: 80; to: 600; editable: true; value: page.cfg_todoHeight; onValueModified: page.cfg_todoHeight = value }
        }
        Repeater {
            model: ["pending", "urgent"]
            delegate: ColumnLayout {
                id: section
                required property string modelData
                readonly property string prefix: "cfg_todo" + (modelData === "pending" ? "Pending" : "Urgent")
                Layout.fillWidth: true
                Label { text: section.modelData === "pending" ? "Left list" : "Right list"; font.bold: true }
                RowLayout {
                    Label { text: "Title" }
                    TextField {
                        objectName: section.modelData + "TodoTitleSetting"
                        Layout.fillWidth: true
                        maximumLength: 64
                        text: page[section.prefix + "Title"]
                        onTextEdited: page[section.prefix + "Title"] = text
                    }
                }
                RowLayout {
                    Label { text: "Color" }
                    HexField {
                        objectName: section.modelData + "TodoColorSetting"
                        Layout.fillWidth: true
                        allowEmpty: true
                        hexValue: page[section.prefix + "Color"]
                        placeholderText: "Default text color"
                        onValidEdited: value => page[section.prefix + "Color"] = value
                    }
                }
                TextArea {
                    id: input
                    objectName: section.modelData + "TodoItemsSetting"
                    Layout.fillWidth: true
                    Layout.preferredHeight: 120
                    wrapMode: TextEdit.Wrap
                    textFormat: TextEdit.PlainText
                    selectByMouse: true
                    placeholderText: "One task per line…"
                    text: TodoTools.lines(TodoTools.parse(page.cfg_todoItems), section.modelData)
                    property bool validDraft: true
                    onTextChanged: {
                        validDraft = page.editTasks(section.modelData, text)
                    }
                }
                Label { Layout.fillWidth: true; visible: !input.validDraft; text: "Use up to 100 tasks per side, 300 characters per task (64 KiB total). Invalid drafts are not applied."; color: "#e06c75"; wrapMode: Text.Wrap }
            }
        }
    }
}

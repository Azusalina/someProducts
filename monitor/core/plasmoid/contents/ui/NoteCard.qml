import QtQuick
import QtQuick.Controls
Item {
    id: card
    property color ink: "#f5f5f4"
    required property var preferences
    property bool initialized: false
    property bool dirty: false
    implicitHeight: 85
    function flush() {
        if (initialized && dirty) {
            preferences.noteText = editor.text
            dirty = false
        }
    }
    Timer { id: save; interval: 400; onTriggered: card.flush() }
    TextArea {
        id: editor
        objectName: "noteEditor"
        anchors.fill: parent
        padding: 0
        color: card.ink
        selectionColor: Qt.rgba(card.ink.r, card.ink.g, card.ink.b, 0.25)
        selectedTextColor: card.ink
        placeholderText: "Leave a thought here…"
        placeholderTextColor: Qt.rgba(card.ink.r, card.ink.g, card.ink.b, 0.4)
        font.pixelSize: 12
        wrapMode: TextEdit.Wrap
        textFormat: TextEdit.PlainText
        selectByMouse: true
        background: null
        onTextChanged: if (card.initialized) { card.dirty = true; save.restart() }
        onActiveFocusChanged: if (!activeFocus) card.flush()
    }
    Component.onCompleted: {
        editor.text = preferences.noteText
        initialized = true
    }
    Component.onDestruction: flush()
}

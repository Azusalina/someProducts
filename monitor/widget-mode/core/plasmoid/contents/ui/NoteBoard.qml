import QtQuick

Column {
    id: board
    required property var preferences
    property color ink: "#f5f5f4"
    readonly property bool exporting: note.exporting
    readonly property string exportStatus: note.exportStatus
    readonly property bool exportFailed: note.exportFailed
    spacing: 10
    function chooseSaveFile() { note.chooseSaveFile() }
    NoteCard { id: note; width: board.width; height: implicitHeight; preferences: board.preferences; ink: board.ink }
    TodoCard {
        width: board.width
        height: visible ? implicitHeight : 0
        visible: board.preferences.todoEnabled === undefined || board.preferences.todoEnabled
        preferences: board.preferences
        ink: board.ink
    }
}

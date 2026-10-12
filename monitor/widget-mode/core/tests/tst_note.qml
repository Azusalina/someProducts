import QtQuick
import QtQuick.Dialogs
import QtTest
import "../plasmoid/contents/ui"

Item {
    id: root
    width: 420; height: 1000
    property var note: null
    QtObject {
        id: prefs
        property string noteText: ""
        property int noteHeight: 85
        property string noteExportUrl: ""
    }
    Component {
        id: factory
        NoteCard { width: 320; height: implicitHeight; preferences: prefs; useNativeDialog: false; endpoint: "http://127.0.0.1:17342/notes/save" }
    }
    TestCase {
        name: "NoteControls"
        when: windowShown
        function api() {
            const xhr = new XMLHttpRequest()
            let done = false, result = null
            xhr.onreadystatechange = () => {
                if (xhr.readyState === XMLHttpRequest.DONE) { result = JSON.parse(xhr.responseText); done = true }
            }
            xhr.open("GET", "http://127.0.0.1:17342/test/note")
            xhr.setRequestHeader("X-Monitor-Client", "plasma-widget")
            xhr.send()
            tryVerify(() => done, 3000)
            return result
        }
        function init() {
            prefs.noteText = ""
            prefs.noteHeight = 85
            prefs.noteExportUrl = ""
            note = factory.createObject(root)
            verify(note)
            wait(30)
        }
        function cleanup() { note.destroy(); note = null; wait(50) }
        function drag(delta) {
            const handle = findChild(note, "noteResizeHandle")
            verify(handle)
            mousePress(handle, 150, 4)
            // Map from a stable parent so moving the bottom edge cannot distort deltas.
            const point = handle.mapToItem(root, 150, 4)
            mouseMove(root, point.x, point.y + delta, 60)
            mouseRelease(root, point.x, point.y + delta)
        }
        function test_01_dragResizeAndRestore() {
            drag(60)
            compare(prefs.noteHeight, 145)
            compare(note.height, 145)
            drag(-120)
            compare(prefs.noteHeight, 48)
            prefs.noteHeight = 790
            drag(30)
            compare(prefs.noteHeight, 800)
            note.destroy(); wait(30)
            note = factory.createObject(root)
            compare(note.height, 800)
        }
        function test_02_longTextScrollAndExternalNoteEdit() {
            prefs.noteText = "Line\n".repeat(40)
            const editor = findChild(note, "noteEditor")
            compare(editor.text, prefs.noteText)
            verify(editor.height > note.height)
            mouseClick(editor, 10, 10)
            keyClick(Qt.Key_End, Qt.ControlModifier)
            keyClick("X")
            note.flush()
            verify(prefs.noteText.endsWith("X"))
            prefs.noteText = "Loaded from config"
            compare(editor.text, "Loaded from config")
            verify(!note.dirty)
        }
        function test_03_saveDialogAcceptanceExportsPendingInput() {
            const editor = findChild(note, "noteEditor")
            mouseClick(editor, 10, 10)
            for (const ch of "New note") keyClick(ch)
            // Export before the ordinary 400 ms note debounce has completed.
            const destination = api().url
            prefs.noteExportUrl = api().url
            note.chooseSaveFile()
            const dialog = findChild(note, "noteSaveDialog")
            verify(dialog)
            tryCompare(dialog, "visible", true)
            dialog.accept()
            tryVerify(() => !note.exporting && note.exportStatus.startsWith("Saved to"), 5000)
            compare(prefs.noteText, "New note")
            compare(prefs.noteExportUrl, destination)
            compare(api().text, "New note")
        }
        function test_04_cancelAndSaveErrorRetainText() {
            prefs.noteText = "Keep this note"
            const previous = api().text
            prefs.noteExportUrl = api().url
            note.chooseSaveFile()
            const dialog = findChild(note, "noteSaveDialog")
            tryCompare(dialog, "visible", true)
            dialog.reject()
            compare(note.exporting, false)
            compare(api().text, previous)
            note.exportNote("https://example.com/note.txt")
            tryCompare(note, "exportFailed", true, 3000)
            compare(prefs.noteText, "Keep this note")
            compare(prefs.noteExportUrl, api().url)
        }
    }
}

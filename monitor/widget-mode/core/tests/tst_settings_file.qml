import QtQuick
import QtTest
import "../plasmoid/contents/ui"

Item {
    id: root
    width: 200; height: 100
    property var preferences: null
    property var sync: null
    Component { id: synchronizer; SettingsFile { endpoint: "http://127.0.0.1:17342/config" } }
    TestCase {
        name: "SettingsFile"
        when: windowShown
        function api(path, payload) {
            let done = false, status = 0, result = null
            const xhr = new XMLHttpRequest()
            xhr.onreadystatechange = () => {
                if (xhr.readyState === XMLHttpRequest.DONE) {
                    status = xhr.status
                    try { result = JSON.parse(xhr.responseText) }
                    catch (e) { result = {error: "Fixture returned no JSON"} }
                    done = true
                }
            }
            xhr.open(payload === undefined ? "GET" : "POST", "http://127.0.0.1:17342" + path)
            xhr.setRequestHeader("X-Monitor-Client", "plasma-widget")
            xhr.send(payload === undefined ? null : JSON.stringify(payload))
            tryVerify(() => done, 3000)
            compare(status, 200)
            return result
        }
        function init() {
            api("/test/edit", {raw: null})
            const defaults = api("/config").settings
            let source = "import QtQuick; QtObject {"
            for (const key of Object.keys(defaults)) source += "property var " + key + ": " + JSON.stringify(defaults[key]) + ";"
            preferences = Qt.createQmlObject(source + "}", root)
        }
        function cleanup() {
            if (sync) { sync.destroy(); sync = null }
            wait(300)
            if (preferences) { preferences.destroy(); preferences = null }
        }
        function attach(enabled) {
            sync = synchronizer.createObject(root, {preferences: preferences, active: enabled === undefined ? true : enabled})
            verify(sync)
        }
        function saved() {
            tryVerify(() => sync.ready && sync.revision.length > 0 && Object.keys(sync.pending).length === 0 && sync.request === null, 5000)
        }
        function test_01_closeReopenAndConfigureSave() {
            preferences.columns = 1
            preferences.cpuFlowColor = "#aabbcc"
            preferences.noteText = "Saved note"
            preferences.countdownSeconds = 1775
            preferences.noteHeight = 146
            attach()
            saved()
            compare(api("/config").settings.noteText, "Saved note")
            preferences.columns = 3
            tryVerify(() => sync.remote.columns === 3, 3000)
            saved()
            sync.destroy(); sync = null
            wait(300)
            preferences.columns = 2
            preferences.cpuFlowColor = ""
            preferences.noteText = ""
            preferences.countdownSeconds = 300
            preferences.noteHeight = 85
            attach()
            saved()
            compare(preferences.columns, 3)
            compare(preferences.cpuFlowColor, "#aabbcc")
            compare(preferences.noteText, "Saved note")
            compare(preferences.countdownSeconds, 1775)
            compare(preferences.noteHeight, 146)
        }
        function test_02_manualEditAndInvalidDraftProtection() {
            attach(); saved()
            api("/test/edit", {raw: JSON.stringify({version: 1, settings: {columns: 1, pingFlowColor: "#123456"}})})
            tryCompare(preferences, "columns", 1, 3000)
            compare(preferences.pingFlowColor, "#123456")
            api("/test/edit", {raw: "{"})
            preferences.columns = 2
            tryVerify(() => sync.error.length > 0, 3000)
            compare(api("/test/raw").raw, "{")
            compare(preferences.columns, 2)
            api("/test/edit", {raw: JSON.stringify({version: 1, settings: {columns: 3, pingFlowColor: "#abcdef"}})})
            tryCompare(preferences, "columns", 3, 5000)
            compare(preferences.pingFlowColor, "#abcdef")
        }
        function test_03_fileDeletionRecreatesCurrentSettings() {
            preferences.noteText = "Keep after file deletion"
            attach(); saved()
            api("/test/edit", {raw: null})
            sync.reload()
            tryCompare(sync, "revision", "", 2000)
            saved()
            compare(preferences.noteText, "Keep after file deletion")
            compare(api("/config").settings.noteText, "Keep after file deletion")
        }
        function test_04_namedProfilesKeepSplitWidgetsIndependent() {
            preferences.noteText = "Default note"
            attach(); saved()
            sync.profile = "media"
            tryCompare(sync, "connectedProfile", "media", 2000)
            saved()
            preferences.enabledModules = "media"
            preferences.noteText = ""
            tryVerify(() => sync.remote.enabledModules === "media", 3000)
            saved()
            compare(api("/config?profile=media").settings.enabledModules, "media")
            compare(api("/config").settings.noteText, "Default note")
            sync.profile = "default"
            tryCompare(sync, "connectedProfile", "default", 2000)
            saved()
            compare(preferences.noteText, "Default note")
            verify(preferences.enabledModules.includes("cpu"))
        }
        function test_05_conflictMergeAndSameKeyFilePriority() {
            attach(false)
            const state = api("/config")
            sync.accept(Object.assign({}, state, {configured: true}), null, false)
            preferences.cpuFlowColor = "#aabbcc"
            sync.collect()
            const next = Object.assign({}, state, {configured: true, revision: "new", settings: Object.assign({}, state.settings, {columns: 3})})
            sync.accept(next, null, true)
            compare(preferences.columns, 3)
            compare(preferences.cpuFlowColor, "#aabbcc")
            compare(sync.pending.cpuFlowColor, "#aabbcc")
            next.settings = Object.assign({}, next.settings, {cpuFlowColor: "#123456"})
            sync.accept(next, null, true)
            compare(preferences.cpuFlowColor, "#123456")
            verify(sync.pending.cpuFlowColor === undefined)
        }
    }
}

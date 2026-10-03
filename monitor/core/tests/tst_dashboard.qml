import QtQuick
import QtQuick.Window
import QtTest
import "../plasmoid/contents/ui"
import "../plasmoid/contents/ui/LayoutTools.js" as LayoutTools
Item {
    width: 640
    height: 730
    QtObject {
        id: prefs
        property string moduleOrder: "cpu,ram,ping,gpu,media,note"
        property string enabledModules: "cpu,ram,ping,gpu,media,note"
        property int columns: 2
        property string targetsText: ""
        property string noteText: ""
        property bool darkInk: false
        property string textColorHex: ""
        property string borderColorHex: "#aabbcc"
        property string backgroundColorHex: "#1b1b1b"
        property int borderWidth: 0
        property int backgroundOpacity: 0
    }
    Dashboard { id: board; width: 580; height: 680; preferences: prefs }
    ConnectivityCard { id: settingsCard; x: 1000; width: 180; status: ({can_open: true, connected: true, enabled: true}) }
    SignalSpy { id: settingsSpy; target: settingsCard; signalName: "openRequested" }
    TestCase {
        name: "Dashboard"
        when: windowShown
        function initTestCase() { board.Window.window.color = "transparent" }
        function init() {
            prefs.moduleOrder = "cpu,ram,ping,gpu,media,note"
            prefs.enabledModules = prefs.moduleOrder
            prefs.targetsText = ""
            prefs.columns = 2
            board.width = 580
            board.height = 680
            prefs.textColorHex = ""
            prefs.backgroundOpacity = 0
            prefs.borderWidth = 0
        }
        function test_01_liveBridge() {
            tryCompare(board, "connected", true, 10000)
            verify(board.snapshot.cpu.cores > 0)
            verify(board.snapshot.ram.total > 0)
            verify(board.snapshot.cpu.percent >= 0 && board.snapshot.cpu.percent <= 100)
        }
        function test_02_targets() {
            compare(board.targets.length, 0)
            prefs.targetsText = "Local | http://127.0.0.1/status | ◇\nrouter.local\n\n"
            compare(board.targets.length, 2)
            compare(board.targets[0].label, "Local")
            compare(board.targets[0].icon, "◇")
            compare(board.targets[0].url, "http://127.0.0.1/status")
        }
        function toggleModule(key) { prefs.enabledModules = LayoutTools.toggle(prefs.enabledModules, key) }
        function test_03_displayOnly() {
            verify(findChild(board, "customizeButton") === null)
            verify(findChild(board, "drag_cpu") === null)
            verify(findChild(board, "targetEditor") === null)
            prefs.moduleOrder = "note,ram,cpu"
            compare(board.activeModules[0], "note")
            prefs.enabledModules = "note"
            compare(board.activeModules.length, 1)
        }
        function test_04_narrow() {
            board.width = 300
            compare(board.columnCount, 1)
            prefs.columns = 3
            board.width = 580
            compare(board.columnCount, 3)
        }
        function test_05_notePersistence() {
            wait(100)
            let editor = findChild(board, "noteEditor")
            verify(editor !== null)
            mouseClick(editor, 10, 10)
            for (const ch of "A note stays on the desktop.") keyClick(ch)
            tryCompare(prefs, "noteText", "A note stays on the desktop.", 1500)
            toggleModule("note")
            wait(100)
            toggleModule("note")
            wait(100)
            editor = findChild(board, "noteEditor")
            compare(editor.text, prefs.noteText)
        }
        function test_06_hexSurface() {
            prefs.textColorHex = "#aabbcc"
            prefs.borderColorHex = "#334455"
            prefs.backgroundColorHex = "#102030"
            prefs.borderWidth = 2
            prefs.backgroundOpacity = 60
            compare(board.ink, "#aabbcc")
            compare(board.borderColor, "#334455")
            compare(board.backgroundColor, "#102030")
            const surface = findChild(board, "dashboardSurface")
            verify(surface !== null)
            fuzzyCompare(surface.color.a, 0.6, 0.01)
            compare(surface.border.width, 2)
            compare(board.surfaceInset, 12)
            prefs.textColorHex = "not a color"
            compare(board.ink, "#f5f5f4")
            prefs.backgroundOpacity = 0
            prefs.borderWidth = 0
            compare(surface.color.a, 0)
            compare(board.surfaceInset, 0)
        }
        function test_07_realMediaControl() {
            prefs.enabledModules = "media"
            tryVerify(() => board.snapshot.media.players.some(p => p.service === "org.mpris.MediaPlayer2.MonitorTest"), 7000)
            wait(100)
            const card = findChild(board, "mediaCard")
            verify(card !== null)
            card.selectedService = "org.mpris.MediaPlayer2.MonitorTest"
            compare(card.player.service, "org.mpris.MediaPlayer2.MonitorTest")
            const button = findChild(board, "mediaToggle")
            verify(button && button.enabled)
            mouseClick(button)
            tryVerify(() => board.snapshot.media.players.find(p => p.service === "org.mpris.MediaPlayer2.MonitorTest").status === "Paused", 7000)
            mouseClick(button)
            tryVerify(() => board.snapshot.media.players.find(p => p.service === "org.mpris.MediaPlayer2.MonitorTest").status === "Playing", 7000)
        }
        function test_075_usageModules() {
            toggleModule("codex")
            toggleModule("claude")
            toggleModule("resets")
            compare(board.activeModules.slice(-3).join(","), "codex,claude,resets")
            prefs.moduleOrder = LayoutTools.move(prefs.moduleOrder, "claude", -1)
            compare(board.activeModules.slice(-3).join(","), "claude,codex,resets")
            wait(100)
            const card = findChild(board, "usage_codex")
            verify(card !== null)
            compare(card.remaining({remaining_percent: 72, expired: false, stale: false, resets_at: Date.now()/1000 + 1000}), "72% left")
            compare(card.remaining({remaining_percent: 100, expired: true}), "Awaiting refresh")
            compare(card.remaining({remaining_percent: 70, stale: true}), "Stale")
        }
        function test_076_usagePreview() {
            board.width = 360
            board.height = 460
            prefs.enabledModules = "codex,claude,resets"
            wait(300)
            let saved = false
            verify(board.grabToImage(result => {
                verify(result.saveToFile("../docs/preview-usage.png"))
                saved = true
            }))
            tryVerify(() => saved, 3000)
        }
        function test_077_nativeSettingsSignals() {
            for (const kind of ["proton", "wifi", "bluetooth"]) {
                settingsCard.kind = kind
                settingsSpy.clear()
                const button = findChild(settingsCard, "settings_" + kind)
                verify(button && button.enabled)
                button.clicked()
                compare(settingsSpy.count, 1)
                compare(settingsSpy.signalArguments[0][0], kind)
                settingsCard.opening = true
                compare(button.enabled, false)
                settingsCard.opening = false
            }
            settingsCard.stale = true
            compare(settingsCard.stateText, "Waiting for status")
            settingsCard.stale = false
        }
        function test_078_connectivityPreview() {
            board.width = 360
            board.height = 330
            prefs.enabledModules = "proton,wifi,bluetooth"
            tryVerify(() => board.snapshot.connectivity && board.snapshot.connectivity.checked_at, 10000)
            wait(300)
            let saved = false
            verify(board.grabToImage(result => {
                verify(result.saveToFile("../docs/preview-connectivity.png"))
                saved = true
            }))
            tryVerify(() => saved, 3000)
        }
        function test_08_previewAndTransparency() {
            board.width = 360
            board.height = 480
            prefs.noteText = "Make space for what matters.\nOne thought at a time."
            // Remount to read the externally changed test preference.
            toggleModule("note"); wait(20); toggleModule("note")
            prefs.targetsText = "Local | 127.0.0.1 | network-wireless"
            board.poll()
            tryVerify(() => board.snapshot.pings.length === 1 && board.snapshot.pings[0].ms !== null, 10000)
            wait(4200)
            let saved = false
            verify(board.grabToImage(result => {
                verify(result.saveToFile("../docs/preview-transparent.png"))
                saved = true
            }))
            tryVerify(() => saved, 3000)
        }
        function test_09_coloredPreview() {
            board.width = 360
            board.height = 480
            prefs.backgroundColorHex = "#102030"
            prefs.backgroundOpacity = 100
            prefs.borderWidth = 1
            prefs.borderColorHex = "#aabbcc"
            prefs.textColorHex = "#aabbcc"
            wait(200)
            let saved = false
            verify(board.grabToImage(result => { verify(result.saveToFile("../docs/preview-colored.png")); saved = true }))
            tryVerify(() => saved, 3000)
        }
    }
}

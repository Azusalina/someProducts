import QtQuick
import QtQuick.Window
import QtTest
import "../plasmoid/contents/ui"
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
            board.customizing = false
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
        function test_03_recompose() {
            board.moveModule("ram", -1)
            compare(board.activeModules[0], "ram")
            board.dropModule("note", "ram")
            compare(board.activeModules[0], "note")
            board.toggleModule("cpu")
            verify(!board.activeModules.includes("cpu"))
            board.toggleModule("cpu")
            verify(board.activeModules.includes("cpu"))
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
            board.toggleModule("note")
            wait(100)
            board.toggleModule("note")
            wait(100)
            editor = findChild(board, "noteEditor")
            compare(editor.text, prefs.noteText)
        }
        function test_06_dragReorder() {
            board.customizing = true
            wait(100)
            const handle = findChild(board, "drag_cpu")
            const target = findChild(board, "tile_ram")
            verify(handle && target)
            const point = handle.mapFromItem(target, target.width / 2, 60)
            mousePress(handle, 8, 10)
            mouseMove(handle, 25, 12, 100)
            mouseMove(handle, point.x, point.y, 150)
            mouseRelease(handle, point.x, point.y)
            tryCompare(prefs, "moduleOrder", "ram,cpu,ping,gpu,media,note,codex,claude,resets,proton,wifi,bluetooth", 1500)
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
            board.toggleModule("codex")
            board.toggleModule("claude")
            board.toggleModule("resets")
            compare(board.activeModules.slice(-3).join(","), "codex,claude,resets")
            board.moveModule("claude", -1)
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
            board.toggleModule("note"); wait(20); board.toggleModule("note")
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
            mouseClick(findChild(board, "customizeButton"))
            compare(board.customizing, true)
            wait(100)
            saved = false
            verify(board.grabToImage(result => {
                verify(result.saveToFile("../docs/preview-customize.png"))
                saved = true
            }))
            tryVerify(() => saved, 3000)
        }
    }
}

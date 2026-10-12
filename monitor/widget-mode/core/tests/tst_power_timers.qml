import QtQuick
import QtQuick.Window
import QtQuick.Controls
import QtTest
import "../plasmoid/contents/ui"
import "../plasmoid/contents/ui/config"
Item {
    id: root
    width: 300; height: 410
    property bool widgetActivated: false
    Keys.onPressed: event => {
        if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter) { root.widgetActivated = true; event.accepted = true }
    }
    QtObject {
        id: prefs
        property string moduleOrder: "battery,timers"
        property string enabledModules: "battery,timers"
        property int columns: 2
        property string targetsText: ""
        property string noteText: ""
        property bool darkInk: false
        property string textColorHex: ""
        property string backgroundColorHex: "#1b1b1b"
        property string borderColorHex: "#aabbcc"
        property int backgroundOpacity: 0
        property int borderWidth: 0
        property int countdownSeconds: 2
        property int stopwatchSeconds: 5
        property string countdownColor: "#ffaa66"
        property string stopwatchColor: "#66ddaa"
        property string countdownStyle: "ring"
        property string stopwatchStyle: "digital"
    }
    Dashboard { id: board; width: 280; height: 400; preferences: prefs }
    Rectangle { anchors.fill: parent; color: "#eff0f1"; visible: config.visible }
    ConfigTimers { id: config; visible: false; width: 280; height: 400 }
    TextArea { id: otherInput; x: 1000; width: 100; height: 40 }
    TestCase {
        name: "PowerTimers"
        when: windowShown
        function initTestCase() {
            root.Window.window.color = "transparent"
            tryCompare(board, "connected", true, 10000)
            tryVerify(() => !!findChild(board, "timersCard") && findChild(board, "timersCard").owner.session.length > 0, 5000)
        }
        function test_01_batteryAndKeepAwake() {
            const card = findChild(board, "batteryCard")
            tryVerify(() => (card.status.profiles || []).length > 0, 7000)
            verify(card.status.battery.percent >= 0)
            const profile = card.status.profile
            verify(["power-saver", "balanced", "performance"].includes(profile))
            const current = findChild(card, "power_" + profile)
            verify(current.outlined)
            // Reapply the current mode, preserving the user's chosen profile.
            mouseClick(current)
            tryCompare(card.owner, "busy", false, 5000)
            compare(card.owner.error, "")
            compare(card.status.profile, profile)
            const button = findChild(card, "keepAwakeButton")
            mouseClick(button)
            tryCompare(card.owner, "awake", true, 10000)
            verify(button.text.endsWith("On"))
            mouseClick(button)
            tryCompare(card.owner, "awake", false, 5000)
            compare(card.owner.error, "")
        }
        function test_02_timerButtonsAndReorder() {
            const card = findChild(board, "timersCard")
            const owner = card.owner
            tryCompare(owner, "busy", false, 2000)
            mouseClick(findChild(card, "countdownToggle"))
            tryVerify(() => owner.readings.countdown.running, 1500)
            tryCompare(owner, "busy", false, 2000)
            mouseClick(findChild(card, "stopwatchToggle"))
            tryVerify(() => owner.readings.stopwatch.running, 1500)
            const token = owner.session
            prefs.moduleOrder = "timers,battery"
            tryVerify(() => owner.readings.countdown.finished, 4000)
            compare(owner.session, token)
            verify(owner.readings.stopwatch.running)
            tryVerify(() => owner.readings.stopwatch.seconds >= 7, 1500)
            tryCompare(owner, "busy", false, 2000)
            mouseClick(findChild(board, "stopwatchToggle"))
            tryVerify(() => !owner.readings.stopwatch.running, 1500)
            const elapsed = owner.readings.stopwatch.seconds
            wait(650)
            compare(owner.readings.stopwatch.seconds, elapsed)
            tryCompare(owner, "busy", false, 2000)
            mouseClick(findChild(board, "countdownReset"))
            tryVerify(() => owner.readings.countdown.seconds === 2, 1500)
            verify(!owner.readings.countdown.running)
        }
        function test_03_styleColorAndNarrowLayout() {
            let left = findChild(board, "countdownFace"), right = findChild(board, "stopwatchFace")
            compare(left.ink, "#ffaa66"); compare(right.ink, "#66ddaa")
            compare(left.style, "ring"); compare(right.style, "digital")
            board.width = 200
            wait(100)
            verify(left.width >= 70 && right.width >= 70)
            const batteryColumn = findChild(board, "batteryColumn")
            const leftPoint = left.mapToItem(board, 0, 0), rightPoint = right.mapToItem(board, 0, 0)
            verify(leftPoint.x > batteryColumn.x + batteryColumn.width)
            fuzzyCompare(leftPoint.x, rightPoint.x, 1)
            verify(rightPoint.y < leftPoint.y)
            const token = left.owner.session
            prefs.enabledModules = "timers"
            compare(board.pairedPowerTimers, false)
            compare(findChild(board, "powerTimersCard"), null)
            compare(findChild(board, "timersCard").owner.session, token)
            prefs.enabledModules = "battery,timers"
            tryVerify(() => findChild(board, "powerTimersCard") !== null, 1500)
            left = findChild(board, "countdownFace"); right = findChild(board, "stopwatchFace")
            const card = findChild(board, "batteryCard")
            verify(findChild(card, "power_performance").width >= 50)
            prefs.countdownStyle = "digital"; prefs.stopwatchStyle = "ring"
            compare(left.style, "digital"); compare(right.style, "ring")
            prefs.countdownColor = "#88aaff"; compare(left.ink, "#88aaff")
            board.width = 280
            let saved = false
            verify(root.grabToImage(result => { verify(result.saveToFile("../docs/preview-power-timers.png")); saved = true }))
            tryVerify(() => saved, 3000)
        }
        function enterTime(kind, text) {
            const face = findChild(board, kind + "Face")
            mouseClick(findChild(board, kind + "Time"))
            compare(face.editing, true)
            const field = findChild(board, kind + "TimeInput")
            keyClick(Qt.Key_A, Qt.ControlModifier)
            for (const c of text) keyClick(c)
            return field
        }
        function test_035_inlineTimeEditing() {
            const owner = findChild(board, "timersCard").owner
            const face = findChild(board, "countdownFace")
            enterTime("countdown", "00:00:30")
            keyClick(Qt.Key_Return)
            compare(prefs.countdownSeconds, 30)
            tryVerify(() => owner.readings.countdown.seconds === 30 && !owner.readings.countdown.running, 3000)
            compare(findChild(board, "countdownTime").text, "00:00:30")
            for (const sample of [{input: "23000", seconds: 9000, display: "02:30:00"},
                                  {input: "2935", seconds: 1775, display: "00:29:35"},
                                  {input: "5", seconds: 5, display: "00:00:05"},
                                  {input: "240000", seconds: 86400, display: "24:00:00"},
                                  {input: "30", seconds: 30, display: "00:00:30"}]) {
                enterTime("countdown", sample.input)
                keyClick(Qt.Key_Return)
                compare(prefs.countdownSeconds, sample.seconds)
                tryVerify(() => owner.readings.countdown.seconds === sample.seconds && !owner.readings.countdown.running, 3000)
                compare(findChild(board, "countdownTime").text, sample.display)
            }
            for (const invalid of ["0", "2960", "6000", "240001", "1234567"]) {
                enterTime("countdown", invalid)
                keyClick(Qt.Key_Return)
                verify(face.editError.length > 0)
                compare(prefs.countdownSeconds, 30)
                keyClick(Qt.Key_Escape)
            }
            enterTime("countdown", "00:60:00")
            keyClick(Qt.Key_Return)
            verify(face.editError.length > 0)
            compare(prefs.countdownSeconds, 30)
            keyClick(Qt.Key_Escape)
            compare(face.editing, false)
            enterTime("countdown", "00:01:00")
            keyClick(Qt.Key_Escape)
            compare(prefs.countdownSeconds, 30)
            tryCompare(owner, "busy", false, 2000)
            mouseClick(findChild(board, "countdownToggle"))
            tryVerify(() => owner.readings.countdown.running, 1500)
            enterTime("countdown", "00:00:30")
            keyClick(Qt.Key_Return)
            // Enter resets even when the saved duration is already the same.
            tryVerify(() => !owner.readings.countdown.running && owner.readings.countdown.seconds === 30, 3000)
            enterTime("stopwatch", "00:01:00")
            keyClick(Qt.Key_Return)
            compare(prefs.stopwatchSeconds, 60)
            tryVerify(() => owner.readings.stopwatch.seconds === 60 && !owner.readings.stopwatch.running, 3000)
            prefs.countdownSeconds = 2; prefs.stopwatchSeconds = 5
            tryVerify(() => owner.readings.countdown.seconds === 2 && owner.readings.stopwatch.seconds === 5, 3000)
        }
        function test_036_completionBlinkAndEnterReset() {
            const owner = findChild(board, "timersCard").owner
            const face = findChild(board, "countdownFace")
            const stopwatch = findChild(board, "stopwatchFace")
            const battery = findChild(board, "batteryCard")
            root.widgetActivated = false
            owner.setTime("countdown", 1)
            tryVerify(() => owner.readings.countdown.seconds === 1 && !owner.readings.countdown.running, 3000)
            tryCompare(owner, "busy", false, 2000)
            mouseClick(findChild(board, "countdownToggle"))
            verify(face.activeFocus)
            tryVerify(() => owner.countdownFinished, 3000)
            verify(face.blinking)
            tryVerify(() => face.opacity < 0.5, 1200)
            compare(stopwatch.opacity, 1); compare(battery.opacity, 1); compare(board.opacity, 1)
            keyClick(Qt.Key_Return)
            compare(root.widgetActivated, false)
            verify(!face.blinking)
            tryCompare(face, "opacity", 1, 500)
            tryVerify(() => !owner.countdownFinished && owner.readings.countdown.seconds === 1 && !owner.readings.countdown.running, 3000)
            // Keypad Enter also resets when the dashboard itself has focus.
            tryCompare(owner, "busy", false, 2000)
            mouseClick(findChild(board, "countdownToggle"))
            tryVerify(() => owner.countdownFinished, 3000)
            otherInput.forceActiveFocus()
            otherInput.text = ""
            keyClick(Qt.Key_Return)
            compare(otherInput.text, "\n")
            verify(owner.countdownFinished && face.blinking)
            board.forceActiveFocus()
            keyClick(Qt.Key_Enter)
            compare(root.widgetActivated, false)
            tryVerify(() => !owner.countdownFinished && owner.readings.countdown.seconds === 1, 3000)
            // Enter in a completed countdown's editor confirms a new preset.
            tryCompare(owner, "busy", false, 2000)
            mouseClick(findChild(board, "countdownToggle"))
            tryVerify(() => owner.countdownFinished, 3000)
            enterTime("countdown", "4")
            keyClick(Qt.Key_Return)
            compare(prefs.countdownSeconds, 4)
            compare(root.widgetActivated, false)
            tryVerify(() => owner.readings.countdown.seconds === 4 && !owner.countdownFinished, 3000)
            owner.setTime("countdown", 2); owner.setTime("stopwatch", 5)
            tryVerify(() => owner.readings.countdown.seconds === 2 && owner.readings.stopwatch.seconds === 5, 3000)
        }
        function test_04_moduleHideReleasesOwnedResources() {
            const power = findChild(board, "batteryCard").owner
            const timers = findChild(board, "timersCard").owner
            tryCompare(power, "busy", false, 2000)
            power.toggle()
            tryCompare(power, "awake", true, 10000)
            prefs.enabledModules = ""
            tryCompare(power, "token", "", 2000)
            compare(timers.session, "")
            prefs.enabledModules = "battery,timers"
            tryVerify(() => timers.session.length > 0, 3000)
            compare(timers.readings.countdown.seconds, 2)
            compare(power.awake, false)
        }
        function test_05_configureDraftsAndValidation() {
            board.visible = false; config.visible = true
            config.cfg_countdownSeconds = 30
            config.cfg_stopwatchSeconds = 10
            config.cfg_countdownStyle = "ring"
            wait(150)
            const field = findChild(config, "countdownColorSetting")
            mouseClick(field); keyClick(Qt.Key_A, Qt.ControlModifier)
            for (const c of "#aabbcc") keyClick(c)
            compare(config.cfg_countdownColor, "#aabbcc")
            mouseClick(field); keyClick(Qt.Key_A, Qt.ControlModifier)
            for (const c of "#zzzzzz") keyClick(c)
            compare(config.cfg_countdownColor, "#aabbcc")
            compare(field.valid, false)
            compare(prefs.countdownSeconds, 2)
            mouseClick(field); keyClick(Qt.Key_A, Qt.ControlModifier)
            for (const c of "#aabbcc") keyClick(c)
            config.forceActiveFocus()
            wait(100)
            let saved = false
            verify(root.grabToImage(result => { verify(result.saveToFile("../docs/preview-config-timers.png")); saved = true }))
            tryVerify(() => saved, 3000)
        }
    }
}

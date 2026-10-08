import QtQuick
import QtQuick.Window
import QtTest
import "../plasmoid/contents/ui"
import "../plasmoid/contents/ui/config"
Item {
    id: root
    width: 300; height: 410
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
            compare(button.text, "Keep awake · On")
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
            const left = findChild(board, "countdownFace"), right = findChild(board, "stopwatchFace")
            compare(left.ink, "#ffaa66"); compare(right.ink, "#66ddaa")
            compare(left.style, "ring"); compare(right.style, "digital")
            board.width = 200
            wait(100)
            verify(left.width >= 70 && right.width >= 70)
            verify(right.x > left.x)
            verify(left.width + right.width < board.width)
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

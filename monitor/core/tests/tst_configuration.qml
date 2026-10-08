import QtQuick
import QtTest
import "../plasmoid/contents/ui/config"

Item {
    id: configurationRoot
    width: 600
    height: 720
    Rectangle { anchors.fill: parent; color: "#eff0f1" }
    ConfigModules { id: modules; x: 20; y: 20; width: 560; height: 680 }
    ConfigAppearance { id: appearance; x: 20; y: 20; width: 560; height: 580; visible: false }
    ConfigPing { id: ping; x: 20; y: 20; width: 560; height: 500; visible: false }
    ConfigFlows { id: flows; x: 20; y: 20; width: 560; height: 580; visible: false }
    TestCase {
        name: "Configuration"
        when: windowShown
        function init() {
            modules.visible = true
            appearance.visible = false
            ping.visible = false
            flows.visible = false
            modules.cfg_moduleOrder = "cpu,ram,ping,gpu,media,note"
            modules.cfg_enabledModules = "cpu,ram,ping,gpu,media,note"
            modules.cfg_columns = 2
            appearance.cfg_textColorHex = ""
            appearance.cfg_borderColorHex = "#aabbcc"
            appearance.cfg_backgroundColorHex = "#1b1b1b"
            appearance.cfg_borderWidth = 0
            appearance.cfg_backgroundOpacity = 0
            wait(100)
        }
        function test_01_selectionAndStaging() {
            const saved = modules.cfg_enabledModules
            mouseClick(findChild(modules, "module_terminal"))
            verify(modules.cfg_enabledModules.split(",").includes("terminal"))
            // Page values remain a draft; the host writes them only on Apply.
            verify(!saved.includes("terminal"))
            modules.cfg_enabledModules = saved
            compare(findChild(modules, "module_terminal").checked, false)
            mouseClick(findChild(modules, "up_ram"))
            compare(modules.order[0], "ram")
            compare(modules.order.length, 12)
        }
        function test_02_dragReorder() {
            const handle = findChild(modules, "configDrag_cpu")
            const target = findChild(modules, "configTile_ram")
            verify(handle && target)
            const point = handle.mapFromItem(target, target.width - 15, target.height / 2)
            mousePress(handle, 15, 15)
            mouseMove(handle, 15, 30, 100)
            mouseMove(handle, point.x, point.y, 150)
            mouseRelease(handle, point.x, point.y)
            tryCompare(modules, "cfg_moduleOrder", "ram,cpu,ping,gpu,media,note,proton,wifi,bluetooth,terminal,battery,timers", 1500)
        }
        function enter(field, value) {
            mouseClick(field)
            keyClick(Qt.Key_A, Qt.ControlModifier)
            keyClick(Qt.Key_Backspace)
            for (const character of value) keyClick(character)
        }
        function test_03_hexEditingAndValidation() {
            modules.visible = false
            appearance.visible = true
            wait(100)
            const text = findChild(appearance, "textColorSetting")
            const border = findChild(appearance, "borderColorSetting")
            const background = findChild(appearance, "backgroundColorSetting")
            enter(text, "#aabbcc")
            compare(appearance.cfg_textColorHex, "#aabbcc")
            enter(border, "#123456")
            compare(appearance.cfg_borderColorHex, "#123456")
            enter(background, "#abcdef")
            compare(appearance.cfg_backgroundColorHex, "#abcdef")
            enter(background, "#zzzzzz")
            compare(appearance.cfg_backgroundColorHex, "#abcdef")
            compare(findChild(appearance, "colorValidation").visible, true)
            enter(background, "#102030")
            compare(findChild(appearance, "colorValidation").visible, false)
            enter(text, "")
            compare(appearance.cfg_textColorHex, "")
            const opacity = findChild(appearance, "backgroundOpacitySetting")
            opacity.increase()
            opacity.valueModified()
            compare(appearance.cfg_backgroundOpacity, 5)
        }
        function test_04_pingDraft() {
            modules.visible = false
            ping.visible = true
            ping.cfg_targetsText = ""
            wait(100)
            const field = findChild(ping, "pingTargetsSetting")
            enter(field, "Router | 127.0.0.1 | network-wireless")
            compare(ping.cfg_targetsText, "Router | 127.0.0.1 | network-wireless")
        }
        function test_045_flowColorDrafts() {
            modules.visible = false; flows.visible = true
            wait(100)
            for (const key of ["cpu", "ram", "gpu", "ping", "cava"]) {
                const field = findChild(flows, key + "FlowSetting")
                enter(field, "#aabbcc")
                compare(flows["cfg_" + key + "FlowColor"], "#aabbcc")
                mouseClick(field)
                keyClick(Qt.Key_A, Qt.ControlModifier)
                for (const character of "#zzzzzz") keyClick(character)
                compare(flows["cfg_" + key + "FlowColor"], "#aabbcc")
                compare(field.valid, false)
                enter(field, "")
                compare(flows["cfg_" + key + "FlowColor"], "")
            }
            flows.cfg_cpuFlowColor = "#ff6633"; flows.cfg_ramFlowColor = "#66cc88"; flows.cfg_gpuFlowColor = "#6688ff"
            flows.cfg_pingFlowColor = "#ffcc66"; flows.cfg_cavaFlowColor = "#cc66ff"
            wait(100)
            let saved = false
            verify(configurationRoot.grabToImage(result => { verify(result.saveToFile("../docs/preview-config-flows.png")); saved = true }))
            tryVerify(() => saved, 3000)
        }
        function test_05_configurationPreviews() {
            let saved = false
            verify(configurationRoot.grabToImage(result => { verify(result.saveToFile("../docs/preview-config-modules.png")); saved = true }))
            tryVerify(() => saved, 3000)
            modules.visible = false
            appearance.visible = true
            appearance.cfg_textColorHex = "#aabbcc"
            appearance.cfg_backgroundColorHex = "#102030"
            appearance.cfg_borderColorHex = "#aabbcc"
            appearance.cfg_backgroundOpacity = 75
            appearance.cfg_borderWidth = 1
            wait(100)
            saved = false
            verify(configurationRoot.grabToImage(result => { verify(result.saveToFile("../docs/preview-config-appearance.png")); saved = true }))
            tryVerify(() => saved, 3000)
        }
    }
}

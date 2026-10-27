import QtQuick
import QtTest
import "../plasmoid/contents/native" as Native
TestCase {
    id: testCase
    name: "FilexWidget"
    when: windowShown
    width: 720
    height: 420
    Native.Directory { id: directory; folder: home }
    function test_native_model_loads() {
        verify(directory.folder.length > 0)
        verify(directory.home.length > 0)
    }
    function test_widget_qml_compiles() {
        const component = Qt.createComponent("../plasmoid/contents/ui/main.qml")
        compare(component.status, Component.Ready, component.errorString())
    }
}

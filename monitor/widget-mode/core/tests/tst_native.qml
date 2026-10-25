import QtQuick
import QtTest
import "../plasmoid/contents/native" as Native
Item {
    id: mock
    Native.DesktopBridge { id: bridge }
    TestCase {
        name: "NativePlugin"
        when: windowShown
        function test_01_missingHostIsSafe() {
            compare(bridge.detachedModule, "")
            compare(bridge.detachedModules.length, 0)
            bridge.root = mock
            compare(bridge.error, "Native desktop host unavailable")
            bridge.release("cpu", Qt.point(50,50))
            compare(bridge.detachedModules.length, 0)
        }
    }
}

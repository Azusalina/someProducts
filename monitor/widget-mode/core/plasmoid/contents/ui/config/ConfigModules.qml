pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import "../LayoutTools.js" as LayoutTools

ScrollView {
    id: page
    property string cfg_moduleOrder: LayoutTools.modules.join(",")
    property string cfg_enabledModules: LayoutTools.modules.join(",")
    property int cfg_columns: 2
    readonly property var order: LayoutTools.sequence(cfg_moduleOrder)
    function moveModule(key, offset) { cfg_moduleOrder = LayoutTools.move(cfg_moduleOrder, key, offset) }
    function dropModule(source, target) { cfg_moduleOrder = LayoutTools.drop(cfg_moduleOrder, source, target) }
    function toggleModule(key) { cfg_enabledModules = LayoutTools.toggle(cfg_enabledModules, key) }
    implicitWidth: 480
    implicitHeight: 580
    contentWidth: availableWidth
    ScrollBar.horizontal.policy: ScrollBar.AlwaysOff

    ColumnLayout {
        width: page.availableWidth
        spacing: 8
        RowLayout {
            Label { text: "Columns" }
            SpinBox { objectName: "columnsSetting"; from: 1; to: 3; value: page.cfg_columns; onValueModified: page.cfg_columns = value }
            Item { Layout.fillWidth: true }
        }
        Label { Layout.fillWidth: true; text: "Choose modules. Drag handles or use arrows to reorder."; wrapMode: Text.Wrap }
        Repeater {
            model: page.order
            delegate: Item {
                id: row
                required property string modelData
                required property int index
                objectName: "configTile_" + modelData
                Layout.fillWidth: true
                implicitHeight: 36
                DropArea {
                    anchors.fill: parent
                    keys: ["monitor-config-module"]
                    onDropped: drop => {
                        const source = drop.source.objectName.replace("configDrag_", "")
                        const target = row.modelData
                        drop.acceptProposedAction()
                        Qt.callLater(() => page.dropModule(source, target))
                    }
                    Rectangle { anchors.fill: parent; color: palette.highlight; opacity: parent.containsDrag ? 0.12 : 0 }
                }
                RowLayout {
                    anchors.fill: parent
                    CheckBox {
                        objectName: "module_" + row.modelData
                        Layout.fillWidth: true
                        text: LayoutTools.label(row.modelData)
                        checked: page.cfg_enabledModules.split(",").includes(row.modelData)
                        onClicked: page.toggleModule(row.modelData)
                    }
                    ToolButton { objectName: "up_" + row.modelData; text: "↑"; enabled: row.index > 0; Accessible.name: "Move " + LayoutTools.label(row.modelData) + " up"; onClicked: page.moveModule(row.modelData, -1) }
                    ToolButton { text: "↓"; enabled: row.index < page.order.length - 1; Accessible.name: "Move " + LayoutTools.label(row.modelData) + " down"; onClicked: page.moveModule(row.modelData, 1) }
                    Item {
                        Layout.preferredWidth: 30
                        Layout.preferredHeight: 30
                        Label {
                            id: handle
                            objectName: "configDrag_" + row.modelData
                            property string moduleKey: row.modelData
                            text: "⠿"
                            width: 30; height: 30
                            horizontalAlignment: Text.AlignHCenter
                            verticalAlignment: Text.AlignVCenter
                            font.pixelSize: 22
                            z: 100
                            Drag.active: dragMouse.drag.active
                            Drag.source: handle
                            Drag.keys: ["monitor-config-module"]
                            Drag.hotSpot.x: 15
                            Drag.hotSpot.y: 15
                            MouseArea {
                                id: dragMouse
                                anchors.fill: parent
                                drag.target: handle
                                cursorShape: Qt.OpenHandCursor
                                onReleased: { handle.Drag.drop(); handle.x = 0; handle.y = 0 }
                                onCanceled: { handle.x = 0; handle.y = 0 }
                            }
                        }
                    }
                }
            }
        }
        Label {
            Layout.fillWidth: true
            text: "To split the dashboard, add another someProducts-monitor widget and choose its modules. Each instance keeps its own note and settings."
            wrapMode: Text.Wrap
            opacity: 0.7
        }
    }
}

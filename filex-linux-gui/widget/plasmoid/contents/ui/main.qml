pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import org.kde.plasma.core as PlasmaCore
import org.kde.plasma.plasmoid
import "../native" as Native

PlasmoidItem {
    id: root
    preferredRepresentation: fullRepresentation
    Plasmoid.backgroundHints: PlasmaCore.Types.NoBackground
    readonly property var configuration: Plasmoid.configuration
    property var folders: [(configuration ? configuration.rootPath : "") || bridge.home]
    property string hoveredFolder: ""
    property string information: "Hover a folder · x: terminal · click: navigate"
    function reset(path) {
        root.folders = [path]
        if (root.configuration) root.configuration.rootPath = path
    }
    Native.Directory { id: bridge }
    fullRepresentation: FocusScope {
        id: page
        Layout.minimumWidth: 320
        Layout.minimumHeight: 200
        Layout.preferredWidth: 720
        Layout.preferredHeight: 420
        focus: true
        Keys.onPressed: event => {
            if(event.key === Qt.Key_X && event.modifiers === Qt.NoModifier && !event.isAutoRepeat && root.hoveredFolder) {
                bridge.terminal(root.hoveredFolder)
                event.accepted = true
            }
        }
        ColumnLayout {
            anchors.fill: parent
            spacing: 4
            RowLayout {
                Layout.fillWidth: true
                ToolButton { text: "↑"; ToolTip.text: "Parent folder"; ToolTip.visible: hovered; onClicked: root.reset(bridge.parentFolder(root.folders[0])) }
                ToolButton { text: "~"; ToolTip.text: "Home"; ToolTip.visible: hovered; onClicked: root.reset(bridge.home) }
                Label { text: root.folders[0]; elide: Text.ElideMiddle; Layout.fillWidth: true }
                ToolButton { text: "GUI"; onClicked: bridge.gui(root.hoveredFolder || root.folders[root.folders.length-1]) }
                ToolButton { text: "TUI"; onClicked: bridge.terminal(root.hoveredFolder || root.folders[root.folders.length-1],true) }
            }
            Flickable {
                id: tree
                Layout.fillWidth: true
                Layout.fillHeight: true
                contentWidth: columns.width
                contentHeight: height
                clip: true
                boundsBehavior: Flickable.StopAtBounds
                ScrollBar.horizontal: ScrollBar {}
                Row {
                    id: columns
                    height: tree.height
                    Repeater {
                        model: root.folders
                        delegate: ColumnLayout {
                            id: column
                            required property string modelData
                            required property int index
                            width: 240
                            height: tree.height
                            spacing: 2
                            Native.Directory { id: directory; folder: column.modelData }
                            Label { text: column.modelData.split("/").pop() || "/"; elide: Text.ElideMiddle; Layout.fillWidth: true }
                            ListView {
                                id: list
                                Layout.fillWidth: true
                                Layout.fillHeight: true
                                clip: true
                                model: directory
                                ScrollBar.vertical: ScrollBar {}
                                delegate: ItemDelegate {
                                    id: entry
                                    required property string fileName
                                    required property string filePath
                                    required property bool isDir
                                    required property double fileSize
                                    required property string modified
                                    width: list.width
                                    text: (isDir ? "▸ " : "  ") + fileName
                                    highlighted: root.folders[column.index+1] === filePath
                                    hoverEnabled: true
                                    onHoveredChanged: {
                                        if(hovered) {
                                            page.forceActiveFocus()
                                            root.hoveredFolder = isDir ? filePath : ""
                                            root.information = fileName + " · " + (isDir ? "Folder" : fileSize + " bytes") + " · " + modified
                                        } else if(root.hoveredFolder === filePath) root.hoveredFolder = ""
                                    }
                                    onClicked: {
                                        page.forceActiveFocus()
                                        if(isDir) {
                                            root.folders = root.folders.slice(0,column.index+1).concat([filePath])
                                            Qt.callLater(() => tree.contentX = Math.max(0,columns.width-tree.width))
                                        }
                                        else bridge.open(filePath)
                                    }
                                }
                                Label { anchors.centerIn: parent; visible: list.count === 0; text: directory.error || "Empty folder" }
                            }
                        }
                    }
                }
            }
            Label { Layout.fillWidth: true; text: bridge.error || root.information; elide: Text.ElideMiddle }
        }
    }
}

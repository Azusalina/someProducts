import QtQuick
import QtQml
import org.kde.plasma.private.shell

Item {
    id: check
    property bool found: false
    property bool supported: false
    property string widgetName: ""
    WidgetExplorer { id: explorer }
    Instantiator {
        model: explorer.widgetsModel
        delegate: QtObject {
            required property var model
            Component.onCompleted: {
                if (model.pluginName === "local.monitor.dashboard") {
                    check.found = true
                    check.widgetName = model.name
                    check.supported = model.isSupported
                    console.log(JSON.stringify({plugin: model.pluginName, name: model.name,
                                                supported: model.isSupported,
                                                reason: model.unsupportedMessage || ""}))
                }
            }
        }
    }
    Timer {
        interval: 1500
        running: true
        onTriggered: {
            if (!check.found) console.error("someProducts-monitor is missing from the Plasma widget catalog")
            Qt.exit(check.found && check.supported && check.widgetName === "someProducts-monitor" ? 0 : 1)
        }
    }
}

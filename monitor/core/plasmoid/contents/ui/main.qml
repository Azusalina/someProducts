import QtQuick
import QtQuick.Layouts
import org.kde.plasma.core as PlasmaCore
import org.kde.plasma.plasmoid

PlasmoidItem {
    id: root
    property var dashboardControls: fullRepresentationItem
    Keys.priority: Keys.BeforeItem
    Keys.onPressed: event => {
        if ((event.key === Qt.Key_Return || event.key === Qt.Key_Enter) && root.dashboardControls && root.dashboardControls.acknowledgeCountdown()) event.accepted = true
    }
    SettingsFile { preferences: Plasmoid.configuration; profile: Plasmoid.configuration.settingsProfile }
    Plasmoid.backgroundHints: PlasmaCore.Types.NoBackground
    preferredRepresentation: fullRepresentation
    fullRepresentation: Dashboard {
        preferences: Plasmoid.configuration
        Layout.minimumWidth: 200
        Layout.minimumHeight: 120
        Layout.preferredWidth: 300
        Layout.preferredHeight: 360
    }
}

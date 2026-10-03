import QtQuick
import QtQuick.Layouts
import org.kde.plasma.core as PlasmaCore
import org.kde.plasma.plasmoid

PlasmoidItem {
    id: root
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

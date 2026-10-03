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
        Layout.minimumWidth: 220
        Layout.minimumHeight: 140
        Layout.preferredWidth: 360
        Layout.preferredHeight: 480
    }
}

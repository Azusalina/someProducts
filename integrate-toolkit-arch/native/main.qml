import QtQuick
import org.kde.kwin
import "../code" as Toolkit

SceneEffect {
    visible: false
    property QtObject gesture: Toolkit.Gesture {}
    delegate: Item {}
}

import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import org.kde.kirigami as Kirigami

ColumnLayout {
    id: page
    property string cfg_textColorHex: ""
    property string cfg_borderColorHex: "#aabbcc"
    property string cfg_backgroundColorHex: "#1b1b1b"
    property int cfg_borderWidth: 0
    property int cfg_backgroundOpacity: 0
    property bool cfg_darkInk: false
    readonly property color previewBackground: cfg_backgroundColorHex
    implicitWidth: 480
    spacing: 14

    Kirigami.FormLayout {
        Layout.fillWidth: true
        HexField {
            id: textHex
            objectName: "textColorSetting"
            Kirigami.FormData.label: "Text / dashboard:"
            hexValue: page.cfg_textColorHex
            allowEmpty: true
            placeholderText: page.cfg_darkInk ? "#242424 (default)" : "#f5f5f4 (default)"
            onValidEdited: value => page.cfg_textColorHex = value
        }
        CheckBox { text: "Use dark text when the hex field is empty"; checked: page.cfg_darkInk; onClicked: page.cfg_darkInk = checked }
        HexField {
            id: borderHex
            objectName: "borderColorSetting"
            Kirigami.FormData.label: "Border:"
            hexValue: page.cfg_borderColorHex
            onValidEdited: value => page.cfg_borderColorHex = value
        }
        SpinBox {
            objectName: "borderWidthSetting"
            Kirigami.FormData.label: "Border width (px):"
            from: 0; to: 4; value: page.cfg_borderWidth
            onValueModified: page.cfg_borderWidth = value
        }
        HexField {
            id: backgroundHex
            objectName: "backgroundColorSetting"
            Kirigami.FormData.label: "Background:"
            hexValue: page.cfg_backgroundColorHex
            onValidEdited: value => page.cfg_backgroundColorHex = value
        }
        SpinBox {
            objectName: "backgroundOpacitySetting"
            Kirigami.FormData.label: "Background opacity (%):"
            from: 0; to: 100; stepSize: 5; editable: true; value: page.cfg_backgroundOpacity
            onValueModified: page.cfg_backgroundOpacity = value
        }
    }
    Label {
        Layout.fillWidth: true
        text: "Colors use #rrggbb. An empty text field keeps the default. 0% background opacity is fully transparent; border width 0 hides the border."
        wrapMode: Text.Wrap
        opacity: 0.7
    }
    Label {
        objectName: "colorValidation"
        Layout.fillWidth: true
        visible: !textHex.valid || !borderHex.valid || !backgroundHex.valid
        text: "Enter a complete color such as #aabbcc. Invalid input will not replace the saved color."
        color: Kirigami.Theme.negativeTextColor
        wrapMode: Text.Wrap
    }
    Rectangle {
        objectName: "appearanceSwatch"
        Layout.fillWidth: true
        implicitHeight: 85
        radius: 8
        color: Qt.rgba(0.5, 0.5, 0.5, 0.12)
        Rectangle {
            anchors.fill: parent
            anchors.margins: 8
            radius: 6
            color: Qt.rgba(page.previewBackground.r, page.previewBackground.g, page.previewBackground.b, page.cfg_backgroundOpacity / 100)
            border.width: page.cfg_borderWidth
            border.color: page.cfg_borderColorHex
            Label { anchors.centerIn: parent; text: "someProducts-monitor"; color: page.cfg_textColorHex || (page.cfg_darkInk ? "#242424" : "#f5f5f4") }
        }
    }
    Item { Layout.fillHeight: true }
}

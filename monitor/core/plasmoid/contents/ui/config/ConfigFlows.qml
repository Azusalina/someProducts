import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import org.kde.kirigami as Kirigami

ColumnLayout {
    id: page
    property string cfg_cpuFlowColor: ""
    property string cfg_ramFlowColor: ""
    property string cfg_gpuFlowColor: ""
    property string cfg_pingFlowColor: ""
    property string cfg_cavaFlowColor: ""
    implicitWidth: 480
    spacing: 14
    Label { text: "Flow colors"; font.bold: true }
    Kirigami.FormLayout {
        Layout.fillWidth: true
        HexField { id: cpuHex; objectName: "cpuFlowSetting"; Kirigami.FormData.label: "CPU:"; hexValue: page.cfg_cpuFlowColor; allowEmpty: true; placeholderText: "Default dashboard color"; onValidEdited: value => page.cfg_cpuFlowColor = value }
        HexField { id: ramHex; objectName: "ramFlowSetting"; Kirigami.FormData.label: "RAM:"; hexValue: page.cfg_ramFlowColor; allowEmpty: true; placeholderText: "Default dashboard color"; onValidEdited: value => page.cfg_ramFlowColor = value }
        HexField { id: gpuHex; objectName: "gpuFlowSetting"; Kirigami.FormData.label: "GPU:"; hexValue: page.cfg_gpuFlowColor; allowEmpty: true; placeholderText: "Default dashboard color"; onValidEdited: value => page.cfg_gpuFlowColor = value }
        HexField { id: pingHex; objectName: "pingFlowSetting"; Kirigami.FormData.label: "Ping default:"; hexValue: page.cfg_pingFlowColor; allowEmpty: true; placeholderText: "Default dashboard color"; onValidEdited: value => page.cfg_pingFlowColor = value }
        HexField { id: cavaHex; objectName: "cavaFlowSetting"; Kirigami.FormData.label: "CAVA:"; hexValue: page.cfg_cavaFlowColor; allowEmpty: true; placeholderText: "Default dashboard color"; onValidEdited: value => page.cfg_cavaFlowColor = value }
    }
    Label { Layout.fillWidth: true; text: "Enter #rrggbb, such as #aabbcc. Leave a field empty to follow the dashboard color. These settings color only the curves; labels and numeric values keep their text color."; wrapMode: Text.Wrap; opacity: 0.7 }
    Label { Layout.fillWidth: true; text: "For independent Ping-target colors, add a fourth field on the Ping page: label | URL | icon | #rrggbb. CPU/RAM/GPU/Ping sample about every 0.5 seconds; slow or blocked Ping replies take longer."; wrapMode: Text.Wrap; opacity: 0.7 }
    Label {
        Layout.fillWidth: true
        visible: !cpuHex.valid || !ramHex.valid || !gpuHex.valid || !pingHex.valid || !cavaHex.valid
        text: "Enter a complete color such as #aabbcc, or clear the field to use the default."
        color: Kirigami.Theme.negativeTextColor
        wrapMode: Text.Wrap
    }
    Item { Layout.fillHeight: true }
}

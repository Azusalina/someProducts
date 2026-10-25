import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import org.kde.kirigami as Kirigami

ScrollView {
    id: page
    property int cfg_flowHistorySeconds: 30
    property int cfg_flowRefreshMs: 200
    property int cfg_audioRefreshMs: 100
    property string cfg_cpuFlowColor: ""
    property string cfg_ramFlowColor: ""
    property string cfg_gpuFlowColor: ""
    property string cfg_pingFlowColor: ""
    property string cfg_cavaFlowColor: ""
    implicitWidth: 480
    implicitHeight: 560
    contentWidth: availableWidth
    ScrollBar.horizontal.policy: ScrollBar.AlwaysOff
    ColumnLayout {
    width: page.availableWidth
    spacing: 14
    Label { text: "Flow refresh and colors"; font.bold: true }
    RowLayout {
        Label { text: "CPU / RAM / GPU / Ping (ms)" }
        SpinBox { objectName: "flowRefreshSetting"; from: 100; to: 5000; stepSize: 50; editable: true; value: page.cfg_flowRefreshMs; onValueModified: page.cfg_flowRefreshMs = value }
    }
    RowLayout {
        Label { text: "CAVA (ms)" }
        SpinBox { objectName: "audioRefreshSetting"; from: 50; to: 1000; stepSize: 25; editable: true; value: page.cfg_audioRefreshMs; onValueModified: page.cfg_audioRefreshMs = value }
    }
    RowLayout {
        Label { text: "History window (seconds)" }
        SpinBox { objectName: "flowHistorySetting"; from: 5; to: 120; stepSize: 5; editable: true; value: page.cfg_flowHistorySeconds; onValueModified: page.cfg_flowHistorySeconds = value }
    }
    Label { Layout.fillWidth: true; text: "Smaller intervals update faster. 200ms = 5Hz; 1000ms = 1Hz. A longer history window scrolls more slowly. Scrolling uses sample timestamps, independently of the refresh interval. Multiple widgets share the fastest active hardware sampling rate; each graph updates at its own interval. Slow Ping replies can take longer."; wrapMode: Text.Wrap; opacity: 0.7 }
    Kirigami.FormLayout {
        Layout.fillWidth: true
        HexField { id: cpuHex; objectName: "cpuFlowSetting"; Kirigami.FormData.label: "CPU:"; hexValue: page.cfg_cpuFlowColor; allowEmpty: true; placeholderText: "Default dashboard color"; onValidEdited: value => page.cfg_cpuFlowColor = value }
        HexField { id: ramHex; objectName: "ramFlowSetting"; Kirigami.FormData.label: "RAM:"; hexValue: page.cfg_ramFlowColor; allowEmpty: true; placeholderText: "Default dashboard color"; onValidEdited: value => page.cfg_ramFlowColor = value }
        HexField { id: gpuHex; objectName: "gpuFlowSetting"; Kirigami.FormData.label: "GPU:"; hexValue: page.cfg_gpuFlowColor; allowEmpty: true; placeholderText: "Default dashboard color"; onValidEdited: value => page.cfg_gpuFlowColor = value }
        HexField { id: pingHex; objectName: "pingFlowSetting"; Kirigami.FormData.label: "Ping default:"; hexValue: page.cfg_pingFlowColor; allowEmpty: true; placeholderText: "Default dashboard color"; onValidEdited: value => page.cfg_pingFlowColor = value }
        HexField { id: cavaHex; objectName: "cavaFlowSetting"; Kirigami.FormData.label: "CAVA:"; hexValue: page.cfg_cavaFlowColor; allowEmpty: true; placeholderText: "Default dashboard color"; onValidEdited: value => page.cfg_cavaFlowColor = value }
    }
    Label { Layout.fillWidth: true; text: "Enter #rrggbb, such as #aabbcc. Leave a field empty to follow the dashboard color. These settings color only the curves; labels and numeric values keep their text color."; wrapMode: Text.Wrap; opacity: 0.7 }
    Label { Layout.fillWidth: true; text: "For independent Ping-target colors, add a fourth field on the Ping page: label | URL | icon | #rrggbb. Refresh settings also apply to detached panels and fullscreen CAVA backgrounds."; wrapMode: Text.Wrap; opacity: 0.7 }
    Label {
        Layout.fillWidth: true
        visible: !cpuHex.valid || !ramHex.valid || !gpuHex.valid || !pingHex.valid || !cavaHex.valid
        text: "Enter a complete color such as #aabbcc, or clear the field to use the default."
        color: Kirigami.Theme.negativeTextColor
        wrapMode: Text.Wrap
    }
    Item { Layout.fillHeight: true }
    }
}

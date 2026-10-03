import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

ColumnLayout {
    id: page
    property alias cfg_targetsText: targets.text
    implicitWidth: 480
    spacing: 12
    Label { text: "Ping targets"; font.bold: true }
    Label { Layout.fillWidth: true; text: "One target per line: label | URL or hostname | icon. Up to eight targets. Use a symbol or a KDE icon name."; wrapMode: Text.Wrap }
    ScrollView {
        Layout.fillWidth: true
        Layout.fillHeight: true
        Layout.minimumHeight: 180
        TextArea {
            id: targets
            objectName: "pingTargetsSetting"
            placeholderText: "Work | https://example.com | ◇\nHome | 192.168.1.1 | network-wireless"
            wrapMode: TextEdit.Wrap
            textFormat: TextEdit.PlainText
            selectByMouse: true
        }
    }
    Label { Layout.fillWidth: true; text: "Ping measures ICMP latency to the hostname, not HTTP page response time. Targets are checked after you apply the settings."; wrapMode: Text.Wrap; opacity: 0.7 }
}

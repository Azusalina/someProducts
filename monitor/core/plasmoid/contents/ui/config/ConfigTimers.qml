pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import org.kde.kirigami as Kirigami
ScrollView {
    id: page
    property int cfg_countdownSeconds: 300
    property int cfg_stopwatchSeconds: 0
    property string cfg_countdownColor: ""
    property string cfg_stopwatchColor: ""
    property string cfg_countdownStyle: "minimal"
    property string cfg_stopwatchStyle: "minimal"
    implicitWidth: 480; implicitHeight: 520
    contentWidth: availableWidth
    ScrollBar.horizontal.policy: ScrollBar.AlwaysOff
    ColumnLayout {
        width: page.availableWidth
        spacing: 12
        Label { Layout.fillWidth: true; text: "Left: countdown · Right: stopwatch"; wrapMode: Text.Wrap }
        Repeater {
            model: ["countdown", "stopwatch"]
            delegate: ColumnLayout {
                id: section
                required property string modelData
                readonly property string key: "cfg_" + modelData
                Layout.fillWidth: true
                Label { text: section.modelData === "countdown" ? "Countdown duration" : "Stopwatch starting time"; font.bold: true }
                RowLayout {
                    Label { text: "Seconds" }
                    SpinBox { objectName: section.modelData + "SecondsSetting"; from: section.modelData === "countdown" ? 1 : 0; to: 86400; editable: true; value: page[section.key + "Seconds"]; onValueModified: page[section.key + "Seconds"] = value }
                }
                RowLayout {
                    Label { text: "Color" }
                    HexField { id: colorField; objectName: section.modelData + "ColorSetting"; Layout.fillWidth: true; allowEmpty: true; hexValue: page[section.key + "Color"]; placeholderText: "Default text color"; onValidEdited: value => page[section.key + "Color"] = value }
                }
                Label { objectName: section.modelData + "ColorValidation"; Layout.fillWidth: true; visible: !colorField.valid; text: "Enter #rrggbb, or clear the field to use the default."; color: Kirigami.Theme.negativeTextColor; wrapMode: Text.Wrap }
                RowLayout {
                    Label { text: "Style" }
                    ComboBox {
                        objectName: section.modelData + "StyleSetting"
                        model: ["Minimal", "Digital", "Ring"]
                        readonly property var styles: ["minimal", "digital", "ring"]
                        currentIndex: Math.max(0, styles.indexOf(page[section.key + "Style"]))
                        onActivated: page[section.key + "Style"] = styles[currentIndex]
                    }
                }
            }
        }
        Label { Layout.fillWidth: true; text: "Apply a new time to reset and pause that timer. Colors and styles can change while it runs. Reset returns to the configured time. Timers remain independent when modules are reordered; hiding Timers or restarting the bridge resets them."; wrapMode: Text.Wrap; opacity: 0.7 }
    }
}

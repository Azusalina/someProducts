pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Layouts
import org.kde.kirigami as Kirigami
Item {
    id: card
    property color ink: "#f5f5f4"
    property var targets: []
    property var readings: []
    implicitHeight: Math.max(70, targets.length * 32 + 18)
    Text {
        visible: card.targets.length === 0
        text: "Add a target in Customize\nURL or hostname · ICMP latency"
        lineHeight: 1.6
        color: card.ink
        opacity: 0.5
        font.pixelSize: 12
    }
    Column {
        width: parent.width
        spacing: 10
        Repeater {
            model: card.targets
            delegate: RowLayout {
                id: row
                required property var modelData
                required property int index
                width: card.width
                property var reading: card.readings[index] || {}
                Kirigami.Icon {
                    Layout.preferredWidth: 13
                    Layout.preferredHeight: 13
                    visible: /^[a-z][a-z0-9-]{2,}$/.test(row.modelData.icon)
                    source: visible ? row.modelData.icon : ""
                    color: card.ink
                    isMask: true
                }
                Text {
                    Layout.preferredWidth: 65
                    text: (/^[a-z][a-z0-9-]{2,}$/.test(row.modelData.icon) ? "" : (row.modelData.icon || "↗") + "  ") + row.modelData.label
                    color: card.ink
                    opacity: 0.65
                    font.pixelSize: 11
                    elide: Text.ElideRight
                    textFormat: Text.PlainText
                }
                Text {
                    Layout.fillWidth: true
                    text: row.reading.ms === null || row.reading.ms === undefined ? "—" : (row.reading.less_than ? "<" : "") + row.reading.ms.toFixed(1)
                    color: card.ink
                    font.pixelSize: 19
                    font.weight: Font.Light
                    horizontalAlignment: Text.AlignRight
                }
                Text { text: "ms"; color: card.ink; opacity: 0.5; font.pixelSize: 11 }
            }
        }
        Text {
            text: card.readings.some(p => p.ms === null) ? card.readings.filter(p => p.ms === null).map(p => p.status).join(" · ") : "ICMP · host latency"
            visible: card.targets.length > 0
            width: card.width
            color: card.ink
            opacity: 0.45
            font.pixelSize: 10
            elide: Text.ElideRight
            textFormat: Text.PlainText
        }
    }
}

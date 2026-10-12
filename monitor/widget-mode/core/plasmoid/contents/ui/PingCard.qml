pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls
import org.kde.kirigami as Kirigami
Item {
    id: card
    property color ink: "#f5f5f4"
    property color flowInk: ink
    property var targets: []
    property var readings: []
    property var histories: ({})
    implicitHeight: Math.max(42, targets.length * 42 + Math.max(0, targets.length - 1) * 2)
    Text {
        visible: card.targets.length === 0
        text: "Configure Ping"
        color: card.ink
        opacity: 0.45
        font.pixelSize: 9
    }
    Column {
        width: parent.width
        spacing: 2
        Repeater {
            model: card.targets
            delegate: Item {
                id: row
                required property var modelData
                required property int index
                width: card.width
                height: 42
                readonly property var reading: card.readings.find(value => value.target === modelData.url) || {}
                readonly property var samples: card.histories[modelData.url] || []
                readonly property real historyMaximum: Math.max(10, ...samples.filter(v => typeof v === "number" && isFinite(v)))
                Accessible.name: "Ping " + modelData.label
                Accessible.description: number.text + "; " + (reading.status || "Waiting for telemetry")
                Sparkline {
                    objectName: "pingFlow"
                    anchors.fill: parent
                    anchors.topMargin: 12
                    ink: row.modelData.color || card.flowInk
                    values: row.samples
                    sampleCount: Math.max(2, Math.min(40, row.samples.length))
                    maximum: row.historyMaximum
                }
                Row {
                    spacing: 3
                    Kirigami.Icon {
                        width: 10; height: 10
                        visible: /^[a-z][a-z0-9-]{2,}$/.test(row.modelData.icon)
                        source: visible ? row.modelData.icon : ""
                        color: card.ink
                        isMask: true
                    }
                    Text {
                        width: Math.max(12, row.width - 68)
                        text: (/^[a-z][a-z0-9-]{2,}$/.test(row.modelData.icon) ? "" : (row.modelData.icon || "↗") + " ") + row.modelData.label
                        color: card.ink
                        opacity: 0.5
                        font.pixelSize: 8
                        elide: Text.ElideRight
                        textFormat: Text.PlainText
                    }
                }
                Text {
                    id: number
                    objectName: "pingValue"
                    anchors.right: parent.right
                    text: row.reading.ms === null || row.reading.ms === undefined ? "—" : (row.reading.less_than ? "<" : "") + row.reading.ms.toFixed(1) + "ms"
                    color: card.ink
                    opacity: 0.75
                    font.pixelSize: 9
                }
                HoverHandler { id: hover }
                ToolTip.visible: hover.hovered
                ToolTip.delay: 600
                ToolTip.text: row.modelData.label + " · " + row.modelData.url + " · " + (row.reading.status || "Waiting for telemetry") + " · ICMP · auto-scaled graph"
            }
        }
    }
}

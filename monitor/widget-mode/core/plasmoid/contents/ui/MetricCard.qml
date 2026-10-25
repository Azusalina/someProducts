import QtQuick
import QtQuick.Controls
Item {
    id: card
    property var timeSamples: null
    property int historySeconds: 30
    property int refreshInterval: 200
    property color ink: "#f5f5f4"
    property color flowInk: ink
    property var value: null
    property string detail: ""
    property var history: []
    implicitHeight: 42
    Accessible.role: Accessible.ProgressBar
    Accessible.name: detail
    Accessible.description: number.text
    Sparkline {
        objectName: "metricFlow"
        anchors.fill: parent
        anchors.topMargin: 12
        ink: card.flowInk
        values: card.history
        timeSamples: card.timeSamples
        historySeconds: card.historySeconds
        sampleCount: 40
        transitionDuration: Math.round(card.refreshInterval * 0.9)
    }
    Text {
        id: number
        objectName: "metricValue"
        anchors.right: parent.right
        anchors.top: parent.top
        text: card.value === null || card.value === undefined ? "—" : Math.round(card.value) + "%"
        color: card.ink
        opacity: 0.75
        font.pixelSize: 9
    }
    HoverHandler { id: hover }
    ToolTip.visible: hover.hovered
    ToolTip.delay: 600
    ToolTip.text: card.detail
}

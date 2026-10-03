import QtQuick
Item {
    id: card
    property color ink: "#f5f5f4"
    property var value: null
    property string detail: ""
    property var history: []
    implicitHeight: Math.max(70, number.height + 2 + detailText.implicitHeight + 20)
    Row {
        id: number
        spacing: 5
        Text {
            text: card.value === null || card.value === undefined ? "—" : Math.round(card.value).toString()
            color: card.ink
            font.pixelSize: 32
            font.weight: Font.Light
        }
        Text {
            text: "%"
            color: card.ink
            opacity: 0.55
            font.pixelSize: 12
            anchors.baseline: parent.children[0].baseline
        }
    }
    Text {
        id: detailText
        anchors.top: number.bottom
        anchors.topMargin: 2
        width: parent.width
        text: card.detail
        color: card.ink
        opacity: 0.6
        font.pixelSize: 10
        wrapMode: Text.Wrap
        maximumLineCount: 2
        elide: Text.ElideRight
        textFormat: Text.PlainText
    }
    Sparkline {
        anchors.bottom: parent.bottom
        width: parent.width
        height: 14
        ink: card.ink
        values: card.history
    }
}

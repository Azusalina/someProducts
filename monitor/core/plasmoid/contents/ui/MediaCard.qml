import QtQuick
import QtQuick.Layouts
Item {
    id: card
    property color ink: "#f5f5f4"
    property var players: []
    property string selectedService: ""
    property var player: players.find(p => p.service === selectedService) || players[0] || null
    signal toggleRequested(string service)
    implicitHeight: 76
    ColumnLayout {
        width: parent.width
        spacing: 5
        Text {
            Layout.fillWidth: true
            text: card.player ? card.player.title : "Nothing playing"
            color: card.ink
            font.pixelSize: 18
            font.weight: Font.Light
            elide: Text.ElideRight
            textFormat: Text.PlainText
        }
        Text {
            Layout.fillWidth: true
            text: card.player ? [card.player.artist, card.player.name, card.player.status].filter(Boolean).join(" · ") : "Browser integration or an MPRIS player"
            color: card.ink
            opacity: 0.55
            font.pixelSize: 11
            elide: Text.ElideRight
            textFormat: Text.PlainText
        }
        RowLayout {
            SmallButton {
                objectName: "mediaToggle"
                text: card.player && card.player.status === "Playing" ? "Ⅱ  Pause" : "▷  Play"
                ink: card.ink
                outlined: true
                enabled: !!card.player && card.player.can_control && (card.player.status === "Playing" ? card.player.can_pause : card.player.can_play)
                onClicked: card.toggleRequested(card.player.service)
            }
            SmallButton {
                visible: card.players.length > 1
                text: "Next player →"
                ink: card.ink
                onClicked: {
                    const current = card.players.findIndex(p => p.service === card.player.service)
                    card.selectedService = card.players[(current + 1) % card.players.length].service
                }
            }
        }
    }
}

pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Layouts
Item {
    id: card
    property color ink: "#f5f5f4"
    property var provider: ({windows: []})
    property real now: Date.now() / 1000
    readonly property var windows: provider.windows || []
    implicitHeight: Math.max(78, rows.implicitHeight)
    Timer { interval: 1000; running: true; repeat: true; onTriggered: card.now = Date.now() / 1000 }
    function dateText(epoch) {
        if (!epoch) return "Reset unknown"
        const date = new Date(epoch * 1000)
        return Qt.formatDateTime(date, "MMM d · HH:mm")
    }
    function remaining(window) {
        if (window.expired || (window.resets_at && window.resets_at <= now)) return "Awaiting refresh"
        if (window.stale) return "Stale"
        if (window.remaining_percent === null || window.remaining_percent === undefined) return "—"
        return Math.round(window.remaining_percent) + "% left"
    }
    function countdown(epoch) {
        if (!epoch || epoch <= now) return ""
        const minutes = Math.ceil((epoch - now) / 60)
        if (minutes >= 1440) return Math.floor(minutes / 1440) + "d " + Math.floor(minutes % 1440 / 60) + "h"
        if (minutes >= 60) return Math.floor(minutes / 60) + "h " + minutes % 60 + "m"
        return minutes + "m"
    }
    ColumnLayout {
        id: rows
        width: card.width
        spacing: 7
        Repeater {
            model: card.windows
            delegate: ColumnLayout {
                id: windowRow
                required property var modelData
                Layout.fillWidth: true
                spacing: 2
                RowLayout {
                    Layout.fillWidth: true
                    Text { text: windowRow.modelData.label; color: card.ink; opacity: 0.6; font.pixelSize: 11 }
                    Item { Layout.fillWidth: true }
                    Text { text: card.remaining(windowRow.modelData); color: card.ink; font.pixelSize: 16; font.weight: Font.Light }
                }
                Text {
                    Layout.fillWidth: true
                    text: card.dateText(windowRow.modelData.resets_at) + (card.countdown(windowRow.modelData.resets_at) ? " · " + card.countdown(windowRow.modelData.resets_at) : "")
                    color: card.ink; opacity: 0.55; font.pixelSize: 10
                    wrapMode: Text.Wrap
                }
            }
        }
        Text {
            Layout.fillWidth: true
            visible: !!card.provider.message
            text: card.provider.message || ""
            color: card.ink; opacity: 0.55; font.pixelSize: 11; wrapMode: Text.Wrap
            textFormat: Text.PlainText
        }
        Text {
            Layout.fillWidth: true
            visible: card.provider.available_resets !== null && card.provider.available_resets !== undefined
            text: card.provider.available_resets + " banked resets" + (card.provider.reset_expirations && card.provider.reset_expirations.length ? " · first expires " + card.dateText(card.provider.reset_expirations[0]) : "")
            color: card.ink; opacity: 0.65; font.pixelSize: 10; wrapMode: Text.Wrap
        }
        Text {
            Layout.fillWidth: true
            text: (card.provider.source || "Waiting for data") + (card.provider.observed_at ? " · " + Qt.formatDateTime(new Date(card.provider.observed_at * 1000), "HH:mm") : "")
            color: card.ink; opacity: 0.4; font.pixelSize: 9; wrapMode: Text.Wrap
        }
    }
}

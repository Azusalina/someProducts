pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Layouts
Item {
    id: card
    property color ink: "#f5f5f4"
    property var news: ({events: []})
    property int selectedIndex: 0
    property real now: Date.now() / 1000
    Timer { interval: 60000; running: true; repeat: true; onTriggered: card.now = Date.now() / 1000 }
    readonly property var events: news.events || []
    readonly property var event: events[selectedIndex % Math.max(1, events.length)] || null
    implicitHeight: rows.implicitHeight
    function reportState() {
        if (!event) return ""
        if (event.expected_at && event.expected_at > now) return "Upcoming report"
        if (event.expected_at || now - event.published_at > 86400) return "Earlier report"
        return "Timing unconfirmed"
    }
    ColumnLayout {
        id: rows
        width: card.width
        spacing: 5
        Text {
            Layout.fillWidth: true
            text: card.event ? card.event.developer + " · " + card.reportState() + " · " + Qt.formatDateTime(new Date(card.event.published_at * 1000), "MMM d, yyyy") : "Watching reset reports"
            color: card.ink; font.pixelSize: 12; wrapMode: Text.Wrap
        }
        Text {
            Layout.fillWidth: true
            text: card.event ? card.event.headline : (card.news.message || "No reset announcement found")
            color: card.ink; opacity: 0.75; font.pixelSize: 12; wrapMode: Text.Wrap
            maximumLineCount: 2; elide: Text.ElideRight; textFormat: Text.PlainText
        }
        Text {
            Layout.fillWidth: true
            text: card.event ? card.event.confidence + "\n" + card.event.timing + (card.event.expected_at ? " · " + Qt.formatDateTime(new Date(card.event.expected_at * 1000), "MMM d · HH:mm") : "") : "Account countdowns come from quota data."
            color: card.ink; opacity: 0.5; font.pixelSize: 10; wrapMode: Text.Wrap
        }
        Text {
            Layout.fillWidth: true
            visible: !!card.news.message && card.events.length > 0
            text: card.news.message || ""; color: card.ink; opacity: 0.5; font.pixelSize: 10; wrapMode: Text.Wrap
        }
        RowLayout {
            SmallButton { text: "Open Tibo ↗"; ink: card.ink; outlined: true; onClicked: Qt.openUrlExternally("https://x.com/thsottiaux") }
            SmallButton { visible: !!card.event; text: "Source ↗"; ink: card.ink; onClicked: Qt.openUrlExternally(card.event.source_url) }
            SmallButton { visible: card.events.length > 1; text: "Next →"; ink: card.ink; onClicked: card.selectedIndex = (card.selectedIndex + 1) % card.events.length }
        }
        Text {
            Layout.fillWidth: true
            text: (card.news.mode || "Public reports") + (card.news.checked_at ? " · checked " + Qt.formatDateTime(new Date(card.news.checked_at * 1000), "HH:mm") : "") + (card.news.stale ? " · stale" : "")
            color: card.ink; opacity: 0.4; font.pixelSize: 9; wrapMode: Text.Wrap
        }
    }
}

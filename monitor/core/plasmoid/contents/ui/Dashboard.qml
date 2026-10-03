import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import "LayoutTools.js" as LayoutTools

Item {
    id: board
    required property var preferences
    readonly property color ink: validHex(preferences.textColorHex) ? preferences.textColorHex : preferences.darkInk ? "#242424" : "#f5f5f4"
    readonly property color backgroundColor: validHex(preferences.backgroundColorHex) ? preferences.backgroundColorHex : "#1b1b1b"
    readonly property color borderColor: validHex(preferences.borderColorHex) ? preferences.borderColorHex : "#aabbcc"
    readonly property int backgroundOpacity: Math.max(0, Math.min(100, preferences.backgroundOpacity || 0))
    readonly property int borderWidth: Math.max(0, Math.min(4, preferences.borderWidth || 0))
    readonly property int surfaceInset: backgroundOpacity > 0 || borderWidth > 0 ? 12 : 0
    function validHex(value) { return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value) }
    property bool connected: false
    property string message: "Connecting…"
    property var snapshot: ({ cpu: {}, ram: {}, gpus: [], pings: [], media: { players: [] } })
    property var histories: ({ cpu: [], ram: [], gpu: [] })
    property var request: null
    property string openingSettings: ""
    property real lastSample: 0
    property int selectedGpu: 0
    onSelectedGpuChanged: histories = Object.assign({}, histories, {gpu: []})
    readonly property var activeModules: LayoutTools.sequence(preferences.moduleOrder).filter(k => preferences.enabledModules.split(",").includes(k))
    readonly property int columnCount: width < 310 ? 1 : Math.max(1, Math.min(3, preferences.columns))
    readonly property var targets: parseTargets(preferences.targetsText)
    implicitWidth: 360
    implicitHeight: 480

    function parseTargets(text) {
        return text.split("\n").map(line => {
            const parts = line.split("|").map(p => p.trim())
            if (!parts[0]) return null
            return {label: parts.length > 1 ? parts[0] : parts[0].replace(/^https?:\/\//, "").split("/")[0],
                    url: parts.length > 1 ? parts[1] : parts[0], icon: parts[2] || "↗"}
        }).filter(t => t && t.url).slice(0, 8)
    }
    function gib(bytes) { return ((bytes || 0) / 1073741824).toFixed(1) }
    function poll() {
        if (request) return
        const xhr = new XMLHttpRequest()
        request = xhr
        requestTimeout.restart()
        xhr.onreadystatechange = function() {
            if (xhr.readyState !== XMLHttpRequest.DONE) return
            requestTimeout.stop()
            request = null
            if (xhr.status !== 200) {
                connected = false
                message = "Bridge offline · run core/scripts/start.sh"
                return
            }
            try {
                const data = JSON.parse(xhr.responseText)
                snapshot = data
                const age = Date.now() / 1000 - (data.sampled_at || 0)
                connected = age < 12
                message = connected ? "" : "Waiting for a fresh sample…"
                if (data.sampled_at && lastSample !== data.sampled_at) {
                    const next = {}
                    for (const key of ["cpu", "ram", "gpu"]) {
                        const value = key === "gpu" ? (data.gpus[selectedGpu % Math.max(1, data.gpus.length)] || {}).percent : (data[key] || {}).percent
                        next[key] = value === null || value === undefined ? [] : (histories[key] || []).concat([value]).slice(-40)
                    }
                    histories = next
                    lastSample = data.sampled_at
                }
            } catch (error) { connected = false; message = "Invalid telemetry response" }
        }
        xhr.open("GET", "http://127.0.0.1:17341/snapshot?targets=" + encodeURIComponent(JSON.stringify(targets.map(t => t.url))))
        xhr.setRequestHeader("X-Monitor-Client", "plasma-widget")
        xhr.send()
    }
    function openSettings(target) {
        if (openingSettings) return
        openingSettings = target
        settingsTimeout.restart()
        const xhr = new XMLHttpRequest()
        xhr.onreadystatechange = function() {
            if (xhr.readyState !== XMLHttpRequest.DONE) return
            openingSettings = ""
            settingsTimeout.stop()
            if (xhr.status !== 200) {
                message = "Could not open native settings"
                feedback.restart()
            }
        }
        xhr.open("POST", "http://127.0.0.1:17341/settings/open")
        xhr.setRequestHeader("X-Monitor-Client", "plasma-widget")
        xhr.setRequestHeader("Content-Type", "application/json")
        xhr.send(JSON.stringify({target: target}))
    }
    Timer { id: settingsTimeout; interval: 6000; onTriggered: board.openingSettings = "" }
    function toggleMedia(service) {
        const xhr = new XMLHttpRequest()
        xhr.onreadystatechange = function() {
            if (xhr.readyState !== XMLHttpRequest.DONE) return
            if (xhr.status !== 200) {
                try { message = JSON.parse(xhr.responseText).error }
                catch (e) { message = "Media control unavailable" }
                feedback.restart()
            } else Qt.callLater(poll)
        }
        xhr.open("POST", "http://127.0.0.1:17341/media/toggle")
        xhr.setRequestHeader("X-Monitor-Client", "plasma-widget")
        xhr.setRequestHeader("Content-Type", "application/json")
        xhr.send(JSON.stringify({service: service}))
    }
    Timer { interval: 2000; running: true; repeat: true; onTriggered: board.poll() }
    Timer {
        id: requestTimeout
        interval: 6000
        onTriggered: {
            if (board.request) { const pending = board.request; board.request = null; pending.abort() }
            board.connected = false
            board.message = "Bridge timed out · retrying…"
        }
    }
    Timer { id: feedback; interval: 6000; onTriggered: board.message = "" }
    Component.onCompleted: poll()
    Component.onDestruction: if (request) request.abort()

    Rectangle {
        objectName: "dashboardSurface"
        anchors.fill: parent
        radius: 8
        color: Qt.rgba(board.backgroundColor.r, board.backgroundColor.g, board.backgroundColor.b, board.backgroundOpacity / 100)
        border.width: board.borderWidth
        border.color: board.borderColor
    }
    ScrollView {
        id: scroll
        anchors.fill: parent
        anchors.margins: board.surfaceInset
        clip: true
        contentWidth: availableWidth
        ScrollBar.horizontal.policy: ScrollBar.AlwaysOff
        ColumnLayout {
            width: scroll.availableWidth
            spacing: 12
            RowLayout {
                Layout.fillWidth: true
                spacing: 10
                Text {
                    text: "someProducts-monitor"
                    Layout.maximumWidth: Math.max(50, board.width - 30)
                    elide: Text.ElideRight
                    color: board.ink
                    font.pixelSize: 11
                    font.letterSpacing: 3
                }
                Rectangle {
                    implicitWidth: 4; implicitHeight: 4; radius: 2
                    color: board.connected ? board.ink : "#c29968"
                    opacity: 0.7
                }
                Item { Layout.fillWidth: true }
            }
            Text {
                Layout.fillWidth: true
                visible: board.message.length > 0
                text: board.message
                color: board.ink
                opacity: 0.6
                font.pixelSize: 11
                wrapMode: Text.Wrap
                textFormat: Text.PlainText
            }
            GridLayout {
                id: grid
                objectName: "moduleGrid"
                Layout.fillWidth: true
                columns: board.columnCount
                columnSpacing: 18
                rowSpacing: 14
                Repeater {
                    model: board.activeModules
                    delegate: Item {
                        id: tile
                        objectName: "tile_" + modelData
                        required property string modelData
                        required property int index
                        readonly property bool wide: modelData === "media" || modelData === "note" || modelData === "resets"
                        Layout.columnSpan: wide ? board.columnCount : 1
                        Layout.fillWidth: true
                        Layout.alignment: Qt.AlignTop
                        Layout.preferredHeight: 24 + (loader.item ? loader.item.implicitHeight : 100)
                        Layout.minimumWidth: 100
                        Rectangle {
                            anchors.top: parent.top
                            width: parent.width; height: 1
                            color: board.ink
                            opacity: 0.18
                        }
                        RowLayout {
                            id: tileHeading
                            width: parent.width
                            height: 24
                            Text { text: tile.modelData === "media" ? "NOW PLAYING" : tile.modelData === "claude" ? "CLAUDE CODE" : tile.modelData === "resets" ? "RESET NEWS" : tile.modelData.toUpperCase(); color: board.ink; opacity: 0.65; font.pixelSize: 10; font.letterSpacing: 1.8 }
                            Item { Layout.fillWidth: true }
                            SmallButton {
                                visible: tile.modelData === "gpu" && board.snapshot.gpus.length > 1
                                text: "Next GPU →"; ink: board.ink
                                onClicked: board.selectedGpu = (board.selectedGpu + 1) % board.snapshot.gpus.length
                            }
                        }
                        Loader {
                            id: loader
                            anchors.top: tileHeading.bottom
                            width: parent.width
                            sourceComponent: ["proton", "wifi", "bluetooth"].includes(tile.modelData) ? connectivityComponent : tile.modelData === "codex" || tile.modelData === "claude" ? usageComponent : tile.modelData === "resets" ? newsComponent : tile.modelData === "media" ? mediaComponent : tile.modelData === "note" ? noteComponent : tile.modelData === "ping" ? pingComponent : metricComponent
                        }
                        Component {
                            id: metricComponent
                            MetricCard {
                                readonly property var gpu: board.snapshot.gpus[board.selectedGpu % Math.max(1, board.snapshot.gpus.length)] || {}
                                readonly property var stats: tile.modelData === "cpu" ? board.snapshot.cpu : tile.modelData === "ram" ? board.snapshot.ram : gpu
                                ink: board.ink
                                value: board.connected ? stats.percent : null
                                history: board.connected ? board.histories[tile.modelData] || [] : []
                                detail: {
                                    if (!board.connected) return "Waiting for telemetry"
                                    if (tile.modelData === "cpu") return (stats.cores || "—") + " logical cores" + (stats.temperature != null ? " · " + Math.round(stats.temperature) + "°C" : "")
                                    if (tile.modelData === "ram") return board.gib(stats.used) + " / " + board.gib(stats.total) + " GiB"
                                    return (gpu.name || "No GPU detected") + (gpu.temperature != null ? " · " + Math.round(gpu.temperature) + "°C" : "") + "\n" + (gpu.scope || "Unavailable") + (gpu.memory_total_mib != null ? " · VRAM " + (gpu.memory_used_mib / 1024).toFixed(1) + " / " + (gpu.memory_total_mib / 1024).toFixed(1) + " GiB" : "")
                                }
                            }
                        }
                        Component { id: pingComponent; PingCard { ink: board.ink; targets: board.targets; readings: board.connected ? board.snapshot.pings : [] } }
                        Component { id: mediaComponent; MediaCard { objectName: "mediaCard"; ink: board.ink; players: board.connected ? board.snapshot.media.players : []; onToggleRequested: service => board.toggleMedia(service) } }
                        Component { id: connectivityComponent; ConnectivityCard { objectName: "connectivity_" + tile.modelData; ink: board.ink; kind: tile.modelData; status: (board.snapshot.connectivity || {})[tile.modelData] || ({}); stale: !board.connected || !!(board.snapshot.connectivity || {}).stale; opening: board.openingSettings === tile.modelData; onOpenRequested: target => board.openSettings(target) } }
                        Component { id: usageComponent; UsageCard { objectName: "usage_" + tile.modelData; ink: board.ink; provider: (board.snapshot.usage || {})[tile.modelData] || ({windows: [], message: "Waiting for usage data"}) } }
                        Component { id: newsComponent; ResetNewsCard { ink: board.ink; news: board.snapshot.reset_news || ({events: [], message: "Waiting for news"}) } }
                        Component { id: noteComponent; NoteCard { ink: board.ink; preferences: board.preferences } }
                    }
                }
            }
            Text {
                visible: board.activeModules.length === 0
                text: "Choose a module in the widget settings."
                color: board.ink; opacity: 0.5; font.pixelSize: 12
            }
            Item { Layout.fillWidth: true; implicitHeight: 6 }
        }
    }
}

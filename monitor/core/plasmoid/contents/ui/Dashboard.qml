import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

Item {
    id: board
    required property var preferences
    property color ink: preferences.darkInk ? "#242424" : "#f5f5f4"
    property bool customizing: false
    property bool connected: false
    property string message: "Connecting…"
    property var snapshot: ({ cpu: {}, ram: {}, gpus: [], pings: [], media: { players: [] } })
    property var histories: ({ cpu: [], ram: [], gpu: [] })
    property var request: null
    property string openingSettings: ""
    property real lastSample: 0
    property int selectedGpu: 0
    onSelectedGpuChanged: histories = Object.assign({}, histories, {gpu: []})
    readonly property var allModules: ["cpu", "ram", "ping", "gpu", "media", "note", "codex", "claude", "resets", "proton", "wifi", "bluetooth"]
    readonly property var activeModules: moduleSequence().filter(k => preferences.enabledModules.split(",").includes(k))
    function moduleSequence() {
        const saved = preferences.moduleOrder.split(",").filter(k => allModules.includes(k))
        return saved.concat(allModules.filter(k => !saved.includes(k)))
    }
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
    function moveModule(key, offset) {
        const order = moduleSequence()
        const at = order.indexOf(key)
        const shown = activeModules.indexOf(key)
        const next = activeModules[shown + offset]
        if (!next) return
        const to = order.indexOf(next)
        order.splice(at, 1)
        order.splice(to, 0, key)
        preferences.moduleOrder = order.join(",")
    }
    function dropModule(source, target) {
        if (source === target) return
        const order = moduleSequence()
        const from = order.indexOf(source)
        const to = order.indexOf(target)
        if (from < 0 || to < 0) return
        order.splice(from, 1)
        order.splice(to, 0, source)
        preferences.moduleOrder = order.join(",")
    }
    function toggleModule(key) {
        const enabled = preferences.enabledModules.split(",").filter(Boolean)
        const at = enabled.indexOf(key)
        if (at >= 0) enabled.splice(at, 1)
        else enabled.push(key)
        preferences.enabledModules = enabled.join(",")
    }
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

    ScrollView {
        id: scroll
        anchors.fill: parent
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
                    text: "MONITOR"
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
                SmallButton {
                    objectName: "customizeButton"
                    text: board.customizing ? "Done" : "Customize"
                    ink: board.ink
                    onClicked: board.customizing = !board.customizing
                }
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
            ColumnLayout {
                Layout.fillWidth: true
                visible: board.customizing
                spacing: 10
                Text {
                    text: "Choose modules · drag handles or use arrows to reorder"
                    color: board.ink
                    opacity: 0.6
                    font.pixelSize: 11
                    wrapMode: Text.Wrap
                    Layout.fillWidth: true
                }
                Flow {
                    Layout.fillWidth: true
                    spacing: 5
                    Repeater {
                        model: board.allModules
                        SmallButton {
                            required property string modelData
                            text: (board.preferences.enabledModules.split(",").includes(modelData) ? "✓  " : "+  ") + modelData.toUpperCase()
                            ink: board.ink
                            outlined: true
                            onClicked: board.toggleModule(modelData)
                        }
                    }
                }
                RowLayout {
                    SmallButton {
                        text: "Columns: " + board.preferences.columns
                        ink: board.ink; outlined: true
                        onClicked: board.preferences.columns = board.preferences.columns % 3 + 1
                    }
                    SmallButton {
                        text: board.preferences.darkInk ? "Dark text" : "Light text"
                        ink: board.ink; outlined: true
                        onClicked: board.preferences.darkInk = !board.preferences.darkInk
                    }
                }
                Text { text: "PING TARGETS"; color: board.ink; font.pixelSize: 10; font.letterSpacing: 2 }
                TextArea {
                    id: targetEditor
                    objectName: "targetEditor"
                    Layout.fillWidth: true
                    Layout.preferredHeight: 85
                    text: board.preferences.targetsText
                    placeholderText: "Work | https://example.com | ◇\nHome | 192.168.1.1 | ⌂"
                    placeholderTextColor: Qt.rgba(board.ink.r, board.ink.g, board.ink.b, 0.4)
                    color: board.ink
                    font.pixelSize: 12
                    wrapMode: TextEdit.Wrap
                    selectByMouse: true
                    textFormat: TextEdit.PlainText
                    background: Rectangle { color: "transparent"; border.color: Qt.rgba(board.ink.r, board.ink.g, board.ink.b, 0.2); radius: 4 }
                }
                RowLayout {
                    SmallButton {
                        text: "Apply targets"; ink: board.ink; outlined: true
                        onClicked: { board.preferences.targetsText = targetEditor.text; board.poll() }
                    }
                    Text { text: "label | URL | icon · up to 8"; color: board.ink; opacity: 0.5; font.pixelSize: 10 }
                }
                Text {
                    Layout.fillWidth: true
                    text: "Split: add another Monitor widget, then choose its modules. Each widget keeps its own note and layout."
                    color: board.ink; opacity: 0.5; font.pixelSize: 11; wrapMode: Text.Wrap
                }
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
                        DropArea {
                            anchors.fill: parent
                            keys: ["monitor-module"]
                            onDropped: drop => {
                                const source = drop.source.moduleKey
                                const target = tile.modelData
                                drop.acceptProposedAction()
                                Qt.callLater(() => board.dropModule(source, target))
                            }
                            Rectangle {
                                anchors.top: parent.top
                                width: parent.width; height: 1
                                color: board.ink
                                opacity: parent.containsDrag ? 0.9 : 0.18
                            }
                        }
                        RowLayout {
                            id: tileHeading
                            width: parent.width
                            height: 24
                            Text { text: tile.modelData === "media" ? "NOW PLAYING" : tile.modelData === "claude" ? "CLAUDE CODE" : tile.modelData === "resets" ? "RESET NEWS" : tile.modelData.toUpperCase(); color: board.ink; opacity: 0.65; font.pixelSize: 10; font.letterSpacing: 1.8 }
                            Item { Layout.fillWidth: true }
                            SmallButton {
                                visible: tile.modelData === "gpu" && board.snapshot.gpus.length > 1 && !board.customizing
                                text: "Next GPU →"; ink: board.ink
                                onClicked: board.selectedGpu = (board.selectedGpu + 1) % board.snapshot.gpus.length
                            }
                            SmallButton { visible: board.customizing; text: "←"; ink: board.ink; onClicked: board.moveModule(tile.modelData, -1) }
                            SmallButton { visible: board.customizing; text: "→"; ink: board.ink; onClicked: board.moveModule(tile.modelData, 1) }
                            Item {
                                visible: board.customizing
                                Layout.preferredWidth: 22; Layout.preferredHeight: 25
                                Text {
                                    id: handle
                                    objectName: "drag_" + tile.modelData
                                    property string moduleKey: tile.modelData
                                    text: "⠿"
                                    color: board.ink
                                    font.pixelSize: 20
                                    z: 100
                                    Drag.active: dragMouse.drag.active
                                    Drag.source: handle
                                    Drag.keys: ["monitor-module"]
                                    Drag.hotSpot.x: 10
                                    Drag.hotSpot.y: 12
                                    MouseArea {
                                        id: dragMouse
                                        anchors.fill: parent
                                        drag.target: handle
                                        cursorShape: Qt.OpenHandCursor
                                        onReleased: { handle.Drag.drop(); handle.x = 0; handle.y = 0 }
                                        onCanceled: { handle.x = 0; handle.y = 0 }
                                    }
                                }
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
                text: "Choose a module in Customize."
                color: board.ink; opacity: 0.5; font.pixelSize: 12
            }
            Item { Layout.fillWidth: true; implicitHeight: 6 }
        }
    }
}

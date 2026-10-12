import QtQuick

FocusScope {
    id: card
    required property var owner
    property color ink: "#f5f5f4"
    property int fontSize: 11
    property int terminalHeight: 230
    readonly property string session: owner.session
    property var frame: ({lines: [], plain: [], cursor: {x: 0, y: 0, visible: false}})
    property int revision: -1
    property var screenRequest: null
    property string error: ""
    property bool starting: false
    property bool alive: !!session
    property bool pasting: false
    property var inputQueue: []
    property bool inputPending: false
    property bool cursorPhase: true
    readonly property real cellWidth: metrics.averageCharacterWidth
    readonly property real lineHeight: Math.ceil(metrics.height + 2)
    readonly property int columns: Math.max(20, Math.min(160, Math.floor(width / cellWidth)))
    readonly property int rows: Math.max(6, Math.min(60, Math.floor(terminalHeight / lineHeight)))
    implicitHeight: terminalHeight
    clip: true
    FontMetrics { id: metrics; font.family: "monospace"; font.pixelSize: card.fontSize }
    function post(action, value, done) {
        const xhr = new XMLHttpRequest()
        xhr.onreadystatechange = function() {
            if (xhr.readyState !== XMLHttpRequest.DONE) return
            if (!card) return
            let response = {}
            try { response = JSON.parse(xhr.responseText) } catch (error) {}
            if (xhr.status !== 200 && action !== "close") card.error = response.error || "Terminal bridge unavailable"
            if (done) done(xhr.status === 200, response)
        }
        xhr.open("POST", "http://127.0.0.1:17341/terminal/" + action)
        xhr.setRequestHeader("X-Monitor-Client", "plasma-widget")
        xhr.setRequestHeader("Content-Type", "application/json")
        xhr.send(JSON.stringify(value))
    }
    function start() {
        if (starting || session) return
        starting = true
        error = ""
        post("start", {columns: columns, rows: rows}, (ok, response) => {
            starting = false
            if (ok) { owner.session = response.session; alive = true; input.forceActiveFocus(); poll() }
        })
    }
    function send(text, paste) {
        if (!session || !alive) return
        inputQueue = inputQueue.concat([{text: text, paste: !!paste}])
        drainInput()
    }
    function drainInput() {
        if (inputPending || !inputQueue.length || !session) return
        const value = inputQueue[0]
        const token = session
        inputQueue = inputQueue.slice(1)
        inputPending = true
        post("input", {session: token, text: value.text, paste: value.paste}, () => {
            if (card.session !== token) return
            inputPending = false
            Qt.callLater(card.drainInput)
        })
    }
    function close() {
        owner.close()
        revision = -1; alive = false; inputQueue = []; inputPending = false
        frame = {lines: [], plain: [], cursor: {x: 0, y: 0, visible: false}}
        surface.requestPaint()
    }
    function poll() {
        if (!session || screenRequest) return
        const xhr = new XMLHttpRequest()
        screenRequest = xhr
        screenTimeout.restart()
        xhr.onreadystatechange = function() {
            if (xhr.readyState !== XMLHttpRequest.DONE) return
            screenTimeout.stop()
            screenRequest = null
            try {
                const value = JSON.parse(xhr.responseText)
                if (xhr.status !== 200) { card.error = value.error || "Terminal bridge unavailable"; alive = false; return }
                alive = value.alive
                if (!value.unchanged) { frame = value; revision = value.revision; surface.requestPaint() }
            } catch (error) { card.error = "Terminal bridge unavailable" }
        }
        xhr.open("GET", "http://127.0.0.1:17341/terminal/screen?session=" + encodeURIComponent(session) + "&revision=" + revision)
        xhr.setRequestHeader("X-Monitor-Client", "plasma-widget")
        xhr.send()
    }
    function resize() { if (session && alive) post("resize", {session: session, columns: columns, rows: rows}) }
    onColumnsChanged: resizeTimer.restart()
    onRowsChanged: resizeTimer.restart()
    onInkChanged: surface.requestPaint()
    Timer { id: resizeTimer; interval: 150; onTriggered: card.resize() }
    Timer { interval: 150; running: !!card.session && card.visible; repeat: true; onTriggered: card.poll() }
    Timer { interval: 500; running: !!card.session && card.alive; repeat: true; onTriggered: { card.cursorPhase = !card.cursorPhase; surface.requestPaint() } }
    Timer { id: screenTimeout; interval: 3000; onTriggered: { if (card.screenRequest) card.screenRequest.abort(); card.screenRequest = null } }
    Component.onCompleted: if (session) poll()
    Component.onDestruction: if (screenRequest) screenRequest.abort()
    Canvas {
        id: surface
        objectName: "terminalCanvas"
        anchors.fill: parent
        onPaint: {
            const ctx = getContext("2d")
            ctx.clearRect(0, 0, width, height)
            ctx.textBaseline = "top"
            const lines = card.frame.lines || []
            for (let y = 0; y < lines.length; ++y) {
                for (const run of lines[y]) {
                    const style = run.style
                    let fg = style[0] || card.ink
                    let bg = style[1] || "transparent"
                    if (style[5]) { const swap = fg; fg = bg === "transparent" ? "#242424" : bg; bg = swap }
                    ctx.fillStyle = bg
                    ctx.fillRect(run.x * card.cellWidth, y * card.lineHeight, run.width * card.cellWidth, card.lineHeight)
                    ctx.fillStyle = fg
                    ctx.font = (style[2] ? "bold " : "") + (style[3] ? "italic " : "") + card.fontSize + "px monospace"
                    ctx.fillText(run.text, run.x * card.cellWidth, y * card.lineHeight)
                    if (style[4]) ctx.fillRect(run.x * card.cellWidth, (y + 1) * card.lineHeight - 2, run.width * card.cellWidth, 1)
                }
            }
            const cursor = card.frame.cursor || {}
            if (cursor.visible && card.alive && input.activeFocus && card.cursorPhase) {
                ctx.fillStyle = card.ink
                ctx.globalAlpha = 0.55
                ctx.fillRect(cursor.x * card.cellWidth, cursor.y * card.lineHeight, card.cellWidth, card.lineHeight)
                ctx.globalAlpha = 1
            }
        }
        MouseArea {
            anchors.fill: parent
            acceptedButtons: Qt.LeftButton
            onClicked: if (card.session) input.forceActiveFocus()
            onWheel: wheel => {
                if (card.session) card.post("scroll", {session: card.session, direction: wheel.angleDelta.y > 0 ? -1 : 1})
                wheel.accepted = !!card.session
            }
        }
    }
    TextInput {
        id: input
        objectName: "terminalInput"
        x: (card.frame.cursor.x || 0) * card.cellWidth
        y: (card.frame.cursor.y || 0) * card.lineHeight
        width: card.cellWidth; height: card.lineHeight
        color: "transparent"
        cursorVisible: false
        font.family: "monospace"; font.pixelSize: card.fontSize
        inputMethodHints: Qt.ImhNoPredictiveText
        onTextEdited: { const value = text; clear(); if (value) card.send(value, card.pasting) }
        onActiveFocusChanged: surface.requestPaint()
        Keys.onPressed: event => {
            const control = !!(event.modifiers & Qt.ControlModifier)
            const shift = !!(event.modifiers & Qt.ShiftModifier)
            if (control && shift && event.key === Qt.Key_C) {
                text = (card.frame.plain || []).map(line => line.trimEnd()).join("\n")
                selectAll(); copy(); clear(); event.accepted = true; return
            }
            if (control && shift && event.key === Qt.Key_V) { card.pasting = true; paste(); card.pasting = false; event.accepted = true; return }
            let value = ""
            const arrows = card.frame.application_cursor ? "\x1bO" : "\x1b["
            const keys = {}
            keys[Qt.Key_Return] = "\r"; keys[Qt.Key_Enter] = "\r"; keys[Qt.Key_Backspace] = "\x7f"
            keys[Qt.Key_Tab] = "\t"; keys[Qt.Key_Backtab] = "\x1b[Z"; keys[Qt.Key_Escape] = "\x1b"
            keys[Qt.Key_Up] = arrows + "A"; keys[Qt.Key_Down] = arrows + "B"; keys[Qt.Key_Right] = arrows + "C"; keys[Qt.Key_Left] = arrows + "D"
            keys[Qt.Key_Home] = "\x1b[H"; keys[Qt.Key_End] = "\x1b[F"; keys[Qt.Key_Delete] = "\x1b[3~"
            keys[Qt.Key_PageUp] = "\x1b[5~"; keys[Qt.Key_PageDown] = "\x1b[6~"
            keys[Qt.Key_F1] = "\x1bOP"; keys[Qt.Key_F2] = "\x1bOQ"; keys[Qt.Key_F3] = "\x1bOR"; keys[Qt.Key_F4] = "\x1bOS"
            keys[Qt.Key_F5] = "\x1b[15~"; keys[Qt.Key_F6] = "\x1b[17~"; keys[Qt.Key_F7] = "\x1b[18~"; keys[Qt.Key_F8] = "\x1b[19~"
            keys[Qt.Key_F9] = "\x1b[20~"; keys[Qt.Key_F10] = "\x1b[21~"; keys[Qt.Key_F11] = "\x1b[23~"; keys[Qt.Key_F12] = "\x1b[24~"
            if (control && event.key >= Qt.Key_A && event.key <= Qt.Key_Z) value = String.fromCharCode(event.key - Qt.Key_A + 1)
            else if (control && event.key === Qt.Key_Space) value = "\x00"
            else if (event.modifiers & Qt.AltModifier && event.text) value = "\x1b" + event.text
            else value = keys[event.key] || ""
            if (value) { card.send(value); event.accepted = true }
        }
    }
    Text { x: input.x; y: input.y; text: input.preeditText; color: card.ink; font: input.font }
    SmallButton {
        objectName: "terminalStart"
        anchors.centerIn: parent
        visible: !card.session
        enabled: !card.starting
        text: card.starting ? "Starting…" : "Start terminal"
        ink: card.ink
        outlined: true
        onClicked: card.start()
    }
    SmallButton {
        anchors.right: parent.right
        anchors.top: parent.top
        visible: !!card.session && !card.alive
        text: "Restart terminal"
        ink: card.ink
        onClicked: { card.close(); card.start() }
    }
    Text { anchors.left: parent.left; anchors.bottom: parent.bottom; width: parent.width; text: card.error; color: card.ink; font.pixelSize: 10; wrapMode: Text.Wrap; visible: text.length > 0 }
}

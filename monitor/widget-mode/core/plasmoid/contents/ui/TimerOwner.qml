import QtQuick

Item {
    id: owner
    required property var preferences
    property bool active: false
    property string session: ""
    property var readings: ({countdown: {}, stopwatch: {}})
    property string error: ""
    property var timeEdits: ({})
    property bool completionAcknowledged: false
    property bool countdownEditing: false
    readonly property bool countdownFinished: readings.countdown.finished === true
    onCountdownFinishedChanged: if (!countdownFinished) completionAcknowledged = false
    property var request: null
    readonly property bool busy: request !== null
    readonly property int duration: preferences.countdownSeconds === undefined ? 300 : preferences.countdownSeconds
    readonly property int offset: preferences.stopwatchSeconds || 0
    function send(path, payload) {
        if (request) return
        const xhr = new XMLHttpRequest()
        request = xhr; timeout.restart()
        xhr.onreadystatechange = function() {
            if (xhr.readyState !== XMLHttpRequest.DONE || request !== xhr) return
            timeout.stop(); request = null
            if (xhr.status !== 200) {
                if (xhr.status === 410) session = ""
                error = "Timers unavailable · retrying"
                return
            }
            try {
                const data = JSON.parse(xhr.responseText)
                session = data.session; readings = data; error = ""
                if (payload && payload.action === "configure" && timeEdits[payload.kind] === payload.seconds) {
                    const pending = Object.assign({}, timeEdits); delete pending[payload.kind]; timeEdits = pending
                }
                if (!active) close()
            } catch (e) { error = "Invalid timer response" }
        }
        xhr.open(payload === null ? "GET" : "POST", "http://127.0.0.1:17341" + path)
        xhr.setRequestHeader("X-Monitor-Client", "plasma-widget")
        if (payload !== null) xhr.setRequestHeader("Content-Type", "application/json")
        xhr.send(payload === null ? null : JSON.stringify(payload))
    }
    function poll() {
        if (!active || request) return
        if (!session) send("/timers/create", {duration: duration, offset: offset})
        else if (timeEdits.countdown !== undefined) control("countdown", "configure", timeEdits.countdown)
        else if (timeEdits.stopwatch !== undefined) control("stopwatch", "configure", timeEdits.stopwatch)
        else if (readings.countdown.initial !== duration) control("countdown", "configure", duration)
        else if (readings.stopwatch.initial !== offset) control("stopwatch", "configure", offset)
        else send("/timers/state?session=" + encodeURIComponent(session), null)
    }
    function setTime(kind, seconds) {
        if (!["countdown", "stopwatch"].includes(kind) || !Number.isInteger(seconds) || seconds < (kind === "countdown" ? 1 : 0) || seconds > 86400) return
        if (kind === "countdown" && countdownFinished) completionAcknowledged = true
        preferences[kind === "countdown" ? "countdownSeconds" : "stopwatchSeconds"] = seconds
        timeEdits = Object.assign({}, timeEdits, {[kind]: seconds})
        Qt.callLater(poll)
    }
    function acknowledgeCountdown() {
        if (!active || !session || !countdownFinished || countdownEditing) return false
        completionAcknowledged = true
        setTime("countdown", duration)
        return true
    }
    function control(kind, action, seconds) {
        if (!session) return
        send("/timers/control", {session: session, kind: kind, action: action, seconds: seconds})
    }
    function close() {
        if (!session) return
        const previous = session; session = ""; timeEdits = ({}); readings = {countdown: {}, stopwatch: {}}
        const xhr = new XMLHttpRequest()
        xhr.open("POST", "http://127.0.0.1:17341/timers/close")
        xhr.setRequestHeader("X-Monitor-Client", "plasma-widget")
        xhr.setRequestHeader("Content-Type", "application/json")
        xhr.send(JSON.stringify({session: previous}))
    }
    Timer { interval: owner.error ? 2000 : 250; running: owner.active; repeat: true; onTriggered: owner.poll() }
    Timer { id: timeout; interval: 6000; onTriggered: { const xhr = owner.request; owner.request = null; if (xhr) xhr.abort(); owner.error = "Timer bridge timed out" } }
    onActiveChanged: { if (active) Qt.callLater(poll); else close() }
    Component.onDestruction: { if (request) request.abort(); close() }
}

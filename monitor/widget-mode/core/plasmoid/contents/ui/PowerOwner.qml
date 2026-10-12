import QtQuick

Item {
    id: owner
    property bool active: false
    property string token: ""
    readonly property bool awake: token.length > 0
    property bool busy: false
    property string operation: ""
    property string error: ""
    property var request: null
    function send(path, payload, callback) {
        if (busy) return
        busy = true; operation = path === "/power/awake" ? payload.action : path
        const xhr = new XMLHttpRequest()
        request = xhr
        timeout.restart()
        xhr.onreadystatechange = function() {
            if (xhr.readyState !== XMLHttpRequest.DONE || request !== xhr) return
            timeout.stop(); request = null; busy = false; operation = ""
            if (xhr.status !== 200) {
                if (path === "/power/awake") token = ""
                error = xhr.status === 410 ? "Keep-awake expired" : "Power control unavailable"
                return
            }
            try { error = ""; callback(JSON.parse(xhr.responseText)) }
            catch (e) { error = "Invalid power response" }
        }
        xhr.open("POST", "http://127.0.0.1:17341" + path)
        xhr.setRequestHeader("X-Monitor-Client", "plasma-widget")
        xhr.setRequestHeader("Content-Type", "application/json")
        xhr.send(JSON.stringify(payload))
    }
    function toggle() { send("/power/awake", {action: awake ? "disable" : "enable", token: token}, data => { token = data.active ? data.token : ""; if (!active) close() }) }
    function setProfile(profile) { send("/power/profile", {profile: profile}, () => {}) }
    function close() {
        if (!token) return
        const previous = token; token = ""
        const xhr = new XMLHttpRequest()
        xhr.open("POST", "http://127.0.0.1:17341/power/awake")
        xhr.setRequestHeader("X-Monitor-Client", "plasma-widget")
        xhr.setRequestHeader("Content-Type", "application/json")
        xhr.send(JSON.stringify({action: "disable", token: previous}))
    }
    Timer { interval: 2000; repeat: true; running: owner.active && owner.awake; onTriggered: owner.send("/power/awake", {action: "heartbeat", token: owner.token}, data => { owner.token = data.token; if (!owner.active) owner.close() }) }
    Timer { id: timeout; interval: 12000; onTriggered: { const xhr = owner.request; owner.request = null; owner.busy = false; owner.operation = ""; if (xhr) xhr.abort(); owner.close(); owner.error = "Power bridge timed out" } }
    onActiveChanged: if (!active) close()
    Component.onDestruction: { if (request) request.abort(); close() }
}

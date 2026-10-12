import QtQuick

Item {
    id: sync
    required property var preferences
    property string endpoint: "http://127.0.0.1:17341/config"
    property string profile: "default"
    property string connectedProfile: "default"
    readonly property string url: endpoint + "?profile=" + encodeURIComponent(connectedProfile)
    property bool active: true
    property bool ready: false
    property string path: ""
    property string error: ""
    property string revision: ""
    property var keys: []
    property var remote: ({})
    property var observed: ({})
    property var pending: ({})
    property var request: null
    property real lastRequest: 0
    property bool reloadRequested: false
    property bool reloadApplied: false

    onProfileChanged: Qt.callLater(switchProfile)
    function flush() {
        if (!ready || !Object.keys(pending).length) return
        const xhr = new XMLHttpRequest()
        xhr.open("POST", url)
        xhr.setRequestHeader("X-Monitor-Client", "plasma-widget")
        xhr.setRequestHeader("Content-Type", "application/json")
        xhr.send(JSON.stringify({revision: revision, changes: pending}))
    }
    function switchProfile() {
        if (connectedProfile === profile) return
        collect()
        flush()
        if (request) request.abort()
        request = null
        timeout.stop()
        connectedProfile = profile
        ready = false
        error = ""
        revision = ""
        keys = []
        pending = ({})
        observed = ({})
        remote = ({})
        tick()
    }
    function snapshot() {
        const values = {}
        for (const key of keys) values[key] = preferences[key]
        return values
    }
    function collect() {
        if (!ready) return
        const now = snapshot(), changes = Object.assign({}, pending)
        for (const key of keys) if (now[key] !== observed[key]) changes[key] = now[key]
        pending = changes
        observed = now
    }
    function accept(state, sent, conflict) {
        path = state.path
        keys = Object.keys(state.settings)
        if (!ready) {
            remote = state.settings
            revision = state.revision
            if (state.configured) {
                for (const key of keys) preferences[key] = state.settings[key]
            } else {
                pending = snapshot()
            }
            observed = snapshot()
            ready = true
            return
        }
        collect()
        if (!state.configured) {
            revision = ""
            pending = snapshot()
            observed = snapshot()
            return
        }
        const changes = Object.assign({}, pending)
        let collided = false
        for (const key of keys) {
            const incoming = state.settings[key]
            if (changes[key] !== undefined) {
                if (incoming === changes[key]) delete changes[key]
                else if (incoming !== remote[key] && (conflict || !sent || incoming !== sent[key])) {
                    delete changes[key]
                    collided = true
                }
            }
            if (changes[key] === undefined) preferences[key] = incoming
        }
        remote = state.settings
        revision = state.revision
        pending = changes
        observed = snapshot()
        if (collided) error = "File changes took priority over concurrent widget edits"
    }
    function send(changes) {
        const xhr = new XMLHttpRequest()
        request = xhr
        lastRequest = Date.now()
        timeout.restart()
        xhr.onreadystatechange = function() {
            if (xhr.readyState !== XMLHttpRequest.DONE || request !== xhr) return
            timeout.stop()
            request = null
            try {
                const state = JSON.parse(xhr.responseText)
                if (xhr.status === 200 || xhr.status === 409) {
                    error = ""
                    accept(state, changes, xhr.status === 409)
                    if (reloadRequested && xhr.status === 200 && changes === null) {
                        reloadRequested = false
                        reloadApplied = true
                    }
                } else error = state.error || "Config file unavailable · retrying"
            } catch (e) { error = "Config file unavailable · retrying" }
        }
        xhr.open(changes === null ? "GET" : "POST", url)
        xhr.setRequestHeader("X-Monitor-Client", "plasma-widget")
        if (changes !== null) xhr.setRequestHeader("Content-Type", "application/json")
        xhr.send(changes === null ? null : JSON.stringify({revision: revision, changes: changes}))
    }
    function tick() {
        if (!active) return
        collect()
        if (request) return
        if (error && Date.now() - lastRequest < 1500) return
        if (!ready) send(null)
        else if (Object.keys(pending).length) send(Object.assign({}, pending))
        else if (reloadRequested || Date.now() - lastRequest >= 1000) send(null)
    }
    function reload() { reloadRequested = true; reloadApplied = false; tick() }
    Timer { interval: 250; running: sync.active; repeat: true; onTriggered: sync.tick() }
    Timer {
        id: timeout
        interval: 6000
        onTriggered: {
            const xhr = sync.request
            sync.request = null
            if (xhr) xhr.abort()
            sync.error = "Config file bridge timed out · retrying"
        }
    }
    Component.onCompleted: { switchProfile(); tick() }
    Component.onDestruction: {
        collect()
        if (request) request.abort()
        // Best effort final save; normal edits are saved while the widget is open.
        flush()
    }
}

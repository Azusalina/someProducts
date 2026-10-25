pragma ComponentBehavior: Bound
import QtQuick
import "AudioTools.js" as AudioTools

Item {
    id: ambient
    property int refreshInterval: 100
    property color ink: "#f5f5f4"
    property var audioBars: []
    readonly property var levels: AudioTools.enhance(audioBars)
    readonly property real energy: levels.length ? levels.reduce((sum, value) => sum + value, 0) / levels.length : 0
    property var request: null
    clip: true
    function poll() {
        if (request) return
        const xhr = new XMLHttpRequest()
        request = xhr
        timeout.restart()
        xhr.onreadystatechange = function() {
            if (xhr.readyState !== XMLHttpRequest.DONE || ambient.request !== xhr) return
            timeout.stop(); ambient.request = null
            try { ambient.audioBars = xhr.status === 200 ? JSON.parse(xhr.responseText).bars || [] : [] }
            catch (error) { ambient.audioBars = [] }
        }
        xhr.open("GET", "http://127.0.0.1:17341/audio")
        xhr.setRequestHeader("X-Monitor-Client", "plasma-widget")
        xhr.send()
    }
    Timer {
        interval: ambient.refreshInterval; repeat: true
        running: ambient.enabled && ambient.visible
        onTriggered: ambient.poll()
        onRunningChanged: if (!running) {
            const pending = ambient.request; ambient.request = null
            timeout.stop(); if (pending) pending.abort()
            ambient.audioBars = []
        }
    }
    Timer {
        id: timeout; interval: 2000
        onTriggered: {
            const pending = ambient.request; ambient.request = null
            if (pending) pending.abort()
            ambient.audioBars = []
        }
    }
    Component.onDestruction: if (request) request.abort()
    Repeater {
        model: ambient.levels
        Rectangle {
            required property int index
            required property real modelData
            x: index * ambient.width / Math.max(1, ambient.levels.length)
            anchors.bottom: parent.bottom
            width: Math.max(1, ambient.width / Math.max(1, ambient.levels.length) - 3)
            height: ambient.height * modelData * 0.65
            opacity: 0.35 + ambient.energy * 0.65
            Behavior on height { NumberAnimation { duration: Math.round(ambient.refreshInterval * 1.2) } }
            Behavior on opacity { NumberAnimation { duration: Math.round(ambient.refreshInterval * 1.8) } }
            gradient: Gradient {
                GradientStop { position: 0; color: "transparent" }
                GradientStop { position: 1; color: ambient.ink }
            }
        }
    }
}

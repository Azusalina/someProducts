import QtQml

QtObject {
    id: owner
    property string session: ""
    property bool active: false
    function close() {
        if (!session) return
        const token = session
        session = ""
        const xhr = new XMLHttpRequest()
        xhr.open("POST", "http://127.0.0.1:17341/terminal/close")
        xhr.setRequestHeader("X-Monitor-Client", "plasma-widget")
        xhr.setRequestHeader("Content-Type", "application/json")
        xhr.send(JSON.stringify({session: token}))
    }
    onActiveChanged: if (!active) close()
    Component.onDestruction: close()
}

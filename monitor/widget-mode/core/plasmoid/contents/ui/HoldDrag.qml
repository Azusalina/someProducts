import QtQuick

// Passive until a deliberate hold: normal buttons, typing and selection keep
// their normal short-click behavior. Scene coordinates survive host movement.
Item {
    id: gesture
    property bool armed: false
    property bool moving: false
    property real holdSeconds: 0.45
    signal started(point position)
    signal moved(point position)
    signal finished(point position)
    signal canceled()
    function globalPoint(point) { return mapToGlobal(mapFromItem(null, point)) }
    TapHandler {
        id: hold
        parent: gesture.parent
        enabled: gesture.enabled
        acceptedButtons: Qt.LeftButton
        longPressThreshold: gesture.holdSeconds
        gesturePolicy: TapHandler.DragThreshold
        onLongPressed: {
            gesture.armed=true
            gesture.started(gesture.globalPoint(point.scenePosition))
        }
        onPressedChanged: {
            if (!pressed) Qt.callLater(() => {
                if (gesture.armed && !drag.active) {
                    gesture.armed=false
                    gesture.canceled()
                }
            })
        }
    }
    DragHandler {
        id: drag
        parent: gesture.parent
        enabled: gesture.enabled
        dragThreshold: gesture.armed ? 1 : 32767
        target: null
        acceptedButtons: Qt.LeftButton
        grabPermissions: PointerHandler.CanTakeOverFromAnything
        cursorShape: Qt.ClosedHandCursor
        onActiveChanged: {
            gesture.moving=active
            if (active) gesture.moved(gesture.globalPoint(centroid.scenePosition))
            if (!active && gesture.armed) {
                gesture.armed=false
                gesture.finished(gesture.globalPoint(centroid.scenePosition))
            }
        }
        onCentroidChanged: if (active) gesture.moved(gesture.globalPoint(centroid.scenePosition))
        onCanceled: {
            if (gesture.armed) {
                gesture.armed=false
                gesture.moving=false
                gesture.canceled()
            }
        }
    }
    onEnabledChanged: if (!enabled && armed) { armed=false; moving=false; canceled() }
}

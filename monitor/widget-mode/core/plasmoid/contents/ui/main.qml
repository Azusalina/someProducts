pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Layouts
import org.kde.plasma.core as PlasmaCore
import org.kde.plasma.plasmoid
import "ResizeTools.js" as ResizeTools
import "../native" as Native

PlasmoidItem {
    id: appletRoot
    Component.onCompleted: Qt.callLater(() => console.info("Monitor rectangular host available:", ResizeTools.host(appletRoot) !== null))
    readonly property var configuration: Plasmoid.configuration
    readonly property var familyRoot: desktopBridge.parentRoot
    property bool profileSyncEnabled: true
    property bool nativeReady: false
    function nativeSettings() {
        const values = {}
        for (const key of Object.keys(appletRoot.configuration)) {
            const value = appletRoot.configuration[key]
            if (key !== "objectName" && ["string", "boolean", "number"].includes(typeof value)) values[key] = value
        }
        return values
    }
    function applyNativeSettings(values) {
        for (const key of Object.keys(values)) {
            if (appletRoot.configuration[key] !== undefined) appletRoot.configuration[key] = values[key]
        }
    }
    property var freeMove: null
    function beginFreeMove(position) {
        const item=ResizeTools.host(appletRoot)
        if (!item || !desktopBridge.detachedModule || Plasmoid.immutable) return
        desktopBridge.prepareFreeHost(item)
        const point=item.parent.mapFromGlobal(position)
        freeMove={item:item,x:item.x,y:item.y,origin:point}
        item.layout.releaseSpace(item)
        item.configOverlayVisible=false
    }
    function updateFreeMove(position) {
        if (!freeMove) return
        const item=freeMove.item, point=item.parent.mapFromGlobal(position)
        item.x=Math.max(0,Math.min(Math.max(0,item.layout.width-item.width),freeMove.x+point.x-freeMove.origin.x))
        item.y=Math.max(0,Math.min(Math.max(0,item.layout.height-item.height),freeMove.y+point.y-freeMove.origin.y))
    }
    function finishFreeMove(position,cancel) {
        if (!freeMove) return
        const move=freeMove
        if (!cancel) updateFreeMove(position)
        freeMove=null
        ResizeTools.placeFree(move.item,cancel?move.x:move.item.x,cancel?move.y:move.item.y)
        desktopBridge.rememberFreePosition(Qt.point(move.item.x,move.item.y))
        if (!cancel) desktopBridge.mergeAt(position)
    }
    function moveNativeHost(position) {
        const item=ResizeTools.host(appletRoot)
        if (!item) return
        const local=item.parent.mapFromGlobal(position)
        desktopBridge.prepareFreeHost(item)
        ResizeTools.placeFree(item,local.x,local.y)
        desktopBridge.rememberFreePosition(Qt.point(item.x,item.y))
    }
    function configureDetachedHost() {
        const item=ResizeTools.host(appletRoot)
        if (!item || !desktopBridge.detachedModule) return
        desktopBridge.prepareFreeHost(item)
        // Our hold gesture replaces Plasma's edit-mode hold/overlay for children.
        item.editModeCondition=0 // ItemContainer.Locked
        item.editMode=false
        item.configOverlayVisible=false
    }
    function restoreFreePlacement() {
        configureDetachedHost()
        const item=ResizeTools.host(appletRoot), saved=desktopBridge.freePosition()
        if (item && saved.x !== undefined) ResizeTools.placeFree(item,saved.x,saved.y)
    }
    Timer {
        id: restoreFreePosition
        interval: 350
        onTriggered: appletRoot.restoreFreePlacement()
    }
    HoldDrag {
        anchors.fill: parent
        enabled: appletRoot.nativeReady && !!desktopBridge.detachedModule && !Plasmoid.immutable
        onStarted: position => appletRoot.beginFreeMove(position)
        onMoved: position => appletRoot.updateFreeMove(position)
        onFinished: position => appletRoot.finishFreeMove(position,false)
        onCanceled: appletRoot.finishFreeMove(Qt.point(0,0),true)
    }
    Native.DesktopBridge {
        id: desktopBridge
        root: appletRoot
        countdownShortcut: appletRoot.configuration.countdownShortcut || ""
        stopwatchShortcut: appletRoot.configuration.stopwatchShortcut || ""
        onInitialized: { appletRoot.nativeReady=true; Qt.callLater(appletRoot.configureDetachedHost); restoreFreePosition.start() }
        onTopologyChanged: if (appletRoot.nativeReady) Qt.callLater(appletRoot.configureDetachedHost)
        onFocusRequested: kind => {
            if (appletRoot.dashboardControls) appletRoot.dashboardControls.timerControls.openFocus(kind)
        }
    }
    property var dashboardControls: fullRepresentationItem
    Keys.priority: Keys.BeforeItem
    Keys.onPressed: event => {
        if ((event.key === Qt.Key_Return || event.key === Qt.Key_Enter) && appletRoot.dashboardControls && appletRoot.dashboardControls.acknowledgeCountdown()) event.accepted = true
    }
    SettingsFile { active: appletRoot.nativeReady && appletRoot.profileSyncEnabled; preferences: appletRoot.configuration; profile: appletRoot.configuration.settingsProfile }
    Plasmoid.backgroundHints: PlasmaCore.Types.NoBackground
    preferredRepresentation: fullRepresentation
    fullRepresentation: Dashboard {
        id: dashboard
        onOuterResizeRequested: (edge,delta) => {
            if (!ResizeTools.resizeHost(appletRoot,edge,delta)) dashboard.resizeError="Native resize unavailable"
            else if (desktopBridge.detachedModule) {
                const item=ResizeTools.host(appletRoot)
                desktopBridge.rememberFreePosition(Qt.point(item.x,item.y))
            }
        }
        widgetId: Plasmoid.id
        runtimeReady: appletRoot.nativeReady
        detachedModule: desktopBridge.detachedModule
        detachedModules: desktopBridge.detachedModules
        inheritedTimerOwner: appletRoot.familyRoot && appletRoot.familyRoot.dashboardControls ? appletRoot.familyRoot.dashboardControls.timerControls : null
        inheritedTerminalOwner: appletRoot.familyRoot && appletRoot.familyRoot.dashboardControls ? appletRoot.familyRoot.dashboardControls.terminalControls : null
        inheritedPowerOwner: appletRoot.familyRoot && appletRoot.familyRoot.dashboardControls ? appletRoot.familyRoot.dashboardControls.powerControls : null
        onFreeMoveStarted: position => appletRoot.beginFreeMove(position)
        onFreeMoveUpdated: position => appletRoot.updateFreeMove(position)
        onFreeMoveFinished: position => appletRoot.finishFreeMove(position,false)
        onFreeMoveCanceled: appletRoot.finishFreeMove(Qt.point(0,0),true)
        onModuleReleased: (module, position) => desktopBridge.release(module, position)
        preferences: appletRoot.configuration
        nativeError: desktopBridge.error
        Layout.minimumWidth: 200
        Layout.minimumHeight: 120
        Layout.preferredWidth: desktopBridge.detachedModule ? 240 : 300
        Layout.preferredHeight: desktopBridge.detachedModule ? (desktopBridge.detachedModule === "terminal" ? 280 : 180) : 360
    }
}

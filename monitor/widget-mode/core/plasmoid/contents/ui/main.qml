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
    function moveNativeHost(position) {
        const item = ResizeTools.host(appletRoot)
        if (!item) return
        const local = item.parent.mapFromGlobal(position)
        item.layout.releaseSpace(item)
        item.x = Math.max(0, Math.min(item.layout.width - item.width, local.x))
        item.y = Math.max(0, Math.min(item.layout.height - item.height, local.y))
        item.layout.positionItem(item); item.layout.save()
    }
    Native.DesktopBridge {
        id: desktopBridge
        root: appletRoot
        countdownShortcut: appletRoot.configuration.countdownShortcut || ""
        stopwatchShortcut: appletRoot.configuration.stopwatchShortcut || ""
        onInitialized: appletRoot.nativeReady = true
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
        onOuterResizeRequested: (edge,delta) => { if(!ResizeTools.resizeHost(appletRoot,edge,delta)) dashboard.resizeError="Native resize unavailable" }
        widgetId: Plasmoid.id
        runtimeReady: appletRoot.nativeReady
        detachedModule: desktopBridge.detachedModule
        detachedModules: desktopBridge.detachedModules
        inheritedTimerOwner: appletRoot.familyRoot && appletRoot.familyRoot.dashboardControls ? appletRoot.familyRoot.dashboardControls.timerControls : null
        inheritedTerminalOwner: appletRoot.familyRoot && appletRoot.familyRoot.dashboardControls ? appletRoot.familyRoot.dashboardControls.terminalControls : null
        inheritedPowerOwner: appletRoot.familyRoot && appletRoot.familyRoot.dashboardControls ? appletRoot.familyRoot.dashboardControls.powerControls : null
        onModuleReleased: (module, position) => desktopBridge.release(module, position)
        preferences: appletRoot.configuration
        nativeError: desktopBridge.error
        Layout.minimumWidth: 200
        Layout.minimumHeight: 120
        Layout.preferredWidth: desktopBridge.detachedModule ? 240 : 300
        Layout.preferredHeight: desktopBridge.detachedModule ? (desktopBridge.detachedModule === "terminal" ? 280 : 180) : 360
    }
}

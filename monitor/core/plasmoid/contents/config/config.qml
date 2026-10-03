import org.kde.plasma.configuration

ConfigModel {
    ConfigCategory { name: "Modules"; icon: "view-grid"; source: "config/ConfigModules.qml" }
    ConfigCategory { name: "Appearance"; icon: "preferences-desktop-color"; source: "config/ConfigAppearance.qml" }
    ConfigCategory { name: "Ping"; icon: "network-wireless"; source: "config/ConfigPing.qml" }
}

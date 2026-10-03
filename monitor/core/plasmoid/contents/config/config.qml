import org.kde.plasma.configuration

ConfigModel {
    ConfigCategory { name: "Modules"; icon: "view-grid"; source: "config/ConfigModules.qml" }
    ConfigCategory { name: "Appearance"; icon: "preferences-desktop-color"; source: "config/ConfigAppearance.qml" }
    ConfigCategory { name: "Ping"; icon: "network-wireless"; source: "config/ConfigPing.qml" }
    ConfigCategory { name: "Media"; icon: "media-playback-start"; source: "config/ConfigMedia.qml" }
    ConfigCategory { name: "Terminal"; icon: "utilities-terminal"; source: "config/ConfigTerminal.qml" }
}

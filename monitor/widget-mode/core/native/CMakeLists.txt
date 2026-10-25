cmake_minimum_required(VERSION 3.21)
project(MonitorNative LANGUAGES CXX)
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_AUTOMOC ON)
find_package(Qt6 REQUIRED COMPONENTS Qml Quick)
find_package(KF6GlobalAccel REQUIRED)
find_library(MONITOR_PLASMA Plasma REQUIRED)
find_library(MONITOR_PLASMAQUICK PlasmaQuick REQUIRED)
find_library(MONITOR_CONFIG KF6ConfigCore REQUIRED)
qt_add_qml_module(monitornative
    URI Monitor.Native VERSION 1.0
    OUTPUT_DIRECTORY "${CMAKE_CURRENT_SOURCE_DIR}/../plasmoid/contents/native"
    SOURCES desktopbridge.h desktopbridge.cpp)
target_link_libraries(monitornative PRIVATE Qt6::Quick KF6::GlobalAccel ${MONITOR_PLASMA} ${MONITOR_PLASMAQUICK} ${MONITOR_CONFIG})

target_include_directories(monitornative PRIVATE /usr/include/Plasma /usr/include/PlasmaQuick /usr/include/KF6/KConfigCore /usr/include/KF6/KCoreAddons /usr/include/KF6/KPackage)
target_include_directories(monitornative PRIVATE /usr/include/KF6/KConfig)

set_target_properties(monitornative PROPERTIES LIBRARY_OUTPUT_DIRECTORY "${CMAKE_CURRENT_SOURCE_DIR}/../plasmoid/contents/native" BUILD_RPATH "$ORIGIN")
set_target_properties(monitornativeplugin PROPERTIES BUILD_RPATH "$ORIGIN")
option(MONITOR_NATIVE_TESTS "Build isolated native desktop integration probe" OFF)
if(MONITOR_NATIVE_TESTS)
  find_package(Qt6 REQUIRED COMPONENTS Widgets)
  add_executable(monitor_native_probe native_probe.cpp)
  target_link_libraries(monitor_native_probe PRIVATE monitornative KF6::GlobalAccel Qt6::Quick Qt6::Widgets ${MONITOR_PLASMA} ${MONITOR_PLASMAQUICK} ${MONITOR_CONFIG})
  target_include_directories(monitor_native_probe PRIVATE /usr/include/Plasma /usr/include/PlasmaQuick /usr/include/KF6/KConfigCore /usr/include/KF6/KConfig /usr/include/KF6/KCoreAddons /usr/include/KF6/KPackage)
endif()

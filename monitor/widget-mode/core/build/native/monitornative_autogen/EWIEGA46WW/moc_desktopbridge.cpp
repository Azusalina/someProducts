/****************************************************************************
** Meta object code from reading C++ file 'desktopbridge.h'
**
** Created by: The Qt Meta Object Compiler version 69 (Qt 6.12.0)
**
** WARNING! All changes made in this file will be lost!
*****************************************************************************/

#include "../../../../native/desktopbridge.h"
#include <QtCore/qmetatype.h>

#include <QtCore/qtmochelpers.h>

#include <memory>


#include <QtCore/qxptype_traits.h>
#if !defined(Q_MOC_OUTPUT_REVISION)
#error "The header file 'desktopbridge.h' doesn't include <QObject>."
#elif Q_MOC_OUTPUT_REVISION != 69
#error "This file was generated using the moc from 6.12.0. It"
#error "cannot be used with the include files from this version of Qt."
#error "(The moc has changed too much.)"
#endif

#ifndef Q_CONSTINIT
#define Q_CONSTINIT
#endif

QT_WARNING_PUSH
QT_WARNING_DISABLE_DEPRECATED
QT_WARNING_DISABLE_GCC("-Wuseless-cast")
namespace {
struct qt_meta_tag_ZN13DesktopBridgeE_t {};
} // unnamed namespace

template <> constexpr inline auto DesktopBridge::qt_create_metaobjectdata<qt_meta_tag_ZN13DesktopBridgeE_t>()
{
    namespace QMC = QtMocConstants;
    QtMocHelpers::StringRefStorage qt_stringData {
        "DesktopBridge",
        "QML.Element",
        "auto",
        "initialized",
        "",
        "topologyChanged",
        "shortcutsChanged",
        "errorChanged",
        "focusRequested",
        "kind",
        "release",
        "module",
        "QPointF",
        "globalPosition",
        "refresh",
        "prepareFreeHost",
        "QQuickItem*",
        "item",
        "rememberFreePosition",
        "position",
        "freePosition",
        "QVariantMap",
        "mergeAt",
        "root",
        "detachedModule",
        "detachedModules",
        "parentRoot",
        "countdownShortcut",
        "stopwatchShortcut",
        "error"
    };

    QtMocHelpers::UintData qt_methods {
        // Signal 'initialized'
        QtMocHelpers::SignalData<void()>(3, 4, QMC::AccessPublic, QMetaType::Void),
        // Signal 'topologyChanged'
        QtMocHelpers::SignalData<void()>(5, 4, QMC::AccessPublic, QMetaType::Void),
        // Signal 'shortcutsChanged'
        QtMocHelpers::SignalData<void()>(6, 4, QMC::AccessPublic, QMetaType::Void),
        // Signal 'errorChanged'
        QtMocHelpers::SignalData<void()>(7, 4, QMC::AccessPublic, QMetaType::Void),
        // Signal 'focusRequested'
        QtMocHelpers::SignalData<void(const QString &)>(8, 4, QMC::AccessPublic, QMetaType::Void, {{
            { QMetaType::QString, 9 },
        }}),
        // Method 'release'
        QtMocHelpers::MethodData<void(const QString &, const QPointF &)>(10, 4, QMC::AccessPublic, QMetaType::Void, {{
            { QMetaType::QString, 11 }, { 0x80000000 | 12, 13 },
        }}),
        // Method 'refresh'
        QtMocHelpers::MethodData<void()>(14, 4, QMC::AccessPublic, QMetaType::Void),
        // Method 'prepareFreeHost'
        QtMocHelpers::MethodData<bool(QQuickItem *)>(15, 4, QMC::AccessPublic, QMetaType::Bool, {{
            { 0x80000000 | 16, 17 },
        }}),
        // Method 'rememberFreePosition'
        QtMocHelpers::MethodData<void(const QPointF &)>(18, 4, QMC::AccessPublic, QMetaType::Void, {{
            { 0x80000000 | 12, 19 },
        }}),
        // Method 'freePosition'
        QtMocHelpers::MethodData<QVariantMap() const>(20, 4, QMC::AccessPublic, 0x80000000 | 21),
        // Method 'mergeAt'
        QtMocHelpers::MethodData<bool(const QPointF &)>(22, 4, QMC::AccessPublic, QMetaType::Bool, {{
            { 0x80000000 | 12, 13 },
        }}),
    };
    QtMocHelpers::UintData qt_properties {
        // property 'root'
        QtMocHelpers::PropertyData<QQuickItem*>(23, 0x80000000 | 16, QMC::DefaultPropertyFlags | QMC::Writable | QMC::EnumOrFlag | QMC::StdCppSet, 1),
        // property 'detachedModule'
        QtMocHelpers::PropertyData<QString>(24, QMetaType::QString, QMC::DefaultPropertyFlags, 1),
        // property 'detachedModules'
        QtMocHelpers::PropertyData<QStringList>(25, QMetaType::QStringList, QMC::DefaultPropertyFlags, 1),
        // property 'parentRoot'
        QtMocHelpers::PropertyData<QQuickItem*>(26, 0x80000000 | 16, QMC::DefaultPropertyFlags | QMC::EnumOrFlag, 1),
        // property 'countdownShortcut'
        QtMocHelpers::PropertyData<QString>(27, QMetaType::QString, QMC::DefaultPropertyFlags | QMC::Writable, 2),
        // property 'stopwatchShortcut'
        QtMocHelpers::PropertyData<QString>(28, QMetaType::QString, QMC::DefaultPropertyFlags | QMC::Writable, 2),
        // property 'error'
        QtMocHelpers::PropertyData<QString>(29, QMetaType::QString, QMC::DefaultPropertyFlags, 3),
    };
    QtMocHelpers::UintData qt_enums {
    };
    QtMocHelpers::UintData qt_constructors {};
    QtMocHelpers::ClassInfos qt_classinfo({
            {    1,    2 },
    });
    return QtMocHelpers::metaObjectData<DesktopBridge, void>(QMC::MetaObjectFlag{}, qt_stringData,
            qt_methods, qt_properties, qt_enums, qt_constructors, qt_classinfo);
}
Q_CONSTINIT const QMetaObject DesktopBridge::staticMetaObject = { {
    QMetaObject::SuperData::link<QObject::staticMetaObject>(),
    qt_staticMetaObjectStaticContent<qt_meta_tag_ZN13DesktopBridgeE_t>.stringdata,
    qt_staticMetaObjectStaticContent<qt_meta_tag_ZN13DesktopBridgeE_t>.data,
    qt_static_metacall,
    nullptr,
    qt_staticMetaObjectRelocatingContent<qt_meta_tag_ZN13DesktopBridgeE_t>.metaTypes,
    nullptr
} };

void DesktopBridge::qt_static_metacall(QObject *_o, QMetaObject::Call _c, int _id, void **_a)
{
    auto *_t = static_cast<DesktopBridge *>(_o);
    if (_c == QMetaObject::InvokeMetaMethod) {
        switch (_id) {
        case 0: _t->initialized(); break;
        case 1: _t->topologyChanged(); break;
        case 2: _t->shortcutsChanged(); break;
        case 3: _t->errorChanged(); break;
        case 4: _t->focusRequested((*reinterpret_cast<std::add_pointer_t<QString>>(_a[1]))); break;
        case 5: _t->release((*reinterpret_cast<std::add_pointer_t<QString>>(_a[1])),(*reinterpret_cast<std::add_pointer_t<QPointF>>(_a[2]))); break;
        case 6: _t->refresh(); break;
        case 7: { bool _r = _t->prepareFreeHost((*reinterpret_cast<std::add_pointer_t<QQuickItem*>>(_a[1])));
            if (_a[0]) *reinterpret_cast<bool*>(_a[0]) = std::move(_r); }  break;
        case 8: _t->rememberFreePosition((*reinterpret_cast<std::add_pointer_t<QPointF>>(_a[1]))); break;
        case 9: { QVariantMap _r = _t->freePosition();
            if (_a[0]) *reinterpret_cast<QVariantMap*>(_a[0]) = std::move(_r); }  break;
        case 10: { bool _r = _t->mergeAt((*reinterpret_cast<std::add_pointer_t<QPointF>>(_a[1])));
            if (_a[0]) *reinterpret_cast<bool*>(_a[0]) = std::move(_r); }  break;
        default: ;
        }
    }
    if (_c == QMetaObject::RegisterMethodArgumentMetaType) {
        switch (_id) {
        default: *reinterpret_cast<QMetaType *>(_a[0]) = QMetaType(); break;
        case 7:
            switch (*reinterpret_cast<int*>(_a[1])) {
            default: *reinterpret_cast<QMetaType *>(_a[0]) = QMetaType(); break;
            case 0:
                *reinterpret_cast<QMetaType *>(_a[0]) = QMetaType::fromType< QQuickItem* >(); break;
            }
            break;
        }
    }
    if (_c == QMetaObject::IndexOfMethod) {
        if (QtMocHelpers::indexOfMethod<void (DesktopBridge::*)()>(_a, &DesktopBridge::initialized, 0))
            return;
        if (QtMocHelpers::indexOfMethod<void (DesktopBridge::*)()>(_a, &DesktopBridge::topologyChanged, 1))
            return;
        if (QtMocHelpers::indexOfMethod<void (DesktopBridge::*)()>(_a, &DesktopBridge::shortcutsChanged, 2))
            return;
        if (QtMocHelpers::indexOfMethod<void (DesktopBridge::*)()>(_a, &DesktopBridge::errorChanged, 3))
            return;
        if (QtMocHelpers::indexOfMethod<void (DesktopBridge::*)(const QString & )>(_a, &DesktopBridge::focusRequested, 4))
            return;
    }
    if (_c == QMetaObject::RegisterPropertyMetaType) {
        switch (_id) {
        default: *reinterpret_cast<int*>(_a[0]) = -1; break;
        case 3:
        case 0:
            *reinterpret_cast<int*>(_a[0]) = qRegisterMetaType< QQuickItem* >(); break;
        }
    }
    if (_c == QMetaObject::ReadProperty) {
        void *_v = _a[0];
        switch (_id) {
        case 0: *reinterpret_cast<QQuickItem**>(_v) = _t->root(); break;
        case 1: *reinterpret_cast<QString*>(_v) = _t->detachedModule(); break;
        case 2: *reinterpret_cast<QStringList*>(_v) = _t->detachedModules(); break;
        case 3: *reinterpret_cast<QQuickItem**>(_v) = _t->parentRoot(); break;
        case 4: *reinterpret_cast<QString*>(_v) = _t->countdownShortcut; break;
        case 5: *reinterpret_cast<QString*>(_v) = _t->stopwatchShortcut; break;
        case 6: *reinterpret_cast<QString*>(_v) = _t->error(); break;
        default: break;
        }
    }
    if (_c == QMetaObject::WriteProperty) {
        void *_v = _a[0];
        switch (_id) {
        case 0: _t->setRoot(*reinterpret_cast<QQuickItem**>(_v)); break;
        case 4:
            if (QtMocHelpers::setProperty(_t->countdownShortcut, *reinterpret_cast<QString*>(_v)))
                Q_EMIT _t->shortcutsChanged();
            break;
        case 5:
            if (QtMocHelpers::setProperty(_t->stopwatchShortcut, *reinterpret_cast<QString*>(_v)))
                Q_EMIT _t->shortcutsChanged();
            break;
        default: break;
        }
    }
}

const QMetaObject *DesktopBridge::metaObject() const
{
    return QObject::d_ptr->metaObject ? QObject::d_ptr->dynamicMetaObject() : &staticMetaObject;
}

void *DesktopBridge::qt_metacast(const char *_clname)
{
    if (!_clname) return nullptr;
    if (!strcmp(_clname, qt_staticMetaObjectStaticContent<qt_meta_tag_ZN13DesktopBridgeE_t>.strings))
        return static_cast<void*>(this);
    return QObject::qt_metacast(_clname);
}

int DesktopBridge::qt_metacall(QMetaObject::Call _c, int _id, void **_a)
{
    _id = QObject::qt_metacall(_c, _id, _a);
    if (_id < 0)
        return _id;
    if (_c == QMetaObject::InvokeMetaMethod) {
        if (_id < 11)
            qt_static_metacall(this, _c, _id, _a);
        _id -= 11;
    }
    if (_c == QMetaObject::RegisterMethodArgumentMetaType) {
        if (_id < 11)
            qt_static_metacall(this, _c, _id, _a);
        _id -= 11;
    }
    if (_c == QMetaObject::ReadProperty || _c == QMetaObject::WriteProperty
            || _c == QMetaObject::ResetProperty || _c == QMetaObject::BindableProperty
            || _c == QMetaObject::RegisterPropertyMetaType) {
        qt_static_metacall(this, _c, _id, _a);
        _id -= 7;
    }
    return _id;
}

// SIGNAL 0
void DesktopBridge::initialized()
{
    QMetaObject::activate(this, &staticMetaObject, 0, nullptr);
}

// SIGNAL 1
void DesktopBridge::topologyChanged()
{
    QMetaObject::activate(this, &staticMetaObject, 1, nullptr);
}

// SIGNAL 2
void DesktopBridge::shortcutsChanged()
{
    QMetaObject::activate(this, &staticMetaObject, 2, nullptr);
}

// SIGNAL 3
void DesktopBridge::errorChanged()
{
    QMetaObject::activate(this, &staticMetaObject, 3, nullptr);
}

// SIGNAL 4
void DesktopBridge::focusRequested(const QString & _t1)
{
    QMetaObject::activate<void>(this, &staticMetaObject, 4, nullptr, _t1);
}
QT_WARNING_POP

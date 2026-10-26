#include "desktopbridge.h"
#include <Plasma/Applet>
#include <Plasma/Containment>
#include <PlasmaQuick/AppletQuickItem>
#include <KConfigGroup>
#include <KGlobalAccel>
#include <KGlobalShortcutInfo>
#include <algorithm>
#include <QHash>
#include <QKeySequence>
#include <QQmlProperty>
#include <QJSValue>
#include <cmath>
static QHash<uint,QPointer<DesktopBridge>> bridges;
static QHash<uint,QVariantMap> pending;
static const QString pluginId = QStringLiteral("local.monitor.dashboard");
static const QStringList modules = {"cpu","ram","ping","gpu","media","note","proton","wifi","bluetooth","terminal","battery","timers"};
DesktopBridge::DesktopBridge(QObject* parent):QObject(parent),m_countdown(new QAction(this)),m_stopwatch(new QAction(this)) {
    connect(&m_timer,&QTimer::timeout,this,&DesktopBridge::refresh);
    connect(this,&DesktopBridge::shortcutsChanged,this,&DesktopBridge::configureShortcuts);
    connect(m_countdown,&QAction::triggered,this,[this]{emit focusRequested("countdown");});
    connect(m_stopwatch,&QAction::triggered,this,[this]{emit focusRequested("stopwatch");});
}
DesktopBridge::~DesktopBridge() {
    if(m_applet && bridges.value(m_applet->id())==this) bridges.remove(m_applet->id());
    KGlobalAccel::self()->removeAllShortcuts(m_countdown);
    KGlobalAccel::self()->removeAllShortcuts(m_stopwatch);
}
void DesktopBridge::fail(const QString& text) { if(m_error!=text){m_error=text;emit errorChanged();} }
void DesktopBridge::setRoot(QQuickItem* item) {
    if(m_root==item) return;
    m_root=item;
    auto quick=qobject_cast<PlasmaQuick::AppletQuickItem*>(item);
    m_applet=quick ? quick->applet() : nullptr;
    if(!m_applet) {fail("Native desktop host unavailable");return;}
    bridges[m_applet->id()]=this;
    m_countdown->setObjectName(QString("monitor-%1-countdown").arg(m_applet->id()));
    m_stopwatch->setObjectName(QString("monitor-%1-stopwatch").arg(m_applet->id()));
    for(auto action:{m_countdown,m_stopwatch}) action->setProperty("componentName","someProducts-monitor");
    m_countdown->setText("Fullscreen countdown");m_stopwatch->setText("Fullscreen stopwatch");
    QTimer::singleShot(0,this,[this]{
        if(!m_applet || !m_root) return;
        auto values=pending.take(m_applet->id());
        if(!values.isEmpty()) QMetaObject::invokeMethod(m_root,"applyNativeSettings",Q_ARG(QVariant,QVariant(values)));
        m_initialized=true;refresh();emit initialized();configureShortcuts();
    });
    m_timer.start(500);
}
QString DesktopBridge::detachedModule() const { return m_applet ? m_applet->config().group("General").readEntry("detachedModule",QString()) : QString(); }
QQuickItem* DesktopBridge::parentRoot() const {
    if(!m_applet)return nullptr;
    auto id=m_applet->config().group("General").readEntry("detachedParent",0u);
    auto parent=bridges.value(id);return parent ? parent->root() : nullptr;
}
QStringList DesktopBridge::detachedModules() const {
    QStringList result;
    if(!m_applet || !m_applet->containment())return result;
    for(auto child:m_applet->containment()->applets()) {
        auto config=child->config().group("General");
        if(!child->destroyed() && child->pluginMetaData().pluginId()==pluginId && config.readEntry("detachedParent",0u)==m_applet->id())
            result.append(config.readEntry("detachedModule",QString()));
    }
    return result;
}
void DesktopBridge::refresh() {
    QString state=detachedModule()+":"+detachedModules().join(',')+":"+QString::number(quintptr(parentRoot()));
    if(state!=m_topology){m_topology=state;emit topologyChanged();configureShortcuts();}
}
void DesktopBridge::configureShortcuts() {
    if(!m_applet || !m_initialized) return;
    QString issue;
    const bool child=!detachedModule().isEmpty();
    const QList<QPair<QAction*,QString>> actions={{m_countdown,countdownShortcut},{m_stopwatch,stopwatchShortcut}};
    for(const auto& pair:actions){
        auto action=pair.first;auto text=child ? QString():pair.second.trimmed();
        auto sequence=QKeySequence::fromString(text,QKeySequence::PortableText);
        if(!text.isEmpty() && (sequence.isEmpty() || sequence.count()!=1 || sequence[0].keyboardModifiers()==Qt::NoModifier)) {
            issue="Use one shortcut with Ctrl, Alt, Shift or Meta";KGlobalAccel::self()->removeAllShortcuts(action);continue;
        }
        if(!sequence.isEmpty() && !KGlobalAccel::isGlobalShortcutAvailable(sequence)) {
            // KGlobalAccel retains inactive registrations across shell restarts.
            // Our action may not have loaded its keys yet; compare the persisted
            // component AND action identity, never exempt the whole component.
            const auto owners=KGlobalAccel::globalShortcutsByKey(sequence);
            const bool ours=!owners.isEmpty() && std::all_of(owners.cbegin(),owners.cend(),[action](const auto& owner){
                return owner.componentUniqueName()==action->property("componentName").toString()
                    && owner.uniqueName()==action->objectName();
            });
            if(!ours) {
                issue="Shortcut already in use: "+text;KGlobalAccel::self()->removeAllShortcuts(action);continue;
            }
        }
        KGlobalAccel::self()->setShortcut(action,sequence.isEmpty()?QList<QKeySequence>():QList<QKeySequence>{sequence},KGlobalAccel::NoAutoloading);
    }
    fail(issue);
}
void DesktopBridge::release(const QString& module,const QPointF& position) {
    if(!m_applet || !m_root || !m_applet->containment() || !modules.contains(module) || !std::isfinite(position.x()) || !std::isfinite(position.y()))return;
    auto containment=m_applet->containment();
    if(m_applet->immutability()!=Plasma::Types::Mutable) {fail("Unlock desktop widgets before splitting or moving");return;}
    if(!detachedModule().isEmpty()) {
        if (!mergeAt(position)) QMetaObject::invokeMethod(m_root,"moveNativeHost",Q_ARG(QVariant,QVariant(position)));
        return;
    }
    if(QRectF(0,0,m_root->width(),m_root->height()).contains(m_root->mapFromGlobal(position)))return;
    if(detachedModules().contains(module))return;
    auto quick=PlasmaQuick::AppletQuickItem::itemForApplet(containment);
    if(!quick){fail("Desktop containment is unavailable");return;}
    const auto local=quick->mapFromGlobal(position);
    auto child=containment->createApplet(pluginId,{},QRectF(local,QSizeF(280,module=="terminal"?280:180)));
    if(!child){fail("Could not create desktop component");return;}
    auto source=m_applet->config().group("General"),target=child->config().group("General");
    source.copyTo(&target);
    target.writeEntry("detachedModule",module);target.writeEntry("detachedParent",m_applet->id());target.sync();
    QVariant exported;
    QMetaObject::invokeMethod(m_root,"nativeSettings",Q_RETURN_ARG(QVariant,exported));
    QVariantMap values=exported.metaType()==QMetaType::fromType<QJSValue>() ? exported.value<QJSValue>().toVariant().toMap() : exported.toMap();
    values.insert("detachedModule",module);values.insert("detachedParent",m_applet->id());
    pending[child->id()]=values;
    // Handles both synchronously and asynchronously constructed QML roots.
    auto childBridge=bridges.value(child->id());
    if(childBridge && childBridge->root()) {
        QMetaObject::invokeMethod(childBridge->root(),"applyNativeSettings",Q_ARG(QVariant,QVariant(values)));
        childBridge->refresh();pending.remove(child->id());
    }
    child->configChanged();emit child->configNeedsSaving();
    refresh();fail(QString());
}

bool DesktopBridge::mergeAt(const QPointF& position) {
    if (!m_applet || !m_root || detachedModule().isEmpty()
        || m_applet->immutability()!=Plasma::Types::Mutable
        || !std::isfinite(position.x()) || !std::isfinite(position.y())) return false;
    auto parent=parentRoot();
    if (!parent || !QRectF(0,0,parent->width(),parent->height()).contains(parent->mapFromGlobal(position))) return false;
    auto applet=m_applet;
    QTimer::singleShot(0,this,[applet]{if(applet)applet->destroy();});
    return true;
}

bool DesktopBridge::prepareFreeHost(QQuickItem* item) {
    if (!m_applet || !m_root || detachedModule().isEmpty() || !item) return false;
    bool ancestor=false;
    for (auto parent=m_root->parentItem();parent;parent=parent->parentItem()) if(parent==item){ancestor=true;break;}
    if (!ancestor) return false;
    // Desktopcontainment adds Behaviors on x/y. Disable only those on this
    // child's native container; otherwise every pointer update eases behind it.
    for (auto object:item->findChildren<QObject*>()) {
        if (!object->inherits("QQuickBehavior")) continue;
        const auto property=object->property("targetProperty").value<QQmlProperty>();
        if (property.object()==item && (property.name()=="x" || property.name()=="y")) {
            object->setProperty("enabled",false);
            if (auto animation=object->property("animation").value<QObject*>()) animation->setProperty("running",false);
        }
    }
    return true;
}
void DesktopBridge::rememberFreePosition(const QPointF& position) {
    if (!m_applet || detachedModule().isEmpty() || !std::isfinite(position.x()) || !std::isfinite(position.y())) return;
    auto config=m_applet->config().group("FreePlacement");
    config.writeEntry("x",position.x());config.writeEntry("y",position.y());config.sync();
    emit m_applet->configNeedsSaving();
}
QVariantMap DesktopBridge::freePosition() const {
    if (!m_applet || detachedModule().isEmpty()) return {};
    const auto config=m_applet->config().group("FreePlacement");
    if (!config.hasKey("x") || !config.hasKey("y")) return {};
    const qreal x=config.readEntry("x",0.0),y=config.readEntry("y",0.0);
    if (!std::isfinite(x) || !std::isfinite(y)) return {};
    return {{"x",x},{"y",y}};
}

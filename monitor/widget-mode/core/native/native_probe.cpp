#include "desktopbridge.h"
#include <Plasma/Corona>
#include <Plasma/Containment>
#include <Plasma/Applet>
#include <PlasmaQuick/AppletQuickItem>
#include <QApplication>
#include <QQuickWindow>
#include <QTemporaryDir>
#include <QDir>
#include <QFile>
#include <QElapsedTimer>
#include <QThread>
#include <QJSValue>
#include <KGlobalAccel>
#include <iostream>
#include <functional>
class TestCorona : public Plasma::Corona { public: QRect screenGeometry(uint) const override { return QRect(0,0,1280,800); } };
static bool until(std::function<bool()> predicate,int ms=5000) {
    QElapsedTimer timer;timer.start();
    while(timer.elapsed()<ms){QCoreApplication::processEvents();if(predicate())return true;QThread::msleep(20);}return false;
}
static QObject* object(const QVariant& value) {return value.metaType()==QMetaType::fromType<QJSValue>()?value.value<QJSValue>().toQObject():value.value<QObject*>();}
#define CHECK(value) do {if(!(value)){std::cerr<<"Failed at line "<<__LINE__<<": "<<#value<<std::endl;return 1;}} while(0)
int main(int argc,char** argv){
    QTemporaryDir temp;
    qputenv("XDG_CONFIG_HOME",(temp.path()+"/config").toUtf8());
    qputenv("XDG_DATA_HOME",(temp.path()+"/data").toUtf8());
    qputenv("QT_QPA_PLATFORM","offscreen");
    QApplication app(argc,argv);app.setApplicationName("monitor-native-probe");
    CHECK(argc>1);
    auto dest=temp.path()+"/data/plasma/plasmoids";QDir().mkpath(dest);
    CHECK(QFile::link(QString::fromLocal8Bit(argv[1]),dest+"/local.monitor.dashboard"));
    TestCorona corona;
    corona.loadLayout(temp.path()+"/test-appletsrc");
    auto containment=corona.createContainment("org.kde.plasma.folder");CHECK(containment);
    containment->setImmutability(Plasma::Types::Mutable);
    auto desktop=PlasmaQuick::AppletQuickItem::itemForApplet(containment);CHECK(desktop);
    QQuickWindow window;window.resize(1280,800);desktop->setParentItem(window.contentItem());desktop->setSize(QSizeF(1280,800));window.show();
    CHECK(until([&]{return desktop->width()>0;}));
    auto parent=containment->createApplet("local.monitor.dashboard",{},QRectF(20,20,300,500));CHECK(parent);
    auto config=parent->config().group("General");
    config.writeEntry("countdownShortcut",QString());config.writeEntry("stopwatchShortcut",QString());
    config.writeEntry("enabledModules",QString("cpu,ram,timers"));config.sync();
    auto root=PlasmaQuick::AppletQuickItem::itemForApplet(parent);CHECK(root);root->setProperty("profileSyncEnabled",false);
    QMetaObject::invokeMethod(root,"applyNativeSettings",Q_ARG(QVariant,QVariant(QVariantMap{{"countdownShortcut",QString()},{"stopwatchShortcut",QString()}})));
    CHECK(until([&]{return root->property("nativeReady").toBool();}));
    auto bridge=root->findChild<DesktopBridge*>();CHECK(bridge);if(!bridge->error().isEmpty())std::cerr<<"Native status: "<<bridge->error().toStdString()<<std::endl;
    auto board=object(root->property("dashboardControls"));CHECK(board);
    auto timer=object(board->property("timerControls"));CHECK(timer);
    CHECK(until([&]{return !timer->property("session").toString().isEmpty();}));
    auto session=timer->property("session").toString();
    for(const auto& kind:{QString("countdown"),QString("stopwatch")}) {
        const QString sequence=kind=="countdown" ? "Meta+Ctrl+Alt+F11" : "Meta+Ctrl+Alt+F12";
        CHECK(KGlobalAccel::isGlobalShortcutAvailable(QKeySequence(sequence)));
        // Simulate a saved inactive action left behind by a previous shell.
        auto saved=new QAction;
        saved->setObjectName(QString("monitor-%1-%2").arg(parent->id()).arg(kind));
        saved->setProperty("componentName","someProducts-monitor");
        saved->setText("Saved monitor shortcut");
        KGlobalAccel::self()->setShortcut(saved,{QKeySequence(sequence)},KGlobalAccel::NoAutoloading);
        delete saved;
        CHECK(!KGlobalAccel::isGlobalShortcutAvailable(QKeySequence(sequence)));
        CHECK(bridge->setProperty((kind+"Shortcut").toUtf8(),sequence));
        CHECK(bridge->error().isEmpty());
        QAction* action=nullptr;
        for(auto candidate:bridge->findChildren<QAction*>())if(candidate->objectName().endsWith(kind))action=candidate;
        CHECK(action);CHECK(KGlobalAccel::self()->shortcut(action).contains(QKeySequence(sequence)));
        action->trigger();
        CHECK(until([&]{return timer->property("focusOpen").toBool();}));
        CHECK(timer->property("focusKind").toString()==kind);
        auto focus=qobject_cast<QWindow*>(object(timer->property("focusWindow")));CHECK(focus);
        CHECK(focus->visibility()==QWindow::FullScreen);
        timer->setProperty("focusOpen",false);
        CHECK(bridge->setProperty((kind+"Shortcut").toUtf8(),QString()));
        // Another action in the SAME component is still a genuine conflict.
        QAction foreign;
        foreign.setObjectName("monitor-probe-other-action");
        foreign.setProperty("componentName","someProducts-monitor");
        foreign.setText("Other action fixture");
        KGlobalAccel::self()->setShortcut(&foreign,{QKeySequence(sequence)},KGlobalAccel::NoAutoloading);
        CHECK(bridge->setProperty((kind+"Shortcut").toUtf8(),sequence));
        CHECK(bridge->error().startsWith("Shortcut already in use:"));
        CHECK(KGlobalAccel::self()->shortcut(&foreign).contains(QKeySequence(sequence)));
        CHECK(KGlobalAccel::self()->shortcut(action).isEmpty());
        CHECK(bridge->setProperty((kind+"Shortcut").toUtf8(),QString()));
        KGlobalAccel::self()->removeAllShortcuts(&foreign);
    }
    auto count=containment->applets().size();
    bridge->release("bad",QPointF(1100,100));CHECK(containment->applets().size()==count);
    bridge->release("cpu",root->mapToGlobal(QPointF(50,50)));CHECK(containment->applets().size()==count);
    std::cerr<<"Parent geometry "<<root->x()<<","<<root->y()<<" "<<root->width()<<"x"<<root->height()<<" immutable "<<parent->immutable()<<" module "<<bridge->detachedModule().toStdString()<<std::endl;
    bridge->release("cpu",window.mapToGlobal(QPoint(1100,100)));
    std::cerr<<"Release status "<<bridge->error().toStdString()<<" count "<<containment->applets().size()<<std::endl;
    CHECK(containment->applets().size()==count+1);
    Plasma::Applet* child=nullptr;
    for(auto candidate:containment->applets())if(candidate!=parent && candidate->config().group("General").readEntry("detachedParent",0u)==parent->id())child=candidate;
    CHECK(child);
    auto childRoot=PlasmaQuick::AppletQuickItem::itemForApplet(child);CHECK(childRoot);childRoot->setProperty("profileSyncEnabled",false);
    CHECK(until([&]{return childRoot->property("nativeReady").toBool();}));
    auto childBridge=childRoot->findChild<DesktopBridge*>();CHECK(childBridge);
    CHECK(childBridge->detachedModule()=="cpu");CHECK(childBridge->parentRoot()==root);
    CHECK(bridge->detachedModules().contains("cpu"));
    auto childBoard=object(childRoot->property("dashboardControls"));CHECK(childBoard);
    CHECK(object(childBoard->property("timerControls"))==timer);
    CHECK(timer->property("session").toString()==session);
    const auto before=childRoot->mapToGlobal(QPointF(0,0));
    childBridge->release("cpu",window.mapToGlobal(QPoint(750,500)));
    CHECK(until([&]{return (childRoot->mapToGlobal(QPointF(0,0))-before).manhattanLength()>20;}));
    // Free movement preserves the press offset and exact non-grid deltas.
    QThread::msleep(350);QCoreApplication::processEvents();
    const auto freeBefore=childRoot->mapToGlobal(QPointF(0,0));
    const auto press=childRoot->mapToGlobal(QPointF(37,23));
    const auto drop=press+QPointF(37,29);
    CHECK(QMetaObject::invokeMethod(childRoot,"beginFreeMove",Q_ARG(QVariant,QVariant(press))));
    CHECK(QMetaObject::invokeMethod(childRoot,"updateFreeMove",Q_ARG(QVariant,QVariant(drop))));
    CHECK((childRoot->mapToGlobal(QPointF(0,0))-freeBefore-QPointF(37,29)).manhattanLength()<0.01);
    CHECK(QMetaObject::invokeMethod(childRoot,"finishFreeMove",Q_ARG(QVariant,QVariant(drop)),Q_ARG(QVariant,QVariant(false))));
    CHECK((childRoot->mapToGlobal(QPointF(0,0))-freeBefore-QPointF(37,29)).manhattanLength()<0.01);
    // A cancellation restores the previous geometry.
    CHECK(QMetaObject::invokeMethod(childRoot,"beginFreeMove",Q_ARG(QVariant,QVariant(drop))));
    CHECK(QMetaObject::invokeMethod(childRoot,"updateFreeMove",Q_ARG(QVariant,QVariant(drop+QPointF(13,17)))));
    CHECK(QMetaObject::invokeMethod(childRoot,"finishFreeMove",Q_ARG(QVariant,QVariant(drop)),Q_ARG(QVariant,QVariant(true))));
    CHECK((childRoot->mapToGlobal(QPointF(0,0))-freeBefore-QPointF(37,29)).manhattanLength()<0.01);
    // KDE may grid-align its own restored layout; our per-child saved point
    // restores the exact placement after the native container is initialized.
    const auto savedPoint=childBridge->freePosition();
    CHECK(savedPoint.contains("x") && savedPoint.contains("y"));
    childRoot->parentItem()->setPosition(QPointF(640,480));
    CHECK(until([&]{return (childRoot->mapToGlobal(QPointF(0,0))-freeBefore-QPointF(37,29)).manhattanLength()<0.01;}));
    CHECK(child->config().group("FreePlacement").readEntry("x",-1.0)==savedPoint.value("x").toReal());
    childBridge->release("cpu",root->mapToGlobal(QPointF(50,50)));
    CHECK(until([&]{return child->destroyed();}));bridge->refresh();
    CHECK(!bridge->detachedModules().contains("cpu"));
    CHECK(timer->property("session").toString()==session);
    std::cout<<"Native desktop split/free-move/cancel/merge, shortcut registration and fullscreen dispatch, module routing and shared timer session passed."<<std::endl;
    return 0;
}

#include <QApplication>
#include <QQuickWindow>
#include <QTimer>
#include <QDebug>
#include <Plasma/Applet>
#include <Plasma/PluginLoader>
#include <Plasma/Corona>
#include <Plasma/Containment>
#include <PlasmaQuick/AppletQuickItem>
class ProbeCorona : public Plasma::Corona { public: QRect screenGeometry(uint) const override { return QRect(0,0,720,420); } };
int main(int argc,char**argv) {
    QApplication application(argc,argv);
    if(argc!=2) return 1;
    ProbeCorona corona;
    auto containment=corona.createContainment(QStringLiteral("org.kde.plasma.desktop"));
    if(!containment) return 2;
    auto applet=containment->createApplet(QString::fromLocal8Bit(argv[1]));
    if(!applet) return 2;
    auto item=PlasmaQuick::AppletQuickItem::itemForApplet(applet);
    if(!item) return 3;
    QQuickWindow window;
    item->setParentItem(window.contentItem());
    item->setWidth(720); item->setHeight(420);
    item->setExpanded(true); item->setPreloadFullRepresentation(true);
    window.resize(720,420); window.show();
    QTimer::singleShot(1000,&application,[&] {
        auto page=item->fullRepresentationItem();
        const bool ready=page && !applet->failedToLaunch() && item->property("folders").toList().size()==1;
        qInfo()<<"Plasma host representation ready:"<<ready;
        if(page) qInfo()<<"Page dimensions:"<<page->width()<<page->height();
        application.exit(ready?0:4);
    });
    return application.exec();
}

#include <QApplication>
#include <QAction>
#include <QProcess>
#include <QFileInfo>
#include <QDBusConnection>
#include <QObject>
#include <QSettings>
#include <QStandardPaths>
#include <QFileSystemWatcher>
#include <QDebug>
#include <KGlobalAccel>
class GestureReceiver : public QObject {
    Q_OBJECT
public:
    QString launcher;
public Q_SLOTS:
    void clicked(int x, int y, int pid, const QString &title, int fx, int fy, int fw, int fh) {
        QProcess::startDetached(launcher, {"--clicked", QString::number(x), QString::number(y),
            "--pid", QString::number(pid), "--window-title", title, "--frame", QString::number(fx), QString::number(fy), QString::number(fw), QString::number(fh)});
    }
};
int main(int argc, char **argv) {
    QApplication app(argc, argv);
    app.setApplicationName("toolkit-desktop");
    app.setApplicationDisplayName("Toolkit Desktop");
    app.setQuitOnLastWindowClosed(false);
    if (argc == 2 && QString::fromLocal8Bit(argv[1]) == "--remove-shortcuts") {
        return KGlobalAccel::cleanComponent("toolkit-desktop") ? 0 : 1;
    }
    if (argc != 2 || !QFileInfo::exists(QString::fromLocal8Bit(argv[1]))) {
        qCritical() << "Usage: toolkit-hotkeys /absolute/path/to/toolkit-desktop";
        return 1;
    }
    if (!QDBusConnection::sessionBus().registerService("org.local.ToolkitHotkeys")) return 0;
    const QString launcher = QString::fromLocal8Bit(argv[1]);
    GestureReceiver receiver;
    receiver.launcher = launcher;
    QDBusConnection::sessionBus().connect({}, "/ToolkitGesture", "org.local.ToolkitGesture", "Clicked", &receiver,
        SLOT(clicked(int,int,int,QString,int,int,int,int)));
    QAction action(&app);
    action.setObjectName("open-tools");
    action.setText("Choose a file and open Toolkit");
    auto accel = KGlobalAccel::self();
    const QString conf = QStandardPaths::writableLocation(QStandardPaths::ConfigLocation) + "/toolkit-desktop/gesture.conf";
    const auto reload = [&] {
        QSettings settings(conf, QSettings::IniFormat);
        const QKeySequence key(settings.value("Keyboard/Shortcut", "Meta+Alt+T").toString());
        const QList<QKeySequence> keys = key.isEmpty() ? QList<QKeySequence>{} : QList<QKeySequence>{key};
        accel->setDefaultShortcut(&action, keys);
        if (!accel->setShortcut(&action, keys, KGlobalAccel::NoAutoloading)) qWarning() << "Toolkit shortcut unavailable; choose another in gesture.conf";
    };
    reload();
    QFileSystemWatcher watcher({conf});
    QObject::connect(&watcher, &QFileSystemWatcher::fileChanged, [&] {
        reload(); if (!watcher.files().contains(conf)) watcher.addPath(conf);
    });
    QObject::connect(&action, &QAction::triggered, [&] {
        if (!QProcess::startDetached(launcher, {"--radial"})) qWarning() << "Could not open Toolkit";
    });
    return app.exec();
}
#include "hotkeys.moc"

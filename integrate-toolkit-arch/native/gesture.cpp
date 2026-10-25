// SPDX-License-Identifier: GPL-2.0-or-later
#include <effect/effect.h>
#include <effect/effecthandler.h>
#include <effect/effectwindow.h>
#include <config-kwin.h>
#include <KAboutData>
#include <KConfigGroup>
#include <QAction>
#include <QDBusConnection>
#include <QDBusMessage>
#include <QFileSystemWatcher>
#include <QStandardPaths>
#include <QQmlExtensionPlugin>
#include <qqml.h>

class ToolkitGesture : public QObject {
    Q_OBJECT
public:
    explicit ToolkitGesture(QObject *parent = nullptr) : QObject(parent) {
        if (KAboutData::applicationData().version() != KWIN_VERSION_STRING) {
            qWarning("Toolkit gesture needs rebuilding for the running KWin version");
            return;
        }
        reload();
        const auto file = QStandardPaths::writableLocation(QStandardPaths::ConfigLocation) + "/toolkit-desktop/gesture.conf";
        watcher.addPath(file);
        connect(&watcher, &QFileSystemWatcher::fileChanged, this, [this, file] {
            reload();
            if (!watcher.files().contains(file)) watcher.addPath(file);
        });
    }
private:
    QFileSystemWatcher watcher;
    QAction *action = nullptr;
    void reload() {
        delete action; action = nullptr;
        auto config = KSharedConfig::openConfig("toolkit-desktop/gesture.conf", KConfig::SimpleConfig);
        config->reparseConfiguration();
        KConfigGroup group(config, "Gesture");
        if (!group.readEntry("Enabled", true)) return;
        Qt::KeyboardModifiers modifiers = Qt::NoModifier;
        const QStringList names = group.readEntry("Modifiers", QString("Meta+Alt")).split('+');
        for (const auto &name : names) {
            if (name.compare("Meta", Qt::CaseInsensitive) == 0 || name.compare("Super", Qt::CaseInsensitive) == 0) modifiers |= Qt::MetaModifier;
            else if (name.compare("Alt", Qt::CaseInsensitive) == 0) modifiers |= Qt::AltModifier;
            else if (name.compare("Ctrl", Qt::CaseInsensitive) == 0) modifiers |= Qt::ControlModifier;
            else if (name.compare("Shift", Qt::CaseInsensitive) == 0) modifiers |= Qt::ShiftModifier;
            else return; // Invalid config never becomes an unmodified global grab.
        }
        if (modifiers == Qt::NoModifier) return;
        const QString button = group.readEntry("Button", QString("Left"));
        Qt::MouseButton mouse = button == "Left" ? Qt::LeftButton : button == "Right" ? Qt::RightButton : button == "Middle" ? Qt::MiddleButton : Qt::NoButton;
        if (mouse == Qt::NoButton) return;
        action = new QAction(this);
        connect(action, &QAction::triggered, this, [] {
            const QPoint point = KWin::effects->cursorPos().toPoint();
            const auto windows = KWin::effects->stackingOrder();
            KWin::EffectWindow *target = nullptr;
            for (auto it = windows.crbegin(); it != windows.crend(); ++it) {
                if ((*it)->isDeleted() || !(*it)->isOnCurrentDesktop() || (*it)->isMinimized()) continue;
                if ((*it)->frameGeometry().contains(point)) { target = *it; break; }
            }
            if (!target) return;
            const QString kind = target->windowClass();
            if (!kind.contains("dolphin", Qt::CaseInsensitive) && !kind.contains("plasmashell", Qt::CaseInsensitive)) return;
            auto message = QDBusMessage::createSignal("/ToolkitGesture", "org.local.ToolkitGesture", "Clicked");
            const auto frame = target->clientGeometry();
            message.setArguments({point.x(), point.y(), int(target->pid()), target->caption(),
                int(frame.x()), int(frame.y()), int(frame.width()), int(frame.height())});
            QDBusConnection::sessionBus().send(message);
        });
        KWin::effects->registerPointerShortcut(modifiers, mouse, action);
    }
};
class ToolkitGesturePlugin : public QQmlExtensionPlugin {
    Q_OBJECT
    Q_PLUGIN_METADATA(IID QQmlExtensionInterface_iid)
public:
    void registerTypes(const char *uri) override {
        qmlRegisterType<ToolkitGesture>(uri, 1, 0, "Gesture");
    }
};
#include "gesture.moc"

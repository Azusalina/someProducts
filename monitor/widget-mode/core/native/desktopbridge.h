#pragma once
#include <QObject>
#include <QPointer>
#include <QQuickItem>
#include <QAction>
#include <QTimer>
#include <QtQml/qqmlregistration.h>
namespace Plasma { class Applet; }
class DesktopBridge : public QObject {
    Q_OBJECT
    QML_ELEMENT
    Q_PROPERTY(QQuickItem* root READ root WRITE setRoot NOTIFY topologyChanged)
    Q_PROPERTY(QString detachedModule READ detachedModule NOTIFY topologyChanged)
    Q_PROPERTY(QStringList detachedModules READ detachedModules NOTIFY topologyChanged)
    Q_PROPERTY(QQuickItem* parentRoot READ parentRoot NOTIFY topologyChanged)
    Q_PROPERTY(QString countdownShortcut MEMBER countdownShortcut NOTIFY shortcutsChanged)
    Q_PROPERTY(QString stopwatchShortcut MEMBER stopwatchShortcut NOTIFY shortcutsChanged)
    Q_PROPERTY(QString error READ error NOTIFY errorChanged)
public:
    explicit DesktopBridge(QObject* parent=nullptr);
    ~DesktopBridge() override;
    QQuickItem* root() const { return m_root; }
    void setRoot(QQuickItem*);
    QString detachedModule() const;
    QStringList detachedModules() const;
    QQuickItem* parentRoot() const;
    QString error() const { return m_error; }
    QString countdownShortcut, stopwatchShortcut;
    Q_INVOKABLE void release(const QString& module, const QPointF& globalPosition);
    Q_INVOKABLE void refresh();
    Q_INVOKABLE bool prepareFreeHost(QQuickItem* item);
    Q_INVOKABLE void rememberFreePosition(const QPointF& position);
    Q_INVOKABLE QVariantMap freePosition() const;
    Q_INVOKABLE bool mergeAt(const QPointF& globalPosition);
signals:
    void initialized();
    void topologyChanged();
    void shortcutsChanged();
    void errorChanged();
    void focusRequested(const QString& kind);
private:
    void configureShortcuts();
    void fail(const QString&);
    QPointer<QQuickItem> m_root;
    QPointer<Plasma::Applet> m_applet;
    QAction *m_countdown, *m_stopwatch;
    QTimer m_timer;
    QString m_error, m_topology;
    bool m_initialized=false;
};

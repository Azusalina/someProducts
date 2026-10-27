#pragma once
#include <QAbstractListModel>
#include <QFileSystemWatcher>
#include <QFileInfo>
#include <QtQml/qqmlregistration.h>
class Directory : public QAbstractListModel {
    Q_OBJECT
    QML_ELEMENT
    Q_PROPERTY(QString folder READ folder WRITE setFolder NOTIFY folderChanged)
    Q_PROPERTY(QString home READ home CONSTANT)
    Q_PROPERTY(QString error READ error NOTIFY errorChanged)
public:
    enum Role { Name = Qt::UserRole+1, Path, IsDir, Size, Modified };
    explicit Directory(QObject* parent=nullptr);
    QString folder() const { return m_folder; }
    QString home() const;
    QString error() const { return m_error; }
    void setFolder(const QString& folder);
    int rowCount(const QModelIndex& parent={}) const override;
    QVariant data(const QModelIndex&, int role) const override;
    QHash<int,QByteArray> roleNames() const override;
    Q_INVOKABLE void refresh();
    Q_INVOKABLE QString parentFolder(const QString&) const;
    Q_INVOKABLE bool open(const QString& path);
    Q_INVOKABLE bool terminal(const QString& folder, bool tui=false);
    Q_INVOKABLE bool gui(const QString& folder);
signals:
    void folderChanged();
    void errorChanged();
private:
    bool fail(const QString&);
    QString m_folder, m_error;
    QFileInfoList m_entries;
    QFileSystemWatcher m_watcher;
};

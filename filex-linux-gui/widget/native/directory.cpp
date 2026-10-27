#include "directory.h"
#include <QDir>
#include <QDesktopServices>
#include <QUrl>
#include <QProcess>
#include <QStandardPaths>
#include <QDateTime>
#include <QTimer>
Directory::Directory(QObject* parent) : QAbstractListModel(parent) {
    connect(&m_watcher,&QFileSystemWatcher::directoryChanged,this,[this]{ refresh(); });
}
QString Directory::home() const { return QDir::homePath(); }
void Directory::setFolder(const QString& path) {
    const auto absolute=QFileInfo(path).absoluteFilePath();
    if (m_folder==absolute) return;
    if (!m_watcher.directories().isEmpty()) m_watcher.removePaths(m_watcher.directories());
    m_folder=absolute;
    if (QFileInfo(m_folder).isDir()) m_watcher.addPath(m_folder);
    refresh(); emit folderChanged();
}
int Directory::rowCount(const QModelIndex& p) const { return p.isValid()?0:m_entries.size(); }
QVariant Directory::data(const QModelIndex& i,int role) const {
    if (!i.isValid() || i.row()<0 || i.row()>=m_entries.size()) return {};
    const auto& f=m_entries[i.row()];
    switch(role) {
        case Name:return f.fileName(); case Path:return f.absoluteFilePath();
        case IsDir:return f.isDir(); case Size:return f.size();
        case Modified:return f.lastModified().toString(Qt::ISODate); default:return {};
    }
}
QHash<int,QByteArray> Directory::roleNames() const { return {{Name,"fileName"},{Path,"filePath"},{IsDir,"isDir"},{Size,"fileSize"},{Modified,"modified"}}; }
bool Directory::fail(const QString& message) { m_error=message; emit errorChanged(); return false; }
void Directory::refresh() {
    beginResetModel();
    QDir dir(m_folder);
    m_entries=dir.entryInfoList(QDir::AllEntries|QDir::NoDotAndDotDot,QDir::DirsFirst|QDir::Name|QDir::IgnoreCase);
    endResetModel();
    m_error=QFileInfo(m_folder).isReadable()?QString():QStringLiteral("Folder is unavailable or unreadable"); emit errorChanged();
}
QString Directory::parentFolder(const QString& path) const { QDir d(path); d.cdUp(); return d.absolutePath(); }
bool Directory::open(const QString& path) { return QDesktopServices::openUrl(QUrl::fromLocalFile(path)) || fail("Cannot open file"); }
bool Directory::gui(const QString& folder) {
    auto program=QStandardPaths::findExecutable("filex-gui");
    if(program.isEmpty()) program=QDir::homePath()+"/.local/bin/filex-gui";
    return QProcess::startDetached(program,{folder},folder) || fail("Install filex-gui first");
}
bool Directory::terminal(const QString& folder, bool tui) {
    if(!QFileInfo(folder).isDir()) return fail("Hover a folder first");
    QStringList args;
    QString program;
    const auto custom=qEnvironmentVariable("TERMINAL");
    if(!custom.isEmpty()) {
        args=QProcess::splitCommand(custom);
        if(!args.isEmpty()) { program=QStandardPaths::findExecutable(args.takeFirst()); }
    }
    if(program.isEmpty()) {
        for(const auto& name:{"konsole","foot","kitty","alacritty","gnome-terminal","xterm"}) {
            program=QStandardPaths::findExecutable(name); if(!program.isEmpty()) break;
        }
    }
    if(program.isEmpty()) return fail("No terminal emulator found");
    const auto base=QFileInfo(program).fileName();
    if(base=="konsole") args << "--workdir" << folder;
    if(tui) {
        auto filex=QStandardPaths::findExecutable("filex");
        if(filex.isEmpty()) return fail("Install the filex TUI command first");
        if(base=="gnome-terminal" || base=="kgx") args<<"--";
        else if(base!="foot" && base!="kitty") args<<"-e";
        args<<filex<<folder;
    }
    return QProcess::startDetached(program,args,folder) || fail("Cannot start terminal");
}

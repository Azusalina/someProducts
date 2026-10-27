#include "directory.h"
#include <QCoreApplication>
#include <QTemporaryDir>
#include <QDir>
#include <QFile>
#include <cstdio>
#include <QElapsedTimer>
#include <QThread>
int main(int argc,char** argv) {
    QCoreApplication app(argc,argv);
    QTemporaryDir temp;
    if(!temp.isValid()) return 1;
    QDir(temp.path()).mkdir("folder with spaces");
    QFile f(temp.filePath("photo ' sample.png")); if(!f.open(QIODevice::WriteOnly)) return 2; f.write("test"); f.close();
    Directory d; d.setFolder(temp.path());
    if(d.rowCount()!=2 || !d.data(d.index(0),Directory::IsDir).toBool()) return 3;
    if(d.data(d.index(1),Directory::Name).toString()!="photo ' sample.png") return 4;
    if(d.parentFolder(temp.filePath("folder with spaces"))!=temp.path()) return 5;
    QFile second(temp.filePath("new")); second.open(QIODevice::WriteOnly); second.close(); d.refresh();
    if(d.rowCount()!=3) return 6;
    d.setFolder(temp.filePath("missing")); if(d.rowCount()!=0 || d.error().isEmpty()) return 7;
    const auto terminalScript=temp.filePath("terminal-probe");
    QFile stub(terminalScript);
    if(!stub.open(QIODevice::WriteOnly)) return 8;
    stub.write("#!/bin/sh\npwd > \"$(dirname \"$0\")/terminal-cwd\"\n");
    stub.close();
    stub.setPermissions(QFileDevice::ReadOwner|QFileDevice::WriteOwner|QFileDevice::ExeOwner);
    const auto previous=qgetenv("TERMINAL");
    qputenv("TERMINAL",terminalScript.toUtf8());
    const auto target=temp.filePath("folder with spaces");
    if(!d.terminal(target)) return 9;
    qputenv("TERMINAL",previous);
    QElapsedTimer wait; wait.start();
    QFile cwd(temp.filePath("terminal-cwd"));
    while(!cwd.exists() && wait.elapsed()<2000) QThread::msleep(10);
    if(!cwd.open(QIODevice::ReadOnly) || QString::fromUtf8(cwd.readAll()).trimmed()!=target) return 10;
    std::puts("Widget directory model: navigation, filenames, refresh and missing-folder checks passed");
}

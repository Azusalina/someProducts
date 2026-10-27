# filex widget

## What is it?

KDE Plasma 6 / Wayland 的透明桌面导航部件，持续显示可用鼠标操作的横向目录列。原生 Qt/QML 模型使用文件系统通知；空闲时不轮询、不运行 GUI/TUI 子进程。实现与验证说明见 [description.md](description.md)。

## How to use

需要 Plasma 6、Qt 6 QML/Quick 开发包、CMake、C++17 编译器、`kpackagetool6`。在本目录执行：

```bash
./scripts/install.sh
```

桌面「添加部件」搜索 `filex` 并添加。默认从主目录开始；点击文件夹向右展开，点击文件用系统默认程序打开，滚轮浏览目录，底部横向滚动条浏览已展开的列。`↑` 切换上级，`~` 返回主目录；导航根目录会保存在该部件实例配置中。

点击部件使其获得键盘焦点后，将鼠标悬停在文件夹上并按 `x`，打开以该文件夹为工作目录的新终端。也会尝试在悬停时为部件内部取得焦点；Wayland 的桌面窗口焦点仍由合成器控制。终端优先使用 `$TERMINAL`，否则自动检测 Konsole 等程序。

`GUI` 打开该文件夹的 FileX 图形窗口（先运行上级目录的 `../scripts/install.sh`）；`TUI` 在终端打开 FileX（需要 PATH 中的 `filex` 命令）。移除：

```bash
./scripts/install.sh --remove
```

安装脚本不会重启 Plasma，也不会自动修改桌面布局。

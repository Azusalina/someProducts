# filex-linux-gui

## What is it?

filex 的 Linux 图形界面版本：与 [fileX](../fileX/README.md) 相同的横向目录树、快捷键和 `filex.conf`，以 Rust 软件渲染窗口呈现（无 GPU 上下文、无 GUI 工具包），空闲时零 CPU，常驻内存约 23–29 MB。架构、验证结果和限制见 [description.md](description.md)。

## How to use

需要 Rust / Cargo 1.88+，以及与本目录并列的 `../fileX`（模型和文件操作直接从其源码编译）。安装命令、应用搜索入口和图标（只写入 `~/.local`）：

```bash
./scripts/install.sh
```

之后可在应用搜索（Kickoff / KRunner）输入 filex 打开，或在终端运行：

```bash
filex --gui                 # 以当前目录为根，GUI 脱离终端运行
filex --gui ~/Documents
filex-gui ~/Documents --config ~/.config/fileX/filex.conf
```

代码更新后用 `./scripts/install.sh --rebuild` 重新编译安装；`./scripts/install.sh --remove` 移除命令、启动项和图标（保留配置）。

全部 fileX 快捷键照常可用（`?` 查看）；另有 `Ctrl+=` / `Ctrl+-` / `Ctrl+0` 缩放、`F12` 切换明暗主题（写入配置）。鼠标：单击选择、双击等同 Enter、右键打开方式、中键标记、滚轮平移，点击顶部路径段即设为根。按住文件或文件夹拖出窗口，可放进浏览器上传框、聊天窗口或文件管理器（作为附件 / 复制）；拖动已标记项目时一次带出全部标记项（需 Wayland 会话）。终端程序（Vim、`@` 命令、Git）在终端模拟器窗口中运行。

可选的 `[gui]` 配置（TUI 会忽略该区段）：

```toml
[gui]
theme = "auto"          # auto / dark / light
zoom = 1.0
decorations = "client"  # client / system
language = "en"         # en / zh（提示信息语言）
terminal = ["konsole", "-e"]  # 默认自动检测
animations = true
font_size = 13.5
```

# win-filex

## What is it?

filex 的 Windows 11 原生 Rust TUI 版本，与 `../fileX` 并列维护。横向连接目录树，支持双栏镜像、搜索、预览、创建、重命名、复制、移动和回收站删除。CMD、PowerShell 与 Git Bash 可用同一个 `.exe`。

Windows 接口、限制和验证记录见 [description.md](description.md)。

## How to use

建议在 Windows Terminal 中使用 CMD、Windows PowerShell 5.1／PowerShell 7 或 Git Bash。构建需要 Rust 1.88+（推荐 rustup 的 MSVC 工具链）以及 Visual Studio C++ Build Tools；使用已构建的 `bin/filex.exe` 无需安装 Rust、Python、Node.js 或 WSL。

已提供交叉编译的 x64 `bin/filex.exe` 和 `dist/win-filex-windows-x64.zip`。将整个文件夹／压缩包复制到 Windows 解压后，可先运行 `filex.cmd` 或 `filex.ps1`；无需重新构建。安装预构建版使用 `scripts\install.ps1 -SkipBuild`。

需要在 Windows 自行构建时，在 PowerShell 中进入本文件夹：

```powershell
.\scripts\build.ps1 -Test
.\filex.ps1
# 可选：安装当前用户的 filex 命令，无需管理员权限
.\scripts\install.ps1 -SkipBuild
```

脚本执行策略阻止运行时，可以对这次脚本调用使用 `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install.ps1 -SkipBuild`，无需永久修改系统策略。安装位置为 `%LOCALAPPDATA%\Programs\win-filex`，加入用户 PATH，并为 PowerShell 5.1／7 注册启动函数；`-NoProfile` 跳过 profile 注册。新终端中运行 `filex`，不传目录就以当前目录为根。未安装时：

| Shell | 启动 |
| --- | --- |
| PowerShell | `& 'C:\path\win-filex\filex.ps1'` |
| CMD | `C:\path\win-filex\filex.cmd`；批处理内使用 `call` |
| Git Bash | `source /c/path/win-filex/shell/filex.bash`，然后 `filex`；可将 source 行加入 `~/.bashrc` |

Git Bash 在 Windows Terminal 中直接运行；传统 mintty 优先自动使用随 Git for Windows 提供的 `winpty`。WSL Bash 请使用 `../fileX` 的 Linux 版本。直接执行 `.exe` 也能浏览，但 `x` 会进入子 CMD；使用对应 shell 包装脚本，`x` 才能切换原终端目录。

- `↑/↓` 同层选择并首尾循环；`→` 展开／进入子级，`←` 返回父级；保持其他分支展开。`Enter` 展开目录或为文件选择打开方式。
- `v` 开关镜像双栏，`Tab` 切换侧；右侧左右键反转。`c/m` 复制／移动，双栏预填另一侧位置，目标已存在则拒绝覆盖。
- `Ctrl+F` 或 `/` 搜索；`.` 显示点文件及 Windows Hidden 属性项目。`h` 收起当前目录，`E/C` 展开／收起全部，`f` 当前目录设为根。
- `Ctrl+N`／`a` 新建文件，`Ctrl+Shift+N`／`A` 新建目录；`r` 重命名。Windows Terminal 若拦截组合键，使用 `a/A` 或修改终端绑定。
- `Delete/D` 移到 Windows 回收站，再按 `Enter` 确认，`Esc` 取消。`q` 信息面板，`[/]` 调整宽度；显示文件前几行、UTC 创建／修改时间、大小与链接信息。
- `y`／`Ctrl+Alt+C` 复制绝对路径到 Windows 剪贴板；`Ctrl+V` 在 filex 输入框粘贴内部已复制路径。`x` 退出至所选目录（选中文件使用父目录），`Q`／`Ctrl+C` 退出。
- `F5`／`Ctrl+F5`／`Ctrl+R` 刷新，`,` 重读配置，`?` 帮助。`--print-tree` 输出文本树，可重定向；`--ascii` 兼容缺少线框字形的字体。

主配置：`%APPDATA%\win-filex\filex.conf`。安装保留现有配置；无配置也能使用内置默认值。`filex --init-config` 创建示例，`filex --config 'C:\path\custom.conf'` 指定其他配置。TOML 可设置快捷键、文件扩展名／目录名颜色、排序、隐藏项、树缓存、双栏、面板宽度、预览行数及打开程序。Windows 路径建议使用 TOML 单引号，例如 `command = ['C:\Program Files\VSCodium\VSCodium.exe', '--', '{path}']`。

默认使用系统关联；`.py` 默认记事本。可在 `open_defaults` 为 `.py` 设 `python`、`.r` 设 `rscript`、`.sh` 设 `bash`、`.ps1` 设 `powershell`，脚本也可在 Enter 菜单中显式运行。对应程序需另行安装并加入 PATH。内置预览只读取 UTF-8 文本。

卸载：运行安装目录的 `scripts\uninstall.ps1`；默认保留配置，附加 `-RemoveConfig` 才移除配置。Git Bash 的 source 行由用户从 `~/.bashrc` 移除。便携使用无需系统安装，删除文件夹即可。

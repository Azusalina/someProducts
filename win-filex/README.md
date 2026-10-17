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
- `v` 开关镜像双栏，`Tab` 切换侧；右侧左右键反转。`Space` 标记多个文件／目录，显示亮洋红方框；`c/m` 后方向键选目标目录、Enter 执行，双栏自动切到另一侧。展开目录末尾的 `+` 可选中按 Enter 新建目标目录，或直接按 `+`；创建后再 Enter 执行。Esc 取消待执行操作，再按一次清空标记。已有普通文件需再次 Enter 确认替换；目录／链接冲突或整批重名则拒绝操作。
- `Ctrl+F` 或 `/` 搜索；`.` 显示点文件及 Windows Hidden 属性项目。`h` 收起当前目录，`E/C` 展开／收起全部，`f` 当前目录设为根。
- `Ctrl+N`／`a` 新建文件，`Ctrl+Shift+N`／`A` 新建目录；`r` 重命名当前项目；输入框支持左右/Home/End 移动、在光标处插入与 Backspace/Delete。Windows Terminal 若拦截组合键，使用 `a/A` 或修改终端绑定。
- `Delete/D` 将当前项目或 Space 标记的整批项目移到 Windows 回收站，再按 `Enter` 确认，`Esc` 取消。`q` 信息面板，`[/]` 调整宽度；显示文件前几行、UTC 创建／修改时间、大小与链接信息。
- `y`／`Ctrl+Alt+C` 复制绝对路径到 Windows 剪贴板；`Ctrl+V` 在 filex 输入框粘贴内部已复制路径。`x` 退出至所选目录（选中文件使用父目录），`Q`／`Ctrl+C` 退出。
- `F5`／`Ctrl+F5`／`Ctrl+R` 刷新，`,` 重读配置，`?` 帮助。`--print-tree` 输出文本树，可重定向；`--ascii` 兼容缺少线框字形的字体。

主配置：`%APPDATA%\win-filex\filex.conf`。安装保留现有配置；无配置也能使用内置默认值。`filex --init-config` 创建示例，`filex --config 'C:\path\custom.conf'` 指定其他配置。TOML 可设置快捷键、文件扩展名／目录名颜色、排序、隐藏项、树缓存、双栏、面板宽度、预览行数及打开程序。Windows 路径建议使用 TOML 单引号，例如 `command = ['C:\Program Files\VSCodium\VSCodium.exe', '--', '{path}']`。

默认使用系统关联；`.py` 默认记事本。可在 `open_defaults` 为 `.py` 设 `python`、`.r` 设 `rscript`、`.sh` 设 `bash`、`.ps1` 设 `powershell`，脚本也可在 Enter 菜单中显式运行。对应程序需另行安装并加入 PATH。内置预览只读取 UTF-8 文本。

卸载：运行安装目录的 `scripts\uninstall.ps1`；默认保留配置，附加 `-RemoveConfig` 才移除配置。Git Bash 的 source 行由用户从 `~/.bashrc` 移除。便携使用无需系统安装，删除文件夹即可。

ZIP：在 `.zip` 上 Enter 选择 **Bash unzip / 解压 ZIP**（或 `o` 使用默认项），通过 Bash 调用 `unzip`，解压到压缩包旁全新的 `*.unpacked.随机后缀` 目录；原 ZIP 保留，不覆盖既有文件。需 Bash、unzip 和 Python 3（仅用于提取前校验 ZIP 路径／链接）；Windows 可用 Git Bash，并把 Python 加入 PATH。ZIP 内含越界路径或符号链接时会拒绝解压；失败保留部分输出目录以供检查。

多选方框默认为亮洋红、加粗显示，当前光标所在项继续反色；可在 `[colors]` 设置 `mark_color = "#FF55FF"`。TTY 使用 ASCII 方框，16 色终端映射到亮洋红。

打开菜单会隐藏不适用的专用程序：Python 对 `.py/.pyw`、Rscript 对 `.r`、Bash 对 `.sh/.bash`、unzip 对 `.zip`、Toolkit Markdown 对 `.md/.markdown`；Windows PowerShell 执行仅对 `.ps1` 显示。普通编辑器／系统关联仍通用。自定义 opener 可设置 `extensions = [".foo", ".bar"]`（大小写不敏感）；未设置或空列表表示通用。内置专用项即使旧配置没有 extensions 也会自动限制。

目录顺序可在配置中设置；置顶／沉底优先于“目录在前”，列表顺序也会保留：

```toml
[order]
top = ["index.html"]
bottom = ["node_modules", "__pycache__"]

[directory_order."~/Documents/site"]
top = ["index.html", "package.json"]
bottom = ["<other-folders>", "node_modules"]
```

`directory_order` 可用实际绝对目录路径（Windows 使用 TOML 单引号，例如 `[directory_order.'C:\work\site']`），或用目录名匹配所有同名目录；绝对路径规则优先，只作用于该目录直接子项。省略字段继承全局，显式 `[]` 清空继承。修改后按 `,` 重读配置。

Git 仓库展开后，树节点箭头附加状态标记并着色：`?` 未跟踪、`M` 未暂存修改、`S` 已暂存、`!` 冲突、`C` 已跟踪且干净但未配置上游、`P` 干净且与本地记录的上游一致、`↑/↓/↕` 分别为领先／落后／分叉（TTY 用 `^/v/D`）。文件名颜色保留，目录汇总子项状态，底部说明当前项目状态。颜色用于提示，字符标记在无色模式也保留。

Git 后台只读扫描，不自动 commit/push/fetch；`P` 不代表已实时查询服务器。F5／Ctrl+F5 更新本地快照；没有 Git 或查询失败时保持普通箭头。`[git] enabled = false` 可关闭，`max_entries` 默认 4000，每个窗口至多缓存 4 个已展开仓库；超出扫描范围不猜测状态。

排序列表中的 `"<other-folders>"` 匹配未在当前有效 top/bottom 中点名的所有直接子目录（不含目录软链接）。上述示例将 index.html、package.json 置顶，普通文件居中，其余子目录沉底，node_modules 最后；也可把该标记放入 top。显式名称优先，同组目录沿用 sort，隐藏目录需开启显示。

复制／移动：按 `c`／`m` 后可用光标选目标目录，或直接选目标文件进行替换；按 `t` 可输入目标地址，Enter 提交。单项支持目录或完整的新文件路径，多选要求已有目标目录；相对路径以源所在目录为基准，支持 `~`。已有普通文件会逐一提示，再按 Enter 确认覆盖，Esc 返回选择状态；全部覆盖确认完成后才开始本批操作。目录／链接冲突不覆盖。`g`／Ctrl+L 仍可输入目录并切换视图，再 Enter 执行。

选中文件夹后按 `!`，输入 `npm start` 等命令并 Enter，即以该目录为工作目录后台运行；Esc 取消输入。启动后显示 PID 和日志路径，关闭 filex 不停止命令。`[keys] run_background = "!"` 可改键。Linux 使用 `$SHELL -c`（默认 `/bin/sh`），日志在 `$XDG_STATE_HOME/filex/jobs` 或 `~/.local/state/filex/jobs`；Windows 使用 CMD，日志在 `%LOCALAPPDATA%\win-filex\jobs`。标准输入关闭，适用于不需要交互输入的命令；退出后仍可从日志看输出，依赖与 PATH 沿用启动 filex 的环境。

Linux 后台任务可用 `kill -- -PID` 停止对应进程组（PID 使用 filex 启动提示中的值）。日志需自行清理；服务能否启动仍取决于该项目依赖和命令自身。

`G` 打开当前选中项所属仓库的 Git 菜单：一键 `add ALL → commit → push`、只暂存当前文件／目录、提交全部已暂存内容、单独推送。菜单选择后输入提交信息（需要时），再 Enter 确认；Esc 取消。组合流程暂存整个仓库的新增／修改／删除，包含当前视图外的文件；只暂存当前项不受 Space 多选影响。执行时使用当前终端，支持认证和签名提示，完成或失败后 Enter 返回；失败即停止后续步骤，已完成步骤保留。不自动 pull、force push、设置上游或初始化仓库，push 遵循 Git 的 remote/refspec 配置；首次推送可先在终端设置 upstream。`[keys] git_menu = "G"` 可修改。

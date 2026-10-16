# win-filex 技术说明

## 范围与来源

从相邻 `fileX` 1.5.0 Rust TUI 独立复制并适配，不修改 Linux 版、不包含已放弃的 GUI。目录树、同层导航、双栏、搜索、操作确认和有界缓存沿用现有实现；Windows 系统调用由新模块承担。源代码不依赖 `../fileX`，复制本文件夹即可构建。

## 平台接口

- `src/files_windows.rs`：使用 `MoveFileExW` flags=0 原子拒绝覆盖；跨卷移动才采用复制成功后删除源。新建文件使用 create_new，目录逐层创建；Windows 设备保留名、分隔符、控制字符、尾随空格／点被拒绝。
- 回收站使用原生 COM `IFileOperation`，设置 `FOFX_RECYCLEONDELETE`、`FOFX_EARLYFAILURE`、撤销记录和禁止永久删除时的提示标记；不将回收站失败转成 fs 永久删除。不解析链接的目标后再删除。网络路径、可移动介质、策略或容量问题可能导致回收失败，界面显示错误。参见 [Microsoft SetOperationFlags](https://learn.microsoft.com/en-us/windows/win32/api/shobjidl_core/nf-shobjidl_core-ifileoperation-setoperationflags)。
- 系统打开方式由 `ShellExecuteW` 处理，不将选中文件名拼接成 cmd／PowerShell 命令字符串。其他 opener 使用程序和参数数组。Windows PATH 查询支持 exe/com/cmd/bat；批处理的特殊参数规则由 Rust 标准库处理，参见 [Rust Command](https://doc.rust-lang.org/std/process/struct.Command.html)。
- 路径内部使用 Windows Unicode PathBuf／UTF-16 Win32 API；剪贴板使用 CF_UNICODETEXT。向 shell 传递目录为 UTF-8 单行，不使用 Linux 的 NUL 结束协议。Shell 打开、剪贴板及退出路径移除 `\\?\` 前缀，保留普通 UNC 路径。
- `src/platform.rs`：GetFileInformationByHandle 查询卷标识、文件索引和硬链接数量；无法读取时不生成猜测的硬链接路径。Hidden 属性与以点开头的名称统一受隐藏开关控制。目录联接及其他 reparse point 不自动递归，避免循环或越出扫描范围。
- 符号链接复制保留链接，不复制目标内容；创建链接可能要求 Windows Developer Mode 或相应权限。未知 reparse point 复制明确失败。硬链接扫描有条目／深度／结果上限，只扫描当前根目录。
- `terminal_profile.rs` 通过 Crossterm 使用 Windows console，关闭 Linux 的 KDGETMODE／sigaction 分支、Kitty 增强键、tmux 和 Konsole 控制。`terminal_host_windows.rs` 明确禁用 Linux 宿主操作。终端编辑器临时恢复正常控制台，退出后恢复 TUI。
- `input_windows.rs` 提供可选的英文键盘请求及退出恢复；Windows Terminal／输入法策略可能忽略请求，因此 Windows 默认关闭 auto_english。

## Shell 与配置

`filex.ps1`、`filex.cmd`、`shell/filex.bash` 都以调用者当前目录为默认根。包装脚本设置 FILEX_ROOT 与临时 FILEX_CWD_FILE，应用正常退出且写出有效路径时才改变调用 shell 的目录，随后清理文件。PowerShell 恢复之前的环境值；CMD 隔离环境并临时使用 UTF-8 code page，Git Bash 通过 cygpath 转换路径，传统 mintty 可用 winpty 提供原生 console。

安装脚本只写当前用户安装目录、配置目录、用户 PATH，以及明确标记的 PowerShell profile 区块；不需要管理员权限。升级不覆盖用户配置，卸载只移除自己的 profile 区块，其他 profile 内容保留。用户策略限制脚本执行时应使用一次性的进程级策略，安装脚本不更改机器执行策略。

Windows 默认 truecolor；16 色模式受各宿主调色板影响，无法保证与 Linux VT 完全相同。`NO_COLOR` 优先。主题仍包含源版本的文件扩展名及目录名颜色规则。普通文件系统操作、预览和树浏览不需要 Python、Node.js、Git Bash、WSL、tmux、gio 或 Wayland。

可选 Toolkit Markdown opener 保留在配置中：需要相邻 toolkit 文件夹、其 Node.js 依赖及 PATH 中的 Firefox，`scripts/open_markdown.mjs` 启动本地渲染服务。Windows 默认 Markdown 使用系统关联，因此未安装 toolkit 时仍可打开文件。此可选流程尚未在 Windows 验证。

## 构建与验证

Windows 原生建议 MSVC：`scripts/build.ps1 -Test` 执行锁定依赖的 cargo test 和 release build，再复制到 bin/filex.exe。`src/windows_tests.rs` 包含 Windows 文件名、中文及符号路径、新建／复制／移动防覆盖、目录自复制防护、元数据预览、NTFS 硬链接、Hidden 属性、原生 opener 配置及普通／UNC 路径转换测试。破坏性回收站和桌面应用打开不由自动测试触发。

Linux 主机上的原共用逻辑测试不代表 Windows native 测试已运行。Windows 11 的实际交互、CMD/PowerShell/mintty 返回目录、IME、系统剪贴板、回收站及内存峰值仍需在 Windows 主机验证。此前 Linux 的 <15 MB 实测不能套用为 Windows 内存保证。


### 2026-10-15 本机验证结果

- Linux 共用逻辑 29 项测试通过；Windows 专用测试和平台相关共用测试已交叉编译为测试 exe，尚未在 Windows 执行。
- x86_64-pc-windows-gnu 编译检查通过；Linux 上的 LLVM-MinGW 链接使用与之配套的 x86_64-pc-windows-gnullvm target，release exe 已生成，约 921 KiB。PE 导入检查仅依赖 Windows 系统／UCRT DLL，无额外 MinGW 或 LLVM runtime DLL 要求。
- 5 个 PowerShell 脚本通过 PowerShell 7 语法解析，Bash 启动脚本通过 bash -n。PowerShell 包装脚本另用 Linux 模拟可执行文件验证中文／空格／引号路径的退出目录传递、失败时不跳目录及环境恢复；这不是 Windows 原生运行验证。
- 可携带构建：bin/filex.exe；压缩包：dist/win-filex-windows-x64.zip，包含程序、配置示例、启动脚本与完整源码。scripts/package.ps1 可在 Windows 重建压缩包。
- 本机没有 Windows 11 运行环境，因此以上不等于实际 Windows 桌面测试通过。原生运行、回收站、剪贴板、mintty 和内存仍待 Windows 实测。

交叉编译环境（仅开发机）：Rust 1.99、LLVM-MinGW 20261006 UCRT，工具安装在用户缓存中，不修改 Linux fileX、系统 Rust 或 shell profile。工具来源：[rustup](https://rustup.rs/)、[LLVM-MinGW](https://github.com/mstorsjo/llvm-mingw)、[PowerShell](https://github.com/PowerShell/PowerShell)。Windows Terminal 的宿主与 shell 区别见 [Microsoft Windows Terminal](https://learn.microsoft.com/en-us/windows/terminal/)。


## 2026-10-16 光标目标、多选、输入光标与 ZIP

- `Ui.pending` 保存源快照与复制／移动类型；Space 多选保存在有界显示／搜索路径集合中，`[*]` 为绘制标记。重叠父子源按路径层级去重；批内目标名称重复、已有目标及自身内部复制先统一预检，再逐项操作。运行中权限或 I/O 错误仍可能出现部分成功，保留未完成来源并报告数量，不宣称事务回滚。成功项目取消标记；回收站同样支持多选，重命名仍只处理光标项目。
- 目标模式在已展开目录下附加虚拟 `+` 节点，使用当前树和镜像导航；不创建名为 `+` 的实际文件，也不隐藏真实同名文件。选中 `+` 时 Enter 提示新目录名，创建后选中真实目录；再 Enter 执行。Esc 或成功退出模式会移除虚拟节点，保持其他展开分支。用户主动创建的目录不会因取消复制／移动而删除。
- `src/edit.rs` 为所有输入框提供 UTF-8 字符边界光标；Left/Right、Home/End、Backspace/Delete 与光标处插入／粘贴共用实现。字符组合与终端字体仍依赖 Unicode width，未实现复杂 grapheme 编辑。
- ZIP opener 使用独立参数数组 `bash -- {filex}/scripts/unzip.sh {path}`，不将文件名拼接进 shell 代码。Python 标准库先校验 central directory，拒绝绝对／驱动器／越界路径、特殊设备和链接条目；Bash 随后执行 unzip 校验与 -n 解压。新建随机输出目录，原 ZIP 不删除。Python 只为此可选解压功能所需，普通浏览／复制／移动无需 Python。
- 两个产品独立保留平台接口，共用的模型、输入与 TUI 逻辑同步更新。Windows 只能在本机交叉编译，不能据此宣称 Windows 原生交互测试通过。

验证：两版各 33 项 Rust 共用测试在 Linux 通过；fileX 的 64 项 Python／PTY 测试通过，包括新建 `+` 目录后的多选复制、中文名称中间编辑、TTY 与镜像双栏回归。Windows release 和测试 exe 已交叉编译；未运行 Windows 11 原生测试。记录：`operation-validation.json`。


## 2026-10-16 多选方框与打开方式筛选

多选项使用三行彩色矩形，布局为边框预留行距和列宽，镜像栏复用相同裁切规则；当前光标保留反色，多选边框加粗且不随其他分支变暗。`colors.mark_color` 默认 #FF55FF。ASCII／无色终端保留形状。`Opener.extensions` 限制菜单可见性，并在 open_command 再次验证，防止通过错误默认配置对不相关扩展名执行解释器。旧配置继续继承内置扩展名限制，自定义程序可以显式声明适用范围。

附加验证：两版各 35 项 Rust 共用测试在 Linux 通过，包含矩形行距、颜色配置及专用扩展名限制；真实 PTY 验证 ASCII 方框与亮洋红 ANSI 输出，以及 .txt 隐藏解释器、.py 显示 Python。Windows release 与测试 exe 再次交叉编译，尚无 Windows 原生验证。


## 2026-10-16 目录置顶／沉底与 Git 箭头

`order.top/bottom` 与 `directory_order` 按名称精确排序，置顶可跨过 directories_first；普通项继续按已有 name/size/modified 排序，沉底项最后显示。绝对路径（读取配置时规范化）优先于目录名规则。按列表索引排序，缓存上限选择使用同一排序键。重读配置后沿用既有刷新逻辑。

`src/git_status.rs` 在后台读取稳定的 porcelain v2 -z、ls-files -z 与 cached-upstream 对比，不解析面向人的 git 文本输出。rename 的旧路径单独消费，文件名空格／Unicode／换行不改变字段切分。状态仅保留有界映射，逐项读取未跟踪文件以避免把被忽略的子项误标为未跟踪，最多 4 个仓库；单个子进程最多 512 KiB 输出、1.5 秒执行预算，超限或失败不显示猜测标记。每次展开目录发现其最近 .git 仓库（含 worktree .git 文件）；后台完成通过原有 200ms 输入轮询唤醒一次重绘，无持续的逐帧 Git 调用。关闭分支不会主动扫描其内部嵌套仓库。

关闭 optional locks 与 fsmonitor，不联网、不执行 Git hooks 或外部 diff/textconv。F5 清理完成快照后按已展开分支重新查询。目录以冲突 > 未暂存修改 > 暂存 > 未跟踪 > 分叉/落后/领先 > 干净状态汇总；已配置上游时，文件只在其内容与 cached upstream 有差异时显示领先／落后／分叉，不给其他未改变文件错误标记“未推送”。上游状态为本地缓存，不能证明服务器当前状态。忽略项或超出映射上限的项目保留普通箭头。

来源：[Git status porcelain v2](https://git-scm.com/docs/git-status)、[Git ls-files](https://git-scm.com/docs/git-ls-files)。Windows 仍以交叉编译验证为界，未在 Windows 11 原生实测。

验证：两版各 38 项 Rust 测试在 Linux 通过；fileX 全量 66 项 Python／PTY 回归通过，最后的未跟踪忽略项改进另经 Git 单元测试及 3 项光标／菜单／Git 终端测试复核。临时 Git 仓库验证本地状态、Unicode 重命名、忽略项、上游四种同步状态、输出条目上限及索引字节不变。Windows release 与测试 exe 已交叉编译，未执行 Windows 原生测试。

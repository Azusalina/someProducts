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

### 未声明子目录的排序选择器

`top` / `bottom` 支持保留标记 `"<other-folders>"`，选择没有出现在当前有效 top/bottom 名称列表中的所有直接子目录；显式名称先匹配，再匹配目录组。组内沿用 sort 排序，其他普通项仍遵循 directories_first/sort。符号链接不归入目录组，隐藏目录在开启显示时参与；规则不递归。标记同时存在两组时 top 优先，与名称重复时的既有优先级一致。特殊标记为保留名称，不能用来按字面排序同名普通文件。Rust 和兼容 Python 排序共用语义，无新增逐项文件系统查询。

本次验证：每个项目 39 项 Rust 测试通过；新增未声明目录选择器覆盖目录范围、显式项优先及真实子项顺序；Linux Python 回归 67 项通过（配置生成检查在 release 构建完成后复测）。Windows release 和测试程序交叉编译通过，未做 Windows 实机运行验证。

### 复制／移动的显式覆盖与路径输入

当前传输模式新增 `t` 地址输入，单项可指定文件路径以同时改名，多项必须指定目录。光标亦可直接选择已有普通文件作为替换目标。整批先校验，每个已有文件再 Enter 确认；Esc 取消本次提交，保留待操作项。目录与符号链接不替换，拒绝自身及同 inode 的硬链接。覆盖采用在目标旁新建临时目录、完整复制、重命名替换的方式，不先截断旧内容；移动在替换成功后删除源。目标文件的其他硬链接仍指向旧内容。不是整批事务：运行中 I/O 失败时保留已完成结果并报告进度，剩余项待操作；移动若替换成功但源删除失败，会报告并保留源。大文件替换需要额外磁盘空间。Linux 使用 rename，Windows 使用 MoveFileExW(REPLACE_EXISTING)，Windows 实机行为待验证。旧历史中的不覆盖说明已由本节替代；底层默认 transfer 仍禁止覆盖，仅已确认的 TUI 传输使用替换接口。

覆盖功能验证：两个产品各 42 项 Rust 测试通过；69 项 Linux Python 回归（其中旧双栏冲突提示断言更新为确认提示后单独复测通过）。新增 PTY 验证按 Enter 前内容不变、Esc 取消、输入完整目标路径移动改名、直接光标选文件覆盖、多选最后一项取消时整批未开始写入。Windows release／测试程序已交叉编译，未做 Windows 实机运行。

### 文件夹后台命令

`run_background` 默认快捷键 `!`；只对当前选中文件夹运行，普通文件拒绝，复制／移动目标选择期间不可触发。用户明确输入 shell 命令后 Enter 执行，支持 shell 管道与重定向；不自动执行目录内脚本，不加载交互式 shell 配置。stdin=null，stdout/stderr 直接写独立日志，不占用终端或在内存缓存输出。Unix setsid，Windows DETACHED_PROCESS + CREATE_NEW_PROCESS_GROUP；启动失败显示原因，等待线程回收子进程并在日志追加退出状态。退出 filex 后子进程继续，若退出时任务仍在运行，其后不会追加监控退出状态，但进程输出仍写日志。日志不自动删除；日志目录见 README。后台任务自身的内存不计入 filex，长期服务需自行停止和管理。

后台命令验证：两个产品分别 43 项 Rust 测试通过；71 项 Linux Python 回归全通过，含目录带引号／中文、正确 cwd、输出日志、退出 filex 后完成、取消与普通文件拒绝、自定义热键。实际 Visualize-sheet 的只读树输出确认 launch.sh 在第一项；未启动该项目服务。Windows release 和测试程序交叉编译通过，尚未 Windows 实机验证。

### Git 写操作快捷菜单

`git_actions.rs` 提供显式 Git 操作，独立于只读状态缓存。选中项解析 worktree 根（支持嵌套仓库与 .git 文件）；目录软链接以链接本身所在仓库为准。命令用参数数组直接执行，提交信息不经 shell，暂存 pathspec 使用 literal。清除 GIT_DIR/WORK_TREE/INDEX_FILE/COMMON_DIR/PREFIX 等仓库覆盖变量，按用户选中项操作。组合流程为仓库根 git add -A -- .、git commit -m message、git push；任一步非零即停止，包括无内容可提交。独立 commit 不隐式 add，独立 push 不隐式 commit。执行遵循用户 Git hooks、签名与远程配置。命令在当前终端前台运行，接管期间退出 raw/alternate screen，等待 Enter 后恢复树并刷新 Git 快照；传输目标选择模式中不允许触发。不会自动回滚成功的 add/commit，也不会自动重试失败的 push。

Git 菜单验证：两项目各 45 项 Rust 测试、73 项 Linux Python 回归全通过。真实 PTY 在临时仓库与本地 bare remote 验证组合流程推送、确认取消不改 index/HEAD、仅暂存所选文件、提交信息含中文／引号／shell 字面量、pre-commit 失败跳过 push、返回后新建文件。测试未对用户工作仓库执行 add/commit/push，未访问外部远程服务。Windows release 和测试程序交叉编译通过，未做 Windows 实机与真实远程认证验证。

### 目录内 + 作为传输放入位置（2026-10-17）

复制／移动状态中，虚拟 + 节点的 path 是其所在目录，Enter 直接提交传输到该目录，不再弹出新建文件夹输入框。+ 键通过 Browser.target() 获取目录并提交；A（或用户自定义 new_folder 键）创建子目录、选中新目录后 Enter 放入。支持单项与多选，成功后清理两侧虚拟节点，复制保留源、移动移除源，目录布局和传输冲突确认沿用既有逻辑。此行为替代旧版“+ 创建目标文件夹”的说明；t 手动路径输入不变。

此改动验证：两产品各 46 项 Rust 测试、74 项 Linux Python 回归通过。新增真实 PTY 验证多选后选中 + Enter 直接复制、+ 键移动、源保留／移除；既有测试改用 A 新建子目录并继续放入，重命名与覆盖确认回归通过。Linux release 已重建，Windows release 与测试程序交叉编译通过；Windows 实机验证未执行。


### 2026-10-18：可编辑顺序、分组树、记忆排除项

移除双栏及其镜像坐标、左右反转和 Tab 切换；v 改为 grouped/classic，旧 dual_pane / toggle_dual / switch_pane 配置读取时忽略。单树保留源选择、跨目录多选、传输待操作状态及 t 地址输入。

ordering.rs 实现 Unicode 名称上的 % 通配（无正则依赖），sequence 首次匹配、legacy top/bottom 的精确名称例外、= 前缀字面量及 <other-folders>。匹配结果进入已有扫描堆和最终排序键，所以显示上限选取与最终显示一致。完整顺序编辑仅列出当前父目录已加载的实际节点；虚拟 + 不进入持久列表，写为 =字面名称 与末尾 %。grouped 物理分列优先，序列分别作用于目录列／文件列，classic 可以看到混合顺序。

分组 Layout 使用迭代后序计算子树矩形，目录子树纵向堆叠，直属文件列在完整目录子树右侧；两组在父目录同一水平线上连接。高度取两组最大值，标记方框沿用最小三行间距；边线和祖先路径高亮使用相同分组连接。不额外扫描磁盘，节点上限仍生效。展开深树会增加宽度，可自动跟随或 H/L 平移。

z/Z 将精确路径持久化到 browser.excluded_paths。扫描和搜索都跳过排除目录，独立于系统点文件显示；不修改源文件。隐藏项若被外部重命名或移动，旧路径规则仍保留，Z 可移除。显式从命令行／g 把某个目录设为根，仍可进入该目录；规则限制的是其父目录中的显示。

配置写回采用 [toml_edit](https://docs.rs/toml_edit/0.23.10/toml_edit/) 保留注释和其他键，解析并跟随主配置软链接，在同目录创建临时文件、校验原文件未在保存中改变后原子替换。拒绝写入非法 TOML；出错时不应用内存排序／隐藏，提示错误。不是跨进程的配置编辑锁；其他程序同时写同一字段时应先重载。依赖新增 toml_edit，仅执行偏好保存时解析编辑文档。

本次验证：两项目各 49 项共享 Rust 测试通过；74 项 Linux Python / PTY 回归通过，移除过时镜像测试并以分组布局、排序保存、隐藏／恢复、单树传输替代。最终构建另复测偏好 PTY 和配置兼容测试。覆盖 % 前后缀／多段／Unicode／字面量、完整序列、原子写回注释和软链接、每层分组的标签与线段互不穿越、排除项不参与点文件切换及搜索、重启记忆、窄终端和 tmux。Windows release／测试程序交叉编译，不代表 Windows 实机验证。

最终 Linux release 的 8 项真实 PTY 内存场景全部低于 15 MB，最高 VmHWM 为 7.27 MB；原始记录和二进制 SHA256 见 fileX/memory-validation.json。仅计应用进程，Windows、外部程序及终端不在此测量内。

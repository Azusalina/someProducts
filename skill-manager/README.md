# Skill Manager

## What is it?

运行于 `127.0.0.1` 的 Codex / Claude 本地技能与插件管理器：统一查找、搜索、阅读核心 Markdown、收藏、移除及恢复，并通过网页终端执行安装命令。玻璃界面默认不透明度 20%，支持浅色和深色。

扫描范围、实现细节和验证记录见 [description.md](description.md)。

## How to use

需要 Linux、Node.js 22+、npm、Bash；插件安装与卸载需要对应的 `codex` 或 `claude` CLI。

```bash
cd /home/a/Documents/someProducts/skill-manager
npm install
npm start
```

打开 <http://127.0.0.1:4380>。在左侧筛选来源或收藏，用 `Ctrl/Cmd K` 搜索；点击项目后阅读 `SKILL.md`、README 及关联文档，可切换原文、复制内容。星标收藏会持久保存。

勾选列表中的复选框可多选；“全选当前结果”只选择当前筛选结果，切换筛选会保留已选项并提示隐藏的选择数量。支持 Shift 点击连续选择。批量栏可统一收藏、取消收藏和移除；移除确认页可逐项调整安装入口与插件卸载范围，确认后依次执行，支持查看逐项结果、命令输出及停止后续操作。

“添加”打开网页终端：粘贴技能安装命令，或填写 Codex / Claude 插件标识以生成命令；确认工作目录后点击“运行命令”。输出实时显示，支持发送输入与停止，结束后自动重新扫描。命令以当前账户权限执行；依赖 TTY 的安装器请在系统终端运行。

“移除”会显示目标位置。独立技能、本地插件及失效链接进入同级 `.skill-manager-trash`，可在“已移除项目”恢复；捆绑技能通过所属插件管理，已注册或缓存插件使用对应 CLI 卸载。插件卸载会先在终端展示命令，点击运行后执行。

侧栏调整玻璃不透明度；顶部“深色模式 / 浅色模式”按钮切换外观，也可在设置中选择；选择会自动保存。“扫描位置与设置”可添加目录，每行一个。手机端通过顶部齿轮调整不透明度和恢复项目。设置与收藏保存在本目录 `.data/`。

安装为登录自动启动的用户服务：

```bash
npm run service:install
npm run service:status
```

停用并移除服务（保留技能、插件和设置）：

```bash
npm run service:remove
```

前台运行时可用 `Ctrl C` 停止。修改端口使用 `PORT=4381 npm start`；安装服务时使用 `python3 scripts/service.py install --port 4381`。服务始终只监听 `127.0.0.1`。支持 `CODEX_HOME`、`CLAUDE_CONFIG_DIR` 及 `SKILL_MANAGER_DATA`（数据目录）的环境变量配置；自启动服务安装时保留前两个变量。

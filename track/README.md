## What is it?

track 是本地行动轨迹档案工具：Overland 在 iPhone 上自动采集位置，默认回到同一局域网后同步至 PC，也支持可选临时 HTTPS 中转；通过离线白底地图查看、缩放和回放足迹。初始视角聚焦香港岛，界面支持 English、简体中文和繁體中文，默认英文。

PC 端 v0.1.0 已实现。架构、轨迹计算规则、测试结果及限制见 [description.md](description.md)。

## How to use

前提：Python 3.11+、OpenSSL，以及已安装 Overland GPS Tracker 的 iPhone。运行不需要 Node.js 或 pip 依赖。Windows 可使用 Git for Windows 提供的 OpenSSL；程序会检查常见安装位置。

在本目录运行：

```bash
python3 track.py --open
```

Linux 也可运行 `./start.sh`；Windows 双击 `start.bat`，或在终端运行 `py -3 track.py --open`。PC 浏览器入口为 **http://127.0.0.1:4188**。无法自动选择局域网地址时，在启动命令后加 `--lan-ip <电脑的局域网IPv4地址>`。

首次连接：

1. 让 iPhone 与 PC 处于同一局域网，在 PC 网页点击 **Connect iPhone**。
2. 用 iPhone 扫描第一个二维码，在 Safari 点击“允许”下载证书描述文件；立即打开设置首页的 **Profile Downloaded／已下载描述文件**，安装 **Track Local Sync**。下载后超过 8 分钟仍未安装，iOS 会删除待安装文件，需重新下载。安装后到“通用 → 关于本机 → 证书信任设置”开启 **Track Local CA** 的完全信任。可对照 PC 面板里的证书指纹。
3. 扫描第二个二维码，配置 Overland 的 Server URL、Access token 和 Device ID；也可展开 **Manual configuration** 手动填写。添加更多手机时使用不同的 Device ID。
4. Overland 设置 **Logging Mode = All Data**、**Tracking Enabled = On**、“始终”定位和精确位置。采样选项见连接面板；初次连续性测试可采用 Standard、10 m 精度及关闭自动暂停，之后根据实际轨迹和耗电调整。
5. 在 Overland 点击 **Send Now**。PC 显示最近同步时间和定位点后，即可浏览足迹。外出时暂存于手机，回家后补传；自动补传时机受 iOS 调度影响，必要时再次点击 Send Now。

默认端口：PC 本机界面 `4188`；局域网 HTTPS 上传 `4189`；仅下载公开证书的局域网 HTTP 服务 `8080`。手机需要访问后两个端口；防火墙、访客网络隔离或 VPN 的局域网策略可能影响连接。网络更换后重新启动 Track，并用连接面板更新 Overland 地址；保留原数据目录时无需重新生成根证书。长期使用可为 PC 保留固定 DHCP 地址。

当 VPN 或热点隔离阻止手机访问 PC IP 时，可选择 **HTTPS 中转**：上传流量经过 Cloudflare，数据库仍保存在 PC；无需在 iPhone 安装 Track 证书。安装 [cloudflared](https://developers.cloudflare.com/tunnel/downloads/) 后，运行 `python3 track.py --relay --open`（Windows：`py -3 track.py --relay --open`）。中转模式会保存，之后普通启动也会自动恢复；Track 管理中转进程并在失败后重试，无需另开终端。也可直接在 **Connect iPhone** 面板点击 **Generate temporary sync address／生成临时同步地址**，等待成功后扫描下方 Overland 二维码。已有地址时，按钮会显示 **Generate a new sync address／生成新的同步地址**；生成新地址会结束旧中转，需要重新配置手机。显示 **Relay ready** 后，刷新网页并打开 **Connect iPhone**，扫描新的 Overland 二维码；必要时在 Overland 手动填写新 Server URL 和原 Access token，点击 Send Now。中转重启会更换域名，须更新手机配置；连接面板每 5 秒更新，重连时隐藏临时二维码，不会回退为手机无法访问的本地地址。此方式不保证长期在线或固定域名，无需关闭现有 VPN。使用 `--no-relay` 可清除保存的中转选择并恢复局域网模式。固定域名方案和配置限制见 [description.md](description.md)。

界面右上角的 **System／Light／Dark** 选择跟随系统、浅色或深色；偏好保存在浏览器中，地图与回放同步切换。

界面操作：选择日期或 **All footprints**；拖动地图、滚轮或加减按钮缩放；**Island view** 回到港岛视角，**Fit footprints** 适配所选记录。点击播放、拖动进度条回放；按设备和定位精度筛选。单日可保存备注；**Export trace** 导出当前筛选后的 GPX／GeoJSON；**Back up** 下载含原始上传和备注的 SQLite 备份。**Explore a sample** 只预览虚构路线，不写入档案。

档案默认存放于 Linux 的 `~/.local/share/track`（遵循 `XDG_DATA_HOME`），或 Windows 的 `%LOCALAPPDATA%\Track`；可用 `--data-dir <目录>` 指定。上传确认后，手机会清理已发送队列，因此应定期备份 PC 档案。

手动启动时，按 `Ctrl+C` 停止服务。若希望 Linux 登录后自动启动，可运行 `python3 scripts/service.py`；使用前先停止手动运行的实例。停止已安装服务用 `systemctl --user stop track.service`，恢复用 `systemctl --user start track.service`。卸载自启动用 `python3 scripts/service.py --uninstall`，数据与证书会保留。Windows 目前使用手动启动，不配置自启动。

停止手机采集可在 Overland 关闭 Tracking Enabled。卸载采集器前先同步手机队列；不再使用本地同步时，可在 iPhone 的“VPN 与设备管理”中移除 **Track Local Sync** 描述文件。

当前 Linux 机器已启用 `track.service` 用户登录自启动；登录后打开本机网页即可。服务自动恢复中转，但临时域名更换后仍需更新 Overland。关机或注销期间不提供同步服务，系统重启后的实际恢复仍需设备验证。

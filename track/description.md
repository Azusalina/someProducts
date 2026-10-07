# track v0.1.0：实现与维护

更新日期：2026-10-06。PC 接收端及离线界面已实现；iPhone 真机首次上传、全天连续性和实际耗电仍待验证。下面的旧方案记录保留为开发历史，不代表当前功能状态。

## 当前范围

- 用户已安装 Overland；iPhone 全天自动采集，回家后通过同一局域网补传。
- PC 使用 Python 标准库、SQLite 和本地浏览器；没有云端、地图瓦片、账户系统或外部地理编码请求。
- 白底足迹图，初始港岛视角；可拖动、缩放、适配记录，以及按日期和设备回放。视角不会限制接收范围，也不会删除港岛以外的坐标。
- 默认 English，支持简体中文和繁體中文；语言偏好保存在浏览器 localStorage。
- 支持单日备注、GPX／GeoJSON 导出和 SQLite 一致性备份；示例路线仅在内存中预览。

启动、手机连接和卸载说明见 [README.md](README.md)。

## 架构与访问边界

```text
iPhone / Overland
    ├─ 离线时：手机待发送队列
    └─ 同一局域网，HTTPS + Bearer token
          ↓ POST /api/overland
    Python 接收端 → 整批校验 → SQLite 事务 → 提交成功 → {"result":"ok"}
                                       ↓
                         本机浏览器：白底图 / 回放 / 备注 / 导出
```

三个独立监听器：

| 默认端口 | 地址 | 用途 |
| --- | --- | --- |
| 4188 / HTTP | 127.0.0.1 | 管理界面及本机 API；校验 Host、Origin，写入备注需要进程级 CSRF token |
| 4189 / HTTPS | 所选 PC 局域网 IPv4 | 只接收经过 Bearer token 认证的 Overland JSON 上传 |
| 8080 / HTTP | 所选 PC 局域网 IPv4 | 公开证书说明页和 `track.mobileconfig` 下载；不提供轨迹、令牌或私钥 |

接口和页面使用 `Cache-Control: no-store`；界面资源、字体回退和二维码生成均本地处理。脚本、样式和连接受 CSP 限制；静态资源按固定列表提供。

Linux 地址探测优先选择已启用的物理网络接口，跳过常见 Docker、虚拟和点对点接口；候选不唯一时需要 `--lan-ip`。Windows 采用主机 IPv4 候选，可能同样需要明确指定地址。程序不更改 VPN、防火墙或系统路由。

## 接收、去重与备份

请求必须是包含 `locations` 数组的 JSON 对象；上限为 8 MiB、10,000 个事件。支持 Point Feature 和 geometry 为 null 的元数据 Feature；拒绝非法坐标、无时区的时间戳、非有限数值以及不支持的几何类型。`current`、`trip` 和未用于绘图的字段随原始批次保存。

整批校验后，在一个 SQLite `BEGIN IMMEDIATE` 事务内保存批次与事件，使用 WAL 和 `synchronous=FULL`。只有提交成功才返回 Overland 的成功响应；校验失败、磁盘写入失败或事务异常不确认。写入中途失败会回滚整批。

- `batches`：原始请求字节、内容哈希、接收时间和事件数。
- `events`：原始 Feature JSON、事件哈希，以及供查询的时间、坐标、精度、设备和运动字段。
- `notes`：按香港日期保存备注。
- `state`：最近一次成功接收时间，包括有效空批次。

批次用原始字节的 SHA-256 去重；事件按规范化内容的 SHA-256 去重，仅排除会随重组批次变化的 `locations_in_payload`。不同内容仍保留为不同事件。原始重试批次也会保留；界面不将它们重复计为位置点。

位置查询每页 5,000 点，使用事件 ID 游标和读取开始时的最大 ID 固定范围；客户端读完所有页后按采集时间排序，支持迟到、乱序的历史补传。日期以香港时间 UTC+8 分组，不依赖 PC 时区。

**Back up** 使用 SQLite backup API 生成一致性快照，包含原始批次、事件和备注。它不包含 `config.json`、根证书或私钥；恢复到同一信任身份需要另行保存完整数据目录。手动复制完整目录应先停止服务。恢复数据库时，先停止服务并将现有数据库及其 `-wal`／`-shm` 文件一并移至保留目录，再放入备份快照，避免将旧 WAL 与恢复文件混用。

Linux 数据目录默认权限为 `0700`，数据库、令牌配置和私钥为 `0600`；Windows 的访问权限由目录 ACL 管理。没有自动清理或删除历史轨迹功能。

## 轨迹显示与统计规则

原始上传始终保留。以下规则只用于显示、统计和当前筛选下的导出：

1. 按采集时间排序，不同设备、不同香港日期分开绘制。
2. 默认精度筛选为 ≤100 m；可选 ≤30 m 或包含全部。已知低精度点或精度未知／负值在默认筛选下排除，并切断前后连接。
3. 时间不前进、间隔超过 10 分钟或推算速度超过 80 m/s 时，开启新线段，不跨越缺点连线。
4. 距离小于 `max(5, min(15, (当前精度 + 前点精度) / 8))` 米视为抖动；静止位置最长每 120 秒保留一个显示点。
5. 距离使用球面 Haversine 公式；移动时长仅累计通过抖动阈值的连续点间隔，属于估算值。

点数指标为所选记录的原始位置点数量；质量提示另列显示点、精度筛除点和断点数。微小位移的抑制也会减少显示点，但不计入“精度筛除点”。回放按显示点顺序展开，可选 30／60／120 秒完成，屏幕显示对应的真实采集时间；它不是按实际经过时间等速播放。

地图使用 Canvas 和 Web Mercator 投影，比例尺补偿所处纬度的投影变形。初始港岛视角是矩形视窗，不是行政边界，也不进行道路匹配。重叠路线通过叠加自然加深；不宣称准确识别“首次走过的道路”或开拓距离。港岛以外的数据可用 Fit footprints 查看；跨日期变更线、极区和大量长期记录尚未专门验证。

导出保留各个断开的线段、设备、时间和备注；GeoJSON 单独位置点保留为 Point。导出受日期、设备及精度筛选影响；原始信息以数据库备份为准。

## 证书与连接维护

初次启动创建本地 CA、服务器证书、持久访问令牌和证书描述文件。CA 与令牌保存在数据目录；服务器证书绑定所选 IP，并在地址更换或到期前一周自动重新签发。正常重启和更换 IP 使用同一 CA；Overland 地址仍需更新，不会自动发现 PC 新地址。数据目录被删除或替换时，可能需要重新安装证书并配置令牌。

证书二维码只包含公开下载地址；Overland 配置二维码包含接收地址、访问令牌和设备设置，只在本机管理页面生成。HTTP 8080 不传输令牌或轨迹。iOS 手动安装证书后仍需显式开启完全信任；详见 [Apple 证书信任说明](https://support.apple.com/en-us/102390)。此描述文件仅含根证书，没有 MDM 或 VPN 配置。

下载描述文件后，首先在设置首页选择 Profile Downloaded／已下载描述文件并安装。未安装的下载会在 8 分钟后自动删除；若没有待安装入口，应先重新下载，而不是寻找已经安装的描述文件。详见 [Apple 描述文件安装说明](https://support.apple.com/en-us/102400)。

遇到无法连接时，依次检查手机与 PC 的网络可达性、地址、证书信任、访问令牌和端口规则。当前服务绑定具体局域网地址；联网接口或地址改变后应重启。不要通过删除数据目录来处理普通连接问题。若端口已被其他实例占用，应停止重复实例或通过 CLI 指定不同端口。

## 文件与开发

| 路径 | 职责 |
| --- | --- |
| `track.py`、`start.sh`、`start.bat` | CLI、网络地址选择、启动和信号退出 |
| `trackapp/protocol.py` | Overland 批次校验和事件规范化 |
| `trackapp/store.py` | SQLite 事务、查询、备注和备份 |
| `trackapp/tls.py` | 证书、令牌、数据目录和描述文件 |
| `trackapp/server.py` | 三个监听器、认证和本机 API |
| `trackapp/sample.py` | 仅供预览的虚构港岛路线 |
| `web/index.html`、`web/style.css` | 离线响应式界面 |
| `web/app.js`、`web/map.js`、`web/geometry.js` | 交互、绘图、清理、回放和导出 |
| `web/i18n.js` | English／简体／繁體文本和语言偏好 |
| `web/vendor/qrcode.js`、`qrcode.LICENSE` | 本地二维码生成器及 MIT 许可 |
| `scripts/service.py` | 可选 Linux systemd 用户自启动及卸载 |
| `tests/` | 接收／存储、轨迹语义和浏览器验证 |

运行无需安装 Node.js 或第三方 Python 包。开发检查使用 Node.js、Chromium 和 Playwright Core：

```bash
npm ci
npm test
npm run test:browser
```

`npm test` 在 Linux 下调用 Python 单元测试和 Node 轨迹测试；可分别运行 `python3 -m unittest discover -s tests -p 'test_*.py'` 和 `node --test tests/geometry.test.mjs`。浏览器测试默认使用 `/usr/bin/chromium`，可通过 `CHROMIUM_PATH` 指定其他路径。浏览器测试目前按 Linux 编写，启动测试子进程使用 `python3`。

浏览器测试使用临时数据库、根证书和回环监听器；生成的截图、虚构数据导出、SQLite 快照和结果记录保存在被忽略的 `.test-results/`，不会向用户实际档案导入测试位置。

二维码生成器为 `qrcode-generator` 2.0.4，源自 [上游项目](https://github.com/kazuhikoarase/qrcode-generator)，下载时验证了 npm 包的 SHA-512 完整性。随产品保存源文件及 MIT 许可；运行时不访问 npm 或 CDN。

## 验证结果与未完成项

2026-10-06 上一轮实现已通过：

- Python 16 项：整批校验与回滚、并发重试去重、迟到上传、香港日期分组、分页范围、原始元数据保存、备注和快照完整性、HTTPS 与认证、写入失败不确认，以及管理端访问限制。
- Node 7 项：乱序点排序、合理步行距离、长时间缺点与异常跳跃、GPS 抖动、精度筛选、跨设备／跨日断开及 GPX／GeoJSON 语义。
- 浏览器 13 组检查：空档案、隔离示例、三语和语言保持、连接面板与二维码、默认证书端口的浏览器访问及描述文件下载、临时中转模式切换与三语提示、协议上传和自动刷新、缩放拖动、回放、持久备注、下载、390／320 px 布局，以及无外部请求和脚本错误。SIGTERM 后测试服务正常退出。
- Linux systemd 用户服务模板通过静态校验；没有安装或启用该自启动服务，也没有进行重启测试。

当前 PC 使用 Linux；Windows 启动器和 OpenSSL 查找路径已编写，但未在 Windows 真机运行。上一轮停止时关闭了临时启动的生产服务，本轮恢复时自动选择当前局域网地址并重新签发服务器证书。

本轮收尾只修改文档，并检查运行状态：本机管理 API 和局域网证书下载均返回 HTTP 200；使用原 CA 校验的 HTTPS 连接成功，无令牌上传返回 HTTP 401；OpenSSL 核验服务器证书与当前 IP 匹配。真实档案检查为 0 个位置点、0 个批次、尚无同步时间；未向其中提交测试位置。README 的两个内容标题及文档相对链接检查通过。

仍待用户 iPhone 完成首次真实上传。还未验证全天后台连续性、静止后恢复、手机重启、回家自动补传、存储压力与实际耗电；现有测试通过不代表这些设备行为已经验证。没有街道底图、照片标注、自动行程识别、双向同步或云端档案存储。可选临时中转使用第三方网络服务。

用户在本轮选择“手机测试稍后进行”；PC 服务保持运行，手机测试按此安排暂留后续。没有安装系统自启动或修改网络策略。

## 保留的初期文档

以下保留实施前的可行性分析和当时 README 原文，以免丢失来源、假设及历史决策。

<details>
<summary>初期可行性分析（实施前状态）</summary>

# track：需求与可行性

核查日期：2026-10-06。当前状态：需求已确认，推荐架构待选定；未实现、未进行 iPhone 真机验证。

## 已确认的需求

- iPhone 全天自动记录行动轨迹，不依赖每天手动开始、结束。
- 当前只有 Linux／Windows PC，没有可用的 Mac／Xcode。
- 允许手机与 PC 本地同步，形成长期行动轨迹档案。
- 参考 [PlainWalk](https://apps.apple.com/us/app/plainwalk-draw-your-own-map/id6800746478) 的白底地图、累计足迹和历史回放。

“全天自动”指开启后持续采集，不等于每秒必有一个精确位置。采样精度、间隔、耗电与后台恢复需要单独验证。

## 技术边界

纯网页／PWA 不适合承担全天后台采集。[W3C Geolocation](https://www.w3.org/TR/geolocation/#request-a-position) 将位置更新限定于活跃、可见的文档，并要求安全上下文。添加到主屏幕不能替代原生后台定位。

原生 iOS App 可使用 Core Location。[Apple 的授权说明](https://developer.apple.com/documentation/corelocation/requesting-authorization-to-use-location-services) 区分 When in Use 与 Always；后者允许系统为部分定位事件重新启动 App。标准连续定位、显著位置变化、访问和区域监测的启动及恢复行为不同，不能把某一种服务的保证套用到全部采集方式。

后台记录也受权限、GPS 信号和系统调度影响。关机、关闭定位、人工终止 App 或系统限制都可能影响轨迹完整性；某些低功耗定位事件可唤醒 App，但不保证补回期间的精细轨迹。[Apple 后台定位说明](https://developer.apple.com/documentation/corelocation/handling-location-updates-in-the-background)、[Apple 工程师对显著位置变化唤醒的说明](https://developer.apple.com/forums/thread/818370)。

## 推荐方案：现成 iOS 采集器 + 自建 PC 本地 Web

推荐先采用 [Overland GPS Tracker](https://apps.apple.com/us/app/overland-gps-tracker/id1292426766)。其公开说明支持后台采集、离线保存，以及向用户指定的服务批量上传；可直接安装，无需为这一步准备 Mac 或自行签名。[项目主页](https://overland.p3k.app/)。这只是方案推荐，尚未配置或验证用户手机。

数据流程：

```text
iPhone 原生采集 → 手机待发送队列
                       ↓ PC 可达时批量传输
                PC 接收服务 → SQLite → 本地浏览器
```

PC 端不需要 Apple 平台工具。拟采用 Python 本地服务、SQLite 数据库和浏览器界面，详细运行环境在实施时确定。

### 同步与持久化

依据 [Overland 官方协议文档](https://github.com/aaronpk/Overland-iOS)，PC 接收端可接收包含 locations 的 JSON 请求。配置 All Data 保存每个收到的位置更新，避免使用只发送最新位置的模式。

服务必须先完成数据库事务，再返回 `{"result":"ok"}`。采集器以该响应确认批次并清理待发送缓存；失败时保留待发送数据。PC 应保存原始事件，并以设备、时间和事件内容建立稳定的去重规则，允许重复上传。

局域网同步服务需要绑定手机可达的 PC 局域网地址；`127.0.0.1` 只能由 PC 自身访问。拟采用 HTTPS 和独立访问令牌，只接收已配置设备。PC 网页管理界面默认仅供本机使用。不配置公网转发、云端存储或外部地理编码服务。

外出时 PC 不可达，依靠手机队列暂存；回家后可以补传。自动补传时间仍受采集器和 iOS 调度影响，应保留 Send Now 操作，并显示 PC 最后接收时间。不能将“回到 Wi-Fi”直接等同于“已经完成同步”。卸载、存储不足和突发重启时的队列可靠性需要真机验证。

### 全天采集策略

静止时尽量减少采集，移动时提高精度。Overland 提供 Core Location 配置、自动暂停及围栏恢复选项；应在真机上逐项测试后确定组合，不能先承诺恢复速度或固定耗电值。

显著位置变化模式适合较粗的活动记录，单独使用可能漏掉短距离步行和转弯；精细足迹需要更密的位置数据，并承担更高耗电。第一轮试用应同时比较轨迹连续性、偏差和每日耗电，而不是仅检查后台开关。

### PC 界面范围

- 白底累计足迹图、日期筛选和单日时间轴。
- 单次行程回放、距离与时长，以及长时间无数据的提示。
- 备注和 GPX／GeoJSON 导出、本地数据库备份。
- 保留原始点；过滤漂移、异常跳跃与计算距离时记录使用的规则。

暂停、长时间缺点和明显跳跃应切断线段，避免将缺失数据绘制成实际走过的路线。重复路线加深可后续实现；GPS 点重叠不等于已经准确识别同一条道路。真实街道底图作为后续选择，完全离线使用需另外准备地图数据。

## 另一条路线：自建 iOS App，使用云端构建

没有自己的 Mac，也可以在 Linux／Windows 编写 React Native／Expo 项目，通过 EAS 的 macOS 构建环境生成 iOS App。[Expo 构建说明](https://docs.expo.dev/develop/development-builds/introduction/?buildenv=build-with-eas)、[iPhone 云端开发构建要求](https://docs.expo.dev/tutorial/eas/ios-development-build-for-devices/)。这条路径通常需要付费 Apple Developer 会员、设备注册与签名配置；云端构建不代表轨迹数据必须上传云端。

后台定位需要真实的开发或发布构建，Expo Go 不支持这项能力。[Expo Location 文档](https://docs.expo.dev/versions/latest/sdk/location/#background-location)。自建 App 能统一手机地图、记录与同步体验，但需额外验证后台恢复、耗电和签名维护。云端构建涉及源码及构建凭证的外部处理；当前尚未选择或启用该服务。

另一个现成采集器候选是 OwnTracks，提供 HTTP 接收协议及 iOS 离线 GPX 导出；可在后续需要时比较。[OwnTracks HTTP 协议](https://owntracks.org/booklet/tech/http/)、[iOS 说明](https://owntracks.org/booklet/features/ios/)。

## 实施与验收顺序

1. 确定使用现成采集器，还是自建 iOS App；目前推荐前者。
2. PC 实现经过认证的接收端、批次落盘、重试去重和备份，明确局域网及 HTTPS 配置。
3. 验证实际 iPhone 上传格式与确认行为，再实现轨迹界面及导出。
4. 连续试用一天以上，覆盖锁屏、长时间静止后出门、短途步行、乘车、PC 关闭、离线后回家补传和手机重启。
5. 记录耗电、缺点时段、数据量、补传延迟，以及人工终止采集器后的恢复行为。将未采到的时段显式标为缺失。

当前只核查了公开技术资料和本地文件，未验证采集器在用户所在 App Store 地区的安装情况，未进行手机全天采集、局域网连接或耗电测试。文档中的 PC 功能均为拟实现范围。

</details>

<details>
<summary>初期 README（实施前状态）</summary>

## What is it?

track 是计划中的本地行动轨迹档案工具：iPhone 全天自动采集位置，Linux／Windows PC 保存轨迹，并通过本地网页查看每日路线和累计足迹。设计参考 PlainWalk 的白底轨迹地图。

当前仅有需求与可行性文档，尚无可运行的 PC 服务或自建 iOS App。推荐先接入现成的 iOS 原生采集器；方案、限制和后续实施步骤见 [description.md](description.md)。

## How to use

目前可直接阅读 [description.md](description.md)，确认采集与同步方案。

推荐方案的前提是 iPhone、可安装的 Overland GPS Tracker，以及 Linux／Windows PC。采集端需要“始终”定位权限；回家同步需要手机能够访问 PC 的局域网服务。采集器从 App Store 安装，无需自行编译 iOS App。

PC 服务实现后，预期流程为：在 Overland 中配置 PC 同步地址和访问令牌，开启持续记录；外出时数据暂存在手机；回到同一局域网后批量补传，必要时使用 Send Now；在 PC 浏览器中查看、回放和导出轨迹。数据上传成功后可能从手机待发送队列移除，因此 PC 需要保留备份。

目前没有安装、启动或卸载 PC 服务的命令。停止采集可在采集器内关闭记录；卸载手机采集器前应先同步仍在队列中的数据。

</details>

### 证书下载端口修正（2026-10-06）

旧证书下载端口 4190 位于 [Fetch 标准的受限端口列表](https://fetch.spec.whatwg.org/#port-blocking)，导致 iPhone Safari 报告 “not allowed to use restricted network port”。默认端口改为 8080，连接面板自动生成新地址和二维码；现有根证书、上传令牌和轨迹数据库继续使用。新增浏览器回归检查采用默认端口实际打开说明页并下载描述文件，避免仅用 HTTP 客户端检查而漏掉浏览器端口限制。本机 15 项 Python、7 项轨迹语义和 12 组浏览器检查通过；实际局域网地址的 Chromium 下载也通过，iPhone Safari 重试待用户确认。

### 可选临时 HTTPS 中转（2026-10-06）

用户确认允许上传流量通过临时公网 HTTPS 中转。`scripts/relay.py` 启动 Cloudflare Quick Tunnel，只转发既有 HTTPS 上传监听器；不会转发本机管理端口、备份、令牌获取或公开证书端口。公网入口使用原 Bearer token 验证，手机 HTTPS 使用公网证书，不再需要手动信任 PC CA。中转程序用 `ca.pem` 和 `localhost` 名称验证原站证书，没有关闭 TLS 验证。PC 与 Cloudflare 的连接选用 HTTP/2，以适配不支持 QUIC 的网络。

连接面板在中转模式下隐藏证书步骤与同一 Wi-Fi 提示，并展示三语中转说明和新的 Overland 二维码。仅本机、正确 Host／Origin 且携带 CSRF 的请求可以登记 `https://*.trycloudflare.com` 域名；路径、其他域名和用户信息 URL 均被拒绝。该登记只存进程内存，由中转每 15 秒续期、45 秒到期；正常退出清除登记，异常退出后登记自动失效。停止中转即关闭公网连接，连接面板重新打开时恢复局域网地址；手机中的旧中转域名不会自动改回。

上传流量在 Cloudflare 终止 TLS，因此服务方能处理请求内容及认证头；这不是端到端加密或完全本地传输。数据库仍只写入 PC，没有配置云端档案。Quick Tunnel 域名随启动变化、没有在线保证，定位队列补传依赖 PC 与中转保持运行。官方来源：[Quick Tunnels](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/)。

本机按需下载的 `.tools/cloudflared` 不纳入版本管理，也不安装系统服务；Linux amd64 版本 2026.10.0 的 SHA-256 与官方 GitHub Release asset digest 核对一致。其他机器须安装相应平台的官方程序，或通过 `--cloudflared` 指定路径。验证覆盖 CSRF、域名校验、上传端拒绝中转管理、登记过期和清除、浏览器三语模式切换以及恢复局域网配置；16 项 Python、7 项轨迹语义与 13 组浏览器检查通过。

实际公网链路检查：无认证上传 HTTP 401；携带正确令牌但无效数据的上传 HTTP 400，未写入测试位置；公网访问管理 API HTTP 404。正常中断中转后登记清除、局域网配置恢复，重新启动后新域名和本机连接面板二维码验证通过。真实档案仍为 0 个定位点，iPhone 首次真实上传待用户测试。

### 自动恢复中转与深色模式（2026-10-07）

检查发现原 Quick Tunnel 进程已结束，旧版连接面板因 45 秒心跳过期而回退到局域网接收地址。新增 `relay-settings.json` 保存用户选择、模式与最后公网域名；健康心跳仍只在内存中。失去心跳后保留中转模式和域名并显示重连状态，不把局域网地址用于手机配置。临时模式在未连接时隐藏配置二维码、禁用接收地址复制，避免配置失效域名；面板打开时每 5 秒刷新。启动 `track.py --relay` 保存选择，后续普通启动自动恢复；`--no-relay` 清除中转选择。Track 监管中转子进程，失败后重试间隔至少 15 秒；服务退出时依次结束中转和 connector。原站监听默认使用回环地址，避免依赖热点 DHCP 地址；显式 `--lan-ip` 仍可选择局域网监听。

当前机器安装并启用了 Linux 用户 `track.service` 登录自启动，服务配置静态验证通过。系统重启或注销后未做实际登录测试；Windows 启动与进程清理未做真机验证。公网仅转发认证上传监听器，管理界面、备份和令牌获取仍为本机访问。维护前在私有数据目录保存 SQLite 快照，真实档案检查有 2,859 个定位点，说明此前手机上传已到达；不能据此宣称全天后台连续性与耗电验证完成。

主题支持跟随系统／浅色／深色，三语选择器，localStorage 保存偏好。外部本地脚本 `/theme.js` 在样式加载前应用主题，保持既有 CSP，不使用内联脚本。CSS 控件、弹窗和 Canvas 足迹／回放颜色同步切换；二维码保持白底。桌面与 390／320 px 深色截图及主题持久化、系统主题变化、显式主题覆盖均已验证。

没有部署 GitHub Pages，也没有重命名文件夹：Pages 不能运行 Python 接收 API 或 SQLite 服务，部署静态前端不能解决手机上传。来源：[GitHub Pages 限制](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site)。用户选择无域名时先恢复 Quick Tunnel。临时域名仍会变化，固定地址需要可管理的域名及 Named Tunnel；来源：[Cloudflare Quick Tunnels](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/)。

保留可选 locally-managed Named Tunnel 配置入口：准备 cloudflared 配置文件后，运行 `python3 scripts/relay.py --public-url https://track.example.com --tunnel-config /绝对路径/config.yml`。配置须仅把该 hostname 路由至 `https://127.0.0.1:4189`，`originRequest.caPool` 指向档案中的 `ca.pem`，`originRequest.originServerName` 设为 `localhost`，最后的 catch-all 为 `http_status:404`；凭证路径放在本机配置文件，不写入聊天或仓库。配置入口由本机 Host／Origin 与 CSRF 校验保护，心跳仅接受配置中的确切域名。这里的 example.com 是占位符；尚未配置或验证真实 Named Tunnel、DNS 或公网固定域名。该入口不提供自动创建 Cloudflare 账户或域名的功能。

本轮最终验证：18 项 Python（含实际 Track 启停与离线模拟 connector 的配置恢复）、7 项轨迹语义和 14 组浏览器检查通过。实际服务停止其 cloudflared 子进程后，Track 自动重启连接并登记新域名；全程未将手机接收配置回退为 127.0.0.1。公网无令牌上传 401、正确令牌但无效数据 400、管理 API 404；真实档案仍为 2,859 点，未向真实档案添加测试数据。当前用户服务 enabled／active，本机服务的主题保存、HTTPS 配置和二维码检查通过。桌面和手机宽度截图使用临时测试数据库中的虚构路线。

### 按钮生成临时同步地址（2026-10-07）

Connect iPhone 面板新增三语按钮、生成进度与成功／超时／缺少 cloudflared 提示。点击后通过本机 Host／Origin／CSRF 保护的请求，保存临时中转模式并递增生成请求；Track 监管循环结束旧中转子进程后启动新进程，返回新 HTTPS 域名及 Overland 二维码。生成期间按钮禁用并隐藏旧二维码；重复请求在 15 秒内返回 409。Named Tunnel 模式禁止该按钮，避免替换固定配置。生成新地址会结束旧地址，需要更新手机配置。数据仍仅写入 PC，上传验证和公网访问范围未改变。

本轮验证：19 项 Python、7 项轨迹语义及 15 组浏览器检查通过；浏览器用离线模拟 connector 验证按钮生成和再次替换域名。实际运行服务的按钮生成 HTTPS 域名、三语控制和二维码流程也通过，生成前后的真实档案均为 9,136 个定位点，未导入测试位置。并发生成及心跳配置更新使用同一锁，避免多个标签页重复点击造成并发配置写入。

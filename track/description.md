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

## What is it?

track 是计划中的本地行动轨迹档案工具：iPhone 全天自动采集位置，Linux／Windows PC 保存轨迹，并通过本地网页查看每日路线和累计足迹。设计参考 PlainWalk 的白底轨迹地图。

当前仅有需求与可行性文档，尚无可运行的 PC 服务或自建 iOS App。推荐先接入现成的 iOS 原生采集器；方案、限制和后续实施步骤见 [description.md](description.md)。

## How to use

目前可直接阅读 [description.md](description.md)，确认采集与同步方案。

推荐方案的前提是 iPhone、可安装的 Overland GPS Tracker，以及 Linux／Windows PC。采集端需要“始终”定位权限；回家同步需要手机能够访问 PC 的局域网服务。采集器从 App Store 安装，无需自行编译 iOS App。

PC 服务实现后，预期流程为：在 Overland 中配置 PC 同步地址和访问令牌，开启持续记录；外出时数据暂存在手机；回到同一局域网后批量补传，必要时使用 Send Now；在 PC 浏览器中查看、回放和导出轨迹。数据上传成功后可能从手机待发送队列移除，因此 PC 需要保留备份。

目前没有安装、启动或卸载 PC 服务的命令。停止采集可在采集器内关闭记录；卸载手机采集器前应先同步仍在队列中的数据。

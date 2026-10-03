# JUPAS Analysis · HKU

## What is it?

中文交互分析模型，范围按用户确认：**HKU、2027–28 本科入学、香港薪酬为主并补充海外对照**。

## How to use

```bash
cd /home/a/Documents/someProducts/d-jupasanalysis
npm run dev
```

打开 http://127.0.0.1:8791 。无 npm 依赖；只监听 loopback。也可直接打开 `index.html` 查看页面，但完整交互需 HTTP 服务加载 ES module。`PORT=8792 npm run dev` 可更换端口。

选择专业组合查看横向路径图，拖动或缩放地图并点击节点查看详情。切换年度与薪酬筛选；在成本模型中调整工资、学费和资助期限；需要时导出研究数据 JSON。

更多背景与技术说明见 [description.md](description.md)。

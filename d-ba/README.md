# COST / LOGIC — BAFS 成本会计

## What is it?

面向 HKDSE BAFS 的本地成本会计学习网站，中文解释配英文术语，提供课程、自测与参数实验。

## How to use

直接打开 [index.html](index.html)，无需构建、联网或安装依赖。移动或分享时保留整个 `d-ba` 文件夹。

本地预览：

```bash
python3 -m http.server 8000 --bind 127.0.0.1 --directory d-ba
```

访问 http://127.0.0.1:8000 。

本地预览命令从 `d-ba` 的上一级目录运行。打开后按章节学习，调整实验参数并完成自测；可切换主题、手动标记掌握程度，或打印全部章节及答案。

更多背景与技术说明见 [description.md](description.md)。

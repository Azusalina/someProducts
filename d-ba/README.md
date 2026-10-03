# COST / LOGIC — BAFS 成本会计

直接打开 [index.html](index.html)，无需构建、联网或安装依赖。移动或分享时保留整个 `d-ba` 文件夹。

本地预览：

```bash
python3 -m http.server 8000 --bind 127.0.0.1 --directory d-ba
```

访问 http://127.0.0.1:8000 。

7 章内容：成本函数、分类与成本流、贡献 / CVP、两种成本法、相关成本决策、多产品 / 限制因素、8 道原创自测。中文解释配英文术语，KaTeX 本地渲染 LaTeX。

- 4 个参数实验，校验输入范围、整数件数及存货约束。
- 深浅主题、手动掌握标记；本地存储不可用时仍可学习。
- 打印全部章节及自测答案；交互面板不打印。
- “课程边界与参考”列明官方来源、适用背景和理解扩展。

文件：`index.html` 入口；`lessons.js` 内容；`app.js` 交互；`style.css` 响应式布局。

依据：HKEAA 2026 BAFS Assessment Framework；EDB 标示适用于 2025 HKDSE 及以后之课程背景和 Accounting Strand Supplementary Notes，成本会计为文内第 11 页。核对日期 2026-10-02。示例与推导原创，非官方历届题。

第三方：KaTeX 0.16.22，MIT 许可见 `vendor/katex/LICENSE`。无外部字体、分析服务或 CDN。

已验证（2026-10-03）：Chromium 中的核心计算与边界输入、8 道自测、主题和进度恢复；320 / 390 / 768 / 1440px 下全部章节无整页横向溢出；LaTeX 无解析错误；打印全部章节内容；直接通过本地文件离线打开。浏览器未报告运行或资源加载错误。打印检查覆盖内容和样式，未测试实体打印机。

<div align="center">

# Awesome Design MD

**112 个知名品牌的设计系统规范（`DESIGN.md`），供 AI 编码助手直接读取，生成风格一致的 UI。**

合并自三个上游合集 · 去重 · 移除收费内容 · 带在线预览画廊

[![Live Gallery](https://img.shields.io/badge/在线预览-GitHub%20Pages-3B82F6?style=flat-square)](https://pans0ul.github.io/our-design-md/)
[![Brands](https://img.shields.io/badge/品牌-112-9046FF?style=flat-square)](#-收录品牌)
[![Previews](https://img.shields.io/badge/实时预览-112-34E8BB?style=flat-square)](https://pans0ul.github.io/our-design-md/)
[![License](https://img.shields.io/badge/License-MIT-F97316?style=flat-square)](LICENSE)

[**中文**](README.md) · [**English**](README.en.md) · [**在线画廊**](https://pans0ul.github.io/our-design-md/)

</div>

---

## 这是什么

`DESIGN.md` 是一份**机器可读的设计系统说明**：用 YAML front matter 记录颜色、字体、间距、圆角、阴影等设计 token，再用自然语言描述布局规则与组件风格。把这些文件交给 AI 编码助手（Claude Code、Cursor、OpenCode 等），它就能生成与目标品牌视觉一致的前端界面。

本仓库把三个优秀的开源合集合并成**一个**去重后的仓库，并为每个品牌提供**在线预览 + 一键下载**。

## ✨ 特性

- **112 个品牌**，12 个分类，全部去重，每个品牌只出现一次
- **在线画廊**（GitHub Pages）：卡片式浏览，鼠标悬停即加载实时 `iframe` 预览
- **一键下载**：每个品牌可下载对应的 `DESIGN.md`
- **明/暗双预览**：54 个品牌提供深色模式预览
- **零依赖**：纯静态站点，无 CDN JS、无 npm 运行时依赖，仅引用 Google Fonts
- **中英双语**：画廊 UI 与本文档均支持中文 / English
- **已移除收费内容**：不含任何付费服务、赞助区块或付费 CTA

## 🚀 快速开始

### 方式一：下载单个品牌

1. 打开 [在线画廊](https://pans0ul.github.io/our-design-md/)
2. 找到目标品牌，点击 **下载 DESIGN.md**
3. 把文件放进你的项目（例如 `./DESIGN.md` 或 `.ai/DESIGN.md`）
4. 让 AI 助手遵循它，例如：

   > 请严格按照项目里的 `DESIGN.md` 设计系统来实现这个页面。

### 方式二：直接引用原始链接

```
https://raw.githubusercontent.com/pans0ul/our-design-md/main/design-md/linear.app/DESIGN.md
```

把 `linear.app` 换成你想要的品牌 slug 即可（见下方[收录品牌](#-收录品牌)）。

## 🗂️ 仓库结构

```
our-design-md/
├── index.html                 # 画廊入口（GitHub Pages）
├── data/
│   └── index.json             # 统一品牌索引（112 条，站点数据源）
├── design-md/
│   └── <slug>/
│       ├── DESIGN.md          # 设计系统规范（YAML token + 规则）
│       ├── preview.html       # 实时预览（全部 112 个）
│       └── preview-dark.html  # 深色模式预览（54 个）
├── scripts/
│   ├── build.mjs              # 由 data/index.json 生成 index.html
│   └── generate-previews.mjs  # 为缺失预览的品牌生成 token 目录式预览
├── CREDITS.md                 # 上游来源与致谢
├── CONTRIBUTING.md            # 贡献指南
├── LICENSE                    # MIT
└── .nojekyll                  # 关闭 GitHub Pages 的 Jekyll 处理
```

## 📦 收录品牌

共 **112 个品牌**，分为 12 类：

| 分类 | 数量 | 说明 |
|---|---:|---|
| AI & LLM Platforms / AI 与大模型 | 16 | Anthropic、Claude、DeepSeek、Mistral、xAI、Cohere、Ollama 等 |
| Developer Tools & IDEs / 开发者工具 | 7 | Cursor、Warp、Raycast、Vercel、Sentry 等 |
| Backend, Database & DevOps / 后端与运维 | 11 | Supabase、MongoDB、ClickHouse、HashiCorp、IBM 等 |
| Productivity & SaaS / 效率与 SaaS | 9 | Notion、Linear、Airtable、Miro、Zapier、飞书 等 |
| Design & Creative Tools / 设计与创意 | 6 | Figma、Framer、Clay、Webflow 等 |
| Fintech & Crypto / 金融与加密 | 10 | Stripe、Coinbase、Kraken、Binance、Revolut、Wise 等 |
| E-commerce & Retail / 电商与零售 | 9 | 淘宝、京东、拼多多、Anker、Honor 等 |
| Media & Consumer Tech / 媒体与消费科技 | 30 | Apple、Spotify、Bilibili、知乎、小米、华为、优酷、爱奇艺 等 |
| Automotive / 汽车 | 7 | Tesla、BMW、Ferrari、Bugatti、DJI 等 |
| Social & Platform / 社交与平台 | 2 | Pinterest、微信 等 |
| Travel & Mobility / 出行与旅行 | 3 | Airbnb、携程、高德、Uber 等 |
| Retro Web / 复古网页 | 2 | 1996 年的 Dell、2001 年的任天堂 等 |

> 完整列表见 [`data/index.json`](data/index.json)，每个品牌的 slug、分类、主色、字体、描达与来源都在其中。

## 🧱 `DESIGN.md` 长这样

```markdown
---
name: Linear
primary_color: "#5E6AD2"
font_sans: "Inter"
radius: "8px"
---

# Linear — Design System

## Colors
- Background: #08090A
- Primary: #5E6AD2
...

## Typography
...

## Components & Layout Rules
...
```

## 🛠️ 本地开发

无需安装依赖（仅需 Node.js ≥ 18）：

```bash
# 由 data/index.json 重新生成画廊
node scripts/build.mjs

# 本地起一个静态服务器
python3 -m http.server 8080
# 然后打开 http://localhost:8080
```

仓库当前状态：**112 个品牌 · 112 个实时预览 · 54 个深色预览 · 12 个分类**。

## 🤝 贡献

欢迎补充品牌或改进预览。请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 📜 许可与来源

本项目采用 [MIT 许可](LICENSE)，是以下三个 MIT 开源项目的**合并与去重**结果：

| 上游 | 采用内容 | 许可 |
|---|---|---|
| [VoltAgent/awesome-design-md](https://github.com/VoltAgent/awesome-design-md) | 84 个品牌的规范 `DESIGN.md` | MIT |
| [HU-UH/awesome-design-md](https://github.com/HU-UH/awesome-design-md) | 54 个品牌的交互式预览 | MIT |
| [wyf0931/awesome-design-md-cn](https://github.com/wyf0931/awesome-design-md-cn) | 28 个中文互联网品牌 | MIT |

详细致谢见 [CREDITS.md](CREDITS.md)。所有 `DESIGN.md` 描述的是公开网站上可见的 CSS 数值，**非**官方设计系统；品牌名称与视觉标识归各自所有者所有。

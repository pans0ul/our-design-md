<div align="center">

# our design.md

112 个品牌的设计系统规范（`DESIGN.md`），用于让 AI 编码助手输出风格一致的界面。

[![在线预览](https://img.shields.io/badge/在线预览-GitHub%20Pages-3B82F6?style=flat-square)](https://pans0ul.github.io/our-design-md/)
[![品牌](https://img.shields.io/badge/品牌-112-9046FF?style=flat-square)](#收录品牌)
[![License](https://img.shields.io/badge/License-MIT-F97316?style=flat-square)](LICENSE)

[中文](README.zh.md) · [English](README.md) · [在线画廊](https://pans0ul.github.io/our-design-md/)

</div>

---

## 简介

`DESIGN.md` 是一份机器可读的设计系统说明：文件头部用 YAML 记录颜色、字体、间距、圆角、阴影等设计 token，正文用自然语言描述布局规则与组件样式。把它放进项目并交给 AI 编码助手（Claude Code、Cursor、OpenCode 等），生成的界面会遵循对应品牌的视觉语言。

本仓库合并了三个 MIT 许可的开源合集，去重后得到 112 个品牌、12 个分类，并为每个品牌提供在线预览与 `DESIGN.md` 下载。上游的付费服务、赞助区块和付费引导内容已移除。

## 内容

- 112 个品牌，12 个分类，每个品牌只出现一次。
- 每个品牌包含一份 `DESIGN.md`；112 个品牌提供实时预览，其中 54 个提供深色预览。
- 画廊支持搜索、分类筛选、中英文切换和弹窗预览。
- 纯静态站点，无 npm 运行时依赖，不加载第三方 JavaScript。
- README 与画廊界面均提供中英文版本。

## 快速开始

### 下载单个品牌

1. 打开[在线画廊](https://pans0ul.github.io/our-design-md/)。
2. 找到目标品牌，点击「下载 DESIGN.md」。
3. 将文件放入项目，例如 `./DESIGN.md` 或 `.ai/DESIGN.md`。
4. 让 AI 助手遵循该文件，例如：

   > 请严格按照项目中的 `DESIGN.md` 实现这个页面。

### 直接引用原始文件

```
https://raw.githubusercontent.com/pans0ul/our-design-md/main/design-md/linear.app/DESIGN.md
```

将 `linear.app` 替换为目标品牌的 slug。完整列表见[收录品牌](#收录品牌)。

## 仓库结构

```
our-design-md/
├── index.html                 # 画廊入口（GitHub Pages）
├── data/
│   └── index.json             # 品牌索引（112 条，站点数据源）
├── design-md/
│   └── <slug>/
│       ├── DESIGN.md          # 设计系统规范（YAML token + 规则）
│       ├── preview.html       # 实时预览（112 个）
│       └── preview-dark.html  # 深色预览（54 个）
├── scripts/
│   ├── build.mjs              # 由 data/index.json 生成 index.html
│   └── generate-previews.mjs  # 为缺少预览的品牌生成 token 目录式预览
├── CREDITS.md                 # 上游来源与致谢
├── CONTRIBUTING.md            # 贡献指南
├── LICENSE                    # MIT
└── .nojekyll                  # 关闭 GitHub Pages 的 Jekyll 处理
```

## 收录品牌

112 个品牌分为 12 类：

| 分类 | 数量 | 示例 |
|---|---:|---|
| AI 与大模型 | 16 | Anthropic、Claude、DeepSeek、Mistral、xAI、Cohere、Ollama |
| 开发者工具 | 7 | Cursor、Warp、Raycast、Vercel、Sentry |
| 后端与运维 | 11 | Supabase、MongoDB、ClickHouse、HashiCorp、IBM |
| 效率与 SaaS | 9 | Notion、Linear、Airtable、Miro、Zapier、飞书 |
| 设计与创意 | 6 | Figma、Framer、Clay、Webflow |
| 金融与加密 | 10 | Stripe、Coinbase、Kraken、Binance、Revolut、Wise |
| 电商与零售 | 9 | 淘宝、京东、拼多多、Anker、荣耀 |
| 媒体与消费科技 | 30 | Apple、Spotify、Bilibili、知乎、小米、华为、优酷、爱奇艺 |
| 汽车 | 7 | Tesla、BMW、Ferrari、Bugatti、DJI |
| 社交与平台 | 2 | Pinterest、微信 |
| 出行与旅行 | 3 | Airbnb、携程、高德、Uber |
| 复古网页 | 2 | Dell（1996）、Nintendo（2001） |

每个品牌的 slug、分类、主色、字体、描述和来源记录在 [`data/index.json`](data/index.json) 中。

## DESIGN.md 格式

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

## 本地开发

需要 Node.js 18 或更高版本，无第三方依赖：

```bash
# 由 data/index.json 重新生成画廊
node scripts/build.mjs

# 启动本地静态服务器
python3 -m http.server 8080
# 打开 http://localhost:8080
```

当前状态：112 个品牌 · 112 个实时预览 · 54 个深色预览 · 12 个分类。

## 贡献

补充品牌或改进预览的说明见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 许可与来源

本项目采用 [MIT 许可](LICENSE)，是以下三个 MIT 开源项目的合并与去重结果：

| 上游 | 采用内容 | 许可 |
|---|---|---|
| [VoltAgent/awesome-design-md](https://github.com/VoltAgent/awesome-design-md) | 84 个品牌的 `DESIGN.md` | MIT |
| [HU-UH/awesome-design-md](https://github.com/HU-UH/awesome-design-md) | 54 个品牌的交互式预览 | MIT |
| [wyf0931/awesome-design-md-cn](https://github.com/wyf0931/awesome-design-md-cn) | 28 个中文互联网品牌 | MIT |

完整致谢见 [CREDITS.md](CREDITS.md)。

所有 `DESIGN.md` 描述的是公开网站上可观察到的 CSS 数值，并非官方设计系统。品牌名称与视觉标识归各自所有者所有。

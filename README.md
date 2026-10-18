<div align="center">

# Our Design.md

Design-system specs (`DESIGN.md`) for 112 brands, used to make AI coding agents produce visually consistent interfaces.

[![Live gallery](https://img.shields.io/badge/Live%20gallery-GitHub%20Pages-3B82F6?style=flat-square)](https://pans0ul.github.io/our-design-md/)
[![Brands](https://img.shields.io/badge/Brands-112-9046FF?style=flat-square)](#brands)
[![License](https://img.shields.io/badge/License-MIT-F97316?style=flat-square)](LICENSE)

[中文](README.zh.md) · [English](README.md) · [Live gallery](https://pans0ul.github.io/our-design-md/)

</div>

---

## Overview

A `DESIGN.md` is a machine-readable design-system spec. Its YAML front matter records design tokens such as colors, fonts, spacing, radius, and shadows; the body describes layout rules and component styling in plain language. Drop the file into a project and give it to an AI coding agent (Claude Code, Cursor, OpenCode, and similar tools), and the generated interface follows that brand's visual language.

This repository merges three MIT-licensed collections, removes duplicates, and ships 112 brands across 12 categories with an online preview and a `DESIGN.md` download for each one. Paid services, sponsor blocks, and paid calls to action from the upstream projects have been removed.

## Contents

- 112 brands across 12 categories, each appearing once.
- Every brand includes a `DESIGN.md`; all 112 have a live preview, and 54 also have a dark-mode preview.
- The gallery supports search, category filtering, a Chinese/English switch, and a preview dialog.
- A static site with no npm runtime dependencies and no third-party JavaScript.
- Both the README and the gallery UI are available in Chinese and English.

## Getting started

### Download a single brand

1. Open the [live gallery](https://pans0ul.github.io/our-design-md/).
2. Find the brand you need and select **Download DESIGN.md**.
3. Place the file in your project, for example `./DESIGN.md` or `.ai/DESIGN.md`.
4. Ask your AI agent to follow it, for example:

   > Implement this page strictly according to the `DESIGN.md` in this project.

### Reference the raw file

```
https://raw.githubusercontent.com/pans0ul/our-design-md/main/design-md/linear.app/DESIGN.md
```

Replace `linear.app` with the target brand slug. The full list is under [Brands](#brands).

## Repository layout

```
our-design-md/
├── index.html                 # gallery entry point (GitHub Pages)
├── data/
│   └── index.json             # brand index (112 entries; site data source)
├── design-md/
│   └── <slug>/
│       ├── DESIGN.md          # design-system spec (YAML tokens + rules)
│       ├── preview.html       # live preview (112)
│       └── preview-dark.html  # dark-mode preview (54)
├── scripts/
│   ├── build.mjs              # generates index.html from data/index.json
│   └── generate-previews.mjs  # generates token-catalog previews for brands without one
├── CREDITS.md                 # upstream sources and acknowledgements
├── CONTRIBUTING.md            # contribution guide
├── LICENSE                    # MIT
└── .nojekyll                  # disables Jekyll processing on GitHub Pages
```

## Brands

The 112 brands fall into 12 categories:

| Category | Count | Examples |
|---|---:|---|
| AI and LLM platforms | 16 | Anthropic, Claude, DeepSeek, Mistral, xAI, Cohere, Ollama |
| Developer tools | 7 | Cursor, Warp, Raycast, Vercel, Sentry |
| Backend and operations | 11 | Supabase, MongoDB, ClickHouse, HashiCorp, IBM |
| Productivity and SaaS | 9 | Notion, Linear, Airtable, Miro, Zapier, Feishu |
| Design and creative tools | 6 | Figma, Framer, Clay, Webflow |
| Fintech and crypto | 10 | Stripe, Coinbase, Kraken, Binance, Revolut, Wise |
| E-commerce and retail | 9 | Taobao, JD.com, Pinduoduo, Anker, Honor |
| Media and consumer tech | 30 | Apple, Spotify, Bilibili, Zhihu, Xiaomi, Huawei, Youku, iQiyi |
| Automotive | 7 | Tesla, BMW, Ferrari, Bugatti, DJI |
| Social and platforms | 2 | Pinterest, WeChat |
| Travel and mobility | 3 | Airbnb, Ctrip, Amap, Uber |
| Retro web | 2 | Dell (1996), Nintendo (2001) |

Each brand's slug, category, primary color, font, description, and sources are recorded in [`data/index.json`](data/index.json).

## DESIGN.md format

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

## Local development

Node.js 18 or later is required. There are no third-party dependencies.

```bash
# regenerate the gallery from data/index.json
node scripts/build.mjs

# start a local static server
python3 -m http.server 8080
# then open http://localhost:8080
```

Current state: 112 brands · 112 live previews · 54 dark-mode previews · 12 categories.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for instructions on adding brands or improving previews.

## License and sources

This project is released under the [MIT license](LICENSE). It merges and deduplicates three MIT-licensed projects:

| Upstream | What was used | License |
|---|---|---|
| [VoltAgent/awesome-design-md](https://github.com/VoltAgent/awesome-design-md) | `DESIGN.md` for 84 brands | MIT |
| [HU-UH/awesome-design-md](https://github.com/HU-UH/awesome-design-md) | Interactive previews for 54 brands | MIT |
| [wyf0931/awesome-design-md-cn](https://github.com/wyf0931/awesome-design-md-cn) | 28 Chinese-internet brands | MIT |

Full acknowledgements are in [CREDITS.md](CREDITS.md).

The `DESIGN.md` files describe CSS values observable on public websites. They are not official design systems. Brand names and visual identities belong to their respective owners.

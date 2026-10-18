<div align="center">

# our design.md

**Design-system specs (`DESIGN.md`) for 112 well-known brands, ready for AI coding agents to generate visually consistent UI.**

Merged from three upstream collections · deduplicated · paid content removed · with a live preview gallery

[![Live Gallery](https://img.shields.io/badge/Live%20Gallery-GitHub%20Pages-3B82F6?style=flat-square)](https://pans0ul.github.io/our-design-md/)
[![Brands](https://img.shields.io/badge/Brands-112-9046FF?style=flat-square)](#-included-brands)
[![Previews](https://img.shields.io/badge/Live%20Previews-112-34E8BB?style=flat-square)](https://pans0ul.github.io/our-design-md/)
[![License](https://img.shields.io/badge/License-MIT-F97316?style=flat-square)](LICENSE)

[**中文**](README.md) · [**English**](README.en.md) · [**Live Gallery**](https://pans0ul.github.io/our-design-md/)

</div>

---

## What is this

A `DESIGN.md` is a **machine-readable design-system spec**: YAML front matter captures design tokens (colors, fonts, spacing, radius, shadows), and the body describes layout rules and component styling in plain language. Hand these files to an AI coding agent (Claude Code, Cursor, OpenCode, etc.) and it will generate front-end UI that matches the target brand's look.

This repository merges three excellent open-source collections into **one** deduplicated repo, with an **online preview + one-click download** for every brand.

## ✨ Features

- **112 brands** across 12 categories, fully deduplicated — every brand appears once
- **Live gallery** (GitHub Pages): card layout with lazy-mounted live `iframe` previews
- **One-click download** of each brand's `DESIGN.md`
- **Light / dark previews**: 54 brands ship a dark-mode preview
- **Zero dependencies**: a pure static site — no CDN JS, no npm runtime deps, only Google Fonts
- **Bilingual**: gallery UI and docs in both Chinese and English
- **Paid content removed**: no paid service, sponsor blocks, or paid CTAs

## 🚀 Quick Start

### Option 1 — download a single brand

1. Open the [live gallery](https://pans0ul.github.io/our-design-md/)
2. Find your brand and click **Download DESIGN.md**
3. Drop the file into your project (e.g. `./DESIGN.md` or `.ai/DESIGN.md`)
4. Tell your AI agent to follow it, e.g.:

   > Implement this page strictly according to the `DESIGN.md` design system in this project.

### Option 2 — reference the raw URL

```
https://raw.githubusercontent.com/pans0ul/our-design-md/main/design-md/linear.app/DESIGN.md
```

Replace `linear.app` with the brand slug you want (see [Included Brands](#-included-brands)).

## 🗂️ Repository Structure

```
our-design-md/
├── index.html                 # gallery entry (GitHub Pages)
├── data/
│   └── index.json             # unified brand index (112 entries; site data source)
├── design-md/
│   └── <slug>/
│       ├── DESIGN.md          # design-system spec (YAML tokens + rules)
│       ├── preview.html       # live preview (all 112)
│       └── preview-dark.html  # dark-mode preview (54)
├── scripts/
│   ├── build.mjs              # generates index.html from data/index.json
│   └── generate-previews.mjs  # generates token-catalog previews for brands lacking one
├── CREDITS.md                 # upstream sources & acknowledgements
├── CONTRIBUTING.md            # contribution guide
├── LICENSE                    # MIT
└── .nojekyll                  # disable Jekyll processing on GitHub Pages
```

## 📦 Included Brands

**112 brands** across 12 categories:

| Category | Count | Examples |
|---|---:|---|
| AI & LLM Platforms | 16 | Anthropic, Claude, DeepSeek, Mistral, xAI, Cohere, Ollama |
| Developer Tools & IDEs | 7 | Cursor, Warp, Raycast, Vercel, Sentry |
| Backend, Database & DevOps | 11 | Supabase, MongoDB, ClickHouse, HashiCorp, IBM |
| Productivity & SaaS | 9 | Notion, Linear, Airtable, Miro, Zapier, Feishu |
| Design & Creative Tools | 6 | Figma, Framer, Clay, Webflow |
| Fintech & Crypto | 10 | Stripe, Coinbase, Kraken, Binance, Revolut, Wise |
| E-commerce & Retail | 9 | Taobao, JD.com, Pinduoduo, Anker, Honor |
| Media & Consumer Tech | 30 | Apple, Spotify, Bilibili, Zhihu, Xiaomi, Huawei, Youku, iQiyi |
| Automotive | 7 | Tesla, BMW, Ferrari, Bugatti, DJI |
| Social & Platform | 2 | Pinterest, WeChat |
| Travel & Mobility | 3 | Airbnb, Ctrip, Amap, Uber |
| Retro Web | 2 | Dell (1996), Nintendo (2001) |

> The full list lives in [`data/index.json`](data/index.json) — slug, category, primary color, font, description and sources for each brand.

## 🧱 What a `DESIGN.md` looks like

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

## 🛠️ Local Development

No install required (just Node.js ≥ 18):

```bash
# regenerate the gallery from data/index.json
node scripts/build.mjs

# serve locally
python3 -m http.server 8080
# then open http://localhost:8080
```

Current state: **112 brands · 112 live previews · 54 dark previews · 12 categories**.

## 🤝 Contributing

Adding brands or improving previews is welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

## 📜 License & Sources

Licensed under [MIT](LICENSE). This project is a **merge + deduplication** of three MIT-licensed upstream projects:

| Upstream | What we took | License |
|---|---|---|
| [VoltAgent/awesome-design-md](https://github.com/VoltAgent/awesome-design-md) | Canonical `DESIGN.md` for 84 brands | MIT |
| [HU-UH/awesome-design-md](https://github.com/HU-UH/awesome-design-md) | Interactive previews for 54 brands | MIT |
| [wyf0931/awesome-design-md-cn](https://github.com/wyf0931/awesome-design-md-cn) | 28 Chinese-internet brands | MIT |

Full acknowledgements in [CREDITS.md](CREDITS.md). All `DESIGN.md` files describe CSS values visible on public websites and are **not** official design systems; brand names and visual identities belong to their respective owners.

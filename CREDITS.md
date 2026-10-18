# Credits & Sources / 来源与致谢

This repository is a **merge + deduplication** of three MIT-licensed upstream projects.
本仓库由以下三个 MIT 许可的上游项目**合并与去重**而来。

| Upstream / 上游 | What we took / 采用内容 | License |
|---|---|---|
| [VoltAgent/awesome-design-md](https://github.com/VoltAgent/awesome-design-md) | Canonical `DESIGN.md` files for 84 brands (the original collection). / 84 个品牌的规范 `DESIGN.md`（原始合集）。 | MIT |
| [HU-UH/awesome-design-md](https://github.com/HU-UH/awesome-design-md) | Interactive `preview.html` + `preview-dark.html` for 54 brands. / 54 个品牌的交互式 `preview.html` 与 `preview-dark.html`。 | MIT |
| [wyf0931/awesome-design-md-cn](https://github.com/wyf0931/awesome-design-md-cn) | `DESIGN.md` + `preview.html` for 28 Chinese-internet brands, plus gallery tooling inspiration. / 28 个中文互联网品牌的 `DESIGN.md` 与 `preview.html`，以及画廊工具思路。 | MIT |

## How the merge works / 合并方式

- **Deduplication / 去重**: `HU-UH/awesome-design-md`'s 54 brands are a subset of `VoltAgent/awesome-design-md`. Each brand appears **once**. When a brand exists in multiple upstreams, the canonical `DESIGN.md` comes from `VoltAgent` (it carries machine-readable YAML token front matter), while previews are reused from `HU-UH`.
- **Removed / 移除内容**: paid/sponsor material was intentionally excluded — VoltAgent's per-brand `README.md` pointers to the paywalled `getdesign.md` service, its "Request a DESIGN.md" paid CTA, and sponsor blocks. No paid content is required to use anything here.
- **Added / 新增内容**: generated token-catalog previews for the 30 brands that had no preview upstream, a unified `data/index.json`, and a self-contained GitHub-Pages gallery with per-brand download.

## Copyright / 版权

All upstream `LICENSE` files are MIT and are preserved. See [`LICENSE`](LICENSE).
`DESIGN.md` files describe publicly visible CSS values from public websites. Brand names, logos and visual identities belong to their respective owners. These documents are provided "as is", are **not** official design systems, and are intended to help AI coding agents generate visually consistent UI.

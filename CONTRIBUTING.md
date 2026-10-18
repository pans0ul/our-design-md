# Contributing / 贡献指南

[简体中文](#简体中文) · [English](#english)

## 简体中文

感谢参与！本仓库收录供 AI 编码 Agent 使用的 `DESIGN.md` 设计系统文档。

### 新增一个品牌

1. 新建目录 `design-md/<slug>/`（`slug` 仅含小写字母、数字与连字符）。
2. 放入 `DESIGN.md`（必需，遵循 Google Stitch 的 DESIGN.md 章节结构，建议带 YAML front matter 存放机器可读 token）。
3. 可选：放入自包含的 `preview.html`（浅色）与 `preview-dark.html`（深色），需为**单个 HTML 文件**、内联样式、不依赖构建。
4. 在 `data/index.json` 的 `brands` 数组中添加一条记录（`slug` / `name` / `category` / `descEn` / `descZh` / `primaryColor` / `tags` / `url` 等）。`category` 必须是 `categories` 中已存在的 `id`。
5. 运行 `node scripts/build.mjs` 重新生成 `index.html`，并在浏览器中确认卡片、预览与下载按钮工作正常。

### 改进已有内容

- 修正错误的颜色、字体、间距或缺失 token。
- 预览页与 `DESIGN.md` 的实际 token 保持一致。

### 约定

- 不要提交品牌 Logo、营销文案或受版权保护的图片；仅记录公开可见的 CSS 设计值。
- 不要提交付费/推广内容。
- 提交 PR 前请先开 issue 讨论。

## English

Thanks for contributing! This repo curates `DESIGN.md` design-system documents for AI coding agents.

### Add a brand

1. Create `design-md/<slug>/` (`slug` = lowercase letters, digits and hyphens only).
2. Add `DESIGN.md` (required, following the Google Stitch DESIGN.md section structure; a YAML front matter block with machine-readable tokens is recommended).
3. Optionally add a self-contained `preview.html` (light) and `preview-dark.html` (dark). Each must be a **single HTML file** with inline styles and no build step.
4. Add an entry to the `brands` array in `data/index.json` (`slug` / `name` / `category` / `descEn` / `descZh` / `primaryColor` / `tags` / `url`, …). `category` must be an existing `id` in `categories`.
5. Run `node scripts/build.mjs` to regenerate `index.html`, then verify the card, preview and download button in a browser.

### Improve existing content

- Fix wrong colors, fonts, spacing or missing tokens.
- Keep previews consistent with the actual tokens in `DESIGN.md`.

### Guidelines

- Do not submit brand logos, marketing copy or copyrighted images — record publicly visible CSS design values only.
- Do not submit paid/promotional content.
- Open an issue before sending a PR.

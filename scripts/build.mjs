#!/usr/bin/env node
/**
 * build.mjs — generates a self-contained `index.html` gallery from `data/index.json`.
 *
 * - Node >= 18, zero dependencies.
 * - Reads data/index.json, validates it, detects preview files on the filesystem
 *   (design-md/<slug>/preview.html and preview-dark.html), and emits one HTML file
 *   with inline <style> + inline <script>. Cards are rendered client-side from an
 *   embedded JSON payload; iframes are lazy-mounted via IntersectionObserver.
 * - Only relative URLs are used, so the file works at any repo subpath
 *   (e.g. https://<user>.github.io/our-design-md/).
 *
 * Usage: node scripts/build.mjs
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(SCRIPT_DIR, '..');
const INDEX_PATH = join(ROOT, 'data', 'index.json');
const OUT_PATH = join(ROOT, 'index.html');
const DESIGN_MD_DIR = join(ROOT, 'design-md');

/* ---------------------------------------------------------------- helpers */

function fail(msg) {
  console.error('build.mjs: ' + msg);
  process.exit(1);
}

const escHtml = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

function parseHex(hex, fallback) {
  if (typeof hex !== 'string') return fallback;
  let h = hex.trim();
  const m3 = /^#([0-9a-f]{3})$/i.exec(h);
  if (m3) h = '#' + [...m3[1]].map((c) => c + c).join('');
  if (!/^#[0-9a-f]{6}$/i.test(h)) return fallback;
  return h.toLowerCase();
}

const hexToRgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const rgba = (hex, a) => {
  const [r, g, b] = hexToRgb(hex);
  return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
};
const darken = (hex, f) => {
  const [r, g, b] = hexToRgb(hex);
  return 'rgb(' + Math.round(r * f) + ',' + Math.round(g * f) + ',' + Math.round(b * f) + ')';
};

/* ------------------------------------------------------------- load + validate */

let raw;
try {
  raw = readFileSync(INDEX_PATH, 'utf8');
} catch {
  fail('cannot read data/index.json — run this from the repo (scripts/build.mjs resolves paths from its own location).');
}

let index;
try {
  index = JSON.parse(raw);
} catch (e) {
  fail('data/index.json is not valid JSON: ' + e.message);
}

const errors = [];
if (typeof index.title !== 'string' || !index.title.trim()) errors.push('missing "title"');
if (typeof index.subtitle !== 'string') errors.push('missing "subtitle"');
if (!Array.isArray(index.categories) || index.categories.length === 0) errors.push('"categories" must be a non-empty array');
if (!Array.isArray(index.brands) || index.brands.length === 0) errors.push('"brands" must be a non-empty array');

const catIds = new Set();
if (Array.isArray(index.categories)) {
  index.categories.forEach((c, i) => {
    if (!c || typeof c.id !== 'string' || !c.id) errors.push('categories[' + i + '].id missing');
    else if (catIds.has(c.id)) errors.push('duplicate category id "' + c.id + '"');
    else catIds.add(c.id);
    if (!c || typeof c.label !== 'string') errors.push('categories[' + i + '].label missing');
    if (!c || typeof c.labelZh !== 'string') errors.push('categories[' + i + '].labelZh missing');
  });
}

const seenSlugs = new Set();
if (Array.isArray(index.brands)) {
  index.brands.forEach((b, i) => {
    if (!b || typeof b.slug !== 'string' || !/^[a-z0-9][a-z0-9.-]*$/i.test(b.slug)) {
      errors.push('brands[' + i + '].slug invalid or missing');
    } else if (seenSlugs.has(b.slug)) {
      errors.push('duplicate brand slug "' + b.slug + '"');
    } else {
      seenSlugs.add(b.slug);
    }
    if (!b || typeof b.name !== 'string' || !b.name.trim()) errors.push('brands[' + i + '].name missing');
    if (!b || typeof b.category !== 'string' || !catIds.has(b.category)) {
      errors.push('brands[' + i + '].category "' + (b && b.category) + '" is not a known category id');
    }
  });
}
if (errors.length) fail('index.json validation failed:\n  - ' + errors.join('\n  - '));

/* ------------------------------------------------- build slim client payload */

const DEFAULT_COLOR = '#3B82F6';

const brands = index.brands.map((b) => {
  const color = parseHex(b.primaryColor, DEFAULT_COLOR);
  const descZh = typeof b.descZh === 'string' ? b.descZh : '';
  const descEn = typeof b.descEn === 'string' ? b.descEn : '';
  const cat = index.categories.find((c) => c.id === b.category);
  const tags = Array.isArray(b.tags) ? b.tags.filter((t) => typeof t === 'string') : [];
  const sources = Array.isArray(b.sources) ? b.sources.filter((s) => typeof s === 'string') : [];

  // Filesystem is the source of truth for preview availability (a concurrent
  // workstream may add preview.html files after index.json was generated).
  const hasPreview = existsSync(join(DESIGN_MD_DIR, b.slug, 'preview.html'));
  const hasDark = existsSync(join(DESIGN_MD_DIR, b.slug, 'preview-dark.html'));

  // Precomputed lowercase search haystack: name + ZH/EN desc + category + tags + slug.
  const hay = (
    b.name + ' ' + descZh + ' ' + descEn + ' ' +
    (cat ? cat.labelZh + ' ' + cat.label : b.category) + ' ' +
    tags.join(' ') + ' ' + b.slug
  ).toLowerCase();

  const initial = (b.name.trim()[0] || '?').toUpperCase();

  return {
    slug: b.slug,
    name: b.name,
    category: b.category,
    descZh,
    descEn,
    color,
    phFrom: rgba(color, 0.38),
    phTo: rgba(color, 0.06),
    posterFrom: color,
    posterTo: darken(color, 0.35),
    initial,
    url: typeof b.url === 'string' && b.url ? b.url : '',
    hasPreview,
    hasDark,
    sources,
    hay,
  };
});

const total = brands.length;
const previewCount = brands.filter((b) => b.hasPreview).length;
const darkCount = brands.filter((b) => b.hasDark).length;
const catCount = index.categories.length;

/* ------------------------------------------------------------- client script */

const CLIENT_JS = `
(function () {
  'use strict';
  var DATA = JSON.parse(document.getElementById('gallery-data').textContent);
  var brands = DATA.brands;
  var cats = DATA.categories;
  var I18N = DATA.i18n || { zh: {}, en: {} };
  var SUBTITLE = { zh: DATA.subtitleZh || '', en: DATA.subtitleEn || DATA.subtitleZh || '' };
  var generatedAt = DATA.generatedAt || '';
  var catMap = {};
  for (var i = 0; i < cats.length; i++) catMap[cats[i].id] = cats[i];

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function t(key) {
    var d = I18N[state.lang];
    if (d && d[key] != null) return d[key];
    return I18N.zh && I18N.zh[key] != null ? I18N.zh[key] : key;
  }
  function catLabel(id) {
    var c = catMap[id];
    if (!c) return id;
    return state.lang === 'zh' ? c.labelZh : c.label;
  }
  function descOf(b) {
    return state.lang === 'zh' ? (b.descZh || b.descEn || '') : (b.descEn || b.descZh || '');
  }

  /* ---------------- theme toggle ---------------- */
  var root = document.documentElement;
  var themeBtn = document.getElementById('theme-toggle');
  function applyTheme(t) {
    root.setAttribute('data-theme', t);
    themeBtn.setAttribute('aria-pressed', t === 'light' ? 'true' : 'false');
  }
  themeBtn.addEventListener('click', function () {
    var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    try { localStorage.setItem('dg-theme', next); } catch (e) {}
  });
  try {
    var saved = localStorage.getItem('dg-theme');
    if (saved === 'light' || saved === 'dark') applyTheme(saved);
  } catch (e) {}

  /* ---------------- language toggle ---------------- */
  var langBtn = document.getElementById('lang-toggle');
  var langLabelEl = document.getElementById('lang-label');

  /* ---------------- state ---------------- */
  var state = { q: '', cat: 'all', lang: 'zh' };
  var hayBySlug = {};

  /* ---------------- category pills ---------------- */
  var pillsEl = document.getElementById('pills');
  var pillDefs = [{ id: 'all' }].concat(cats);
  function renderPills() {
    var out = '';
    for (var p = 0; p < pillDefs.length; p++) {
      var pc = pillDefs[p];
      var text = pc.id === 'all' ? esc(t('all')) : esc(catLabel(pc.id));
      var on = state.cat === pc.id;
      out += '<button type="button" class="pill' + (on ? ' active' : '') +
        '" data-cat="' + esc(pc.id) + '" aria-pressed="' + (on ? 'true' : 'false') + '">' + text + '</button>';
    }
    pillsEl.innerHTML = out;
  }
  pillsEl.addEventListener('click', function (e) {
    var btn = e.target && e.target.closest ? e.target.closest('.pill') : null;
    if (!btn) return;
    state.cat = btn.getAttribute('data-cat');
    var all = pillsEl.querySelectorAll('.pill');
    for (var k = 0; k < all.length; k++) {
      var on = all[k] === btn;
      all[k].classList.toggle('active', on);
      all[k].setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    applyFilters();
  });

  /* ---------------- cards ---------------- */
  function actionsHtml(b) {
    var html = '';
    html += '<a class="btn btn-primary" href="design-md/' + esc(b.slug) + '/DESIGN.md" download="' +
      esc(b.slug) + '-DESIGN.md" title="' + esc(t('downloadTitlePre') + b.name + t('downloadTitlePost')) + '">' + esc(t('download')) + '</a>';
    html += '<a class="btn" href="design-md/' + esc(b.slug) + '/DESIGN.md" target="_blank" rel="noopener">' + esc(t('viewSource')) + '</a>';
    if (b.hasDark) {
      html += '<a class="btn" href="design-md/' + esc(b.slug) + '/preview-dark.html" target="_blank" rel="noopener">' + esc(t('darkPreview')) + '</a>';
    }
    if (b.url) {
      html += '<a class="btn" href="' + esc(b.url) + '" target="_blank" rel="noopener">' + esc(t('website')) + '</a>';
    }
    return html;
  }

  function cardHtml(b) {
    var thumb;
    if (b.hasPreview) {
      thumb = '<div class="thumb" role="button" tabindex="0" data-slug="' + esc(b.slug) +
        '" aria-label="' + esc(t('openPreview') + ': ' + b.name) + '">' +
        '<div class="thumb-ph" style="background:linear-gradient(135deg,' + b.phFrom + ',' + b.phTo + ')"></div>' +
        '<div class="thumb-overlay"><span class="overlay-chip">' + esc(t('openPreview')) + '</span></div>' +
        '</div>';
    } else {
      thumb = '<div class="thumb thumb-poster" style="background:linear-gradient(135deg,' + b.posterFrom + ',' + b.posterTo + ')">' +
        '<span class="poster-letter" aria-hidden="true">' + esc(b.initial) + '</span>' +
        '<span class="poster-note">' + esc(t('posterNote')) + '</span>' +
        '</div>';
    }
    var desc = descOf(b);
    var badges = '';
    for (var s = 0; s < b.sources.length; s++) badges += '<span class="badge">' + esc(b.sources[s]) + '</span>';
    return '<article class="card" data-cat="' + esc(b.category) + '" data-slug="' + esc(b.slug) + '">' +
      thumb +
      '<div class="card-body">' +
      '<div class="card-head"><span class="swatch" style="background:' + b.color + '" aria-hidden="true"></span>' +
      '<h3 class="card-name">' + esc(b.name) + '</h3></div>' +
      '<p class="card-cat">' + esc(catLabel(b.category)) + '</p>' +
      (desc ? '<p class="card-desc">' + esc(desc) + '</p>' : '') +
      (badges ? '<div class="badges">' + badges + '</div>' : '') +
      '<div class="actions">' + actionsHtml(b) + '</div>' +
      '</div></article>';
  }

  var grid = document.getElementById('grid');
  var cards;
  var io = typeof IntersectionObserver === 'function'
    ? new IntersectionObserver(function (entries) {
        for (var i = 0; i < entries.length; i++) {
          if (entries[i].isIntersecting) {
            mountFrame(entries[i].target);
            io.unobserve(entries[i].target);
          }
        }
      }, { rootMargin: '500px 0px', threshold: 0 })
    : null;

  /* ---------------- preview iframe: scale-to-fit + center ---------------- */
  function fitThumb(thumb) {
    var f = thumb.querySelector('.thumb-frame');
    if (!f) return;
    var w = thumb.clientWidth;
    var h = thumb.clientHeight;
    if (!w || !h) { requestAnimationFrame(function () { fitThumb(thumb); }); return; }
    var s = Math.max(w / 1440, h / 900);
    f.style.transform = 'translate(-50%,-50%) scale(' + s + ')';
  }
  function fitAll() {
    var mounted = grid.querySelectorAll('.thumb-frame');
    for (var r = 0; r < mounted.length; r++) fitThumb(mounted[r].parentNode);
  }
  var fitTimer = null;
  window.addEventListener('resize', function () {
    if (fitTimer) clearTimeout(fitTimer);
    fitTimer = setTimeout(fitAll, 120);
  });

  /* ---------------- lazy iframe mounting ---------------- */
  function mountFrame(thumb) {
    if (thumb.getAttribute('data-mounted')) return;
    thumb.setAttribute('data-mounted', '1');
    var slug = thumb.getAttribute('data-slug');
    var f = document.createElement('iframe');
    f.className = 'thumb-frame';
    f.loading = 'lazy';
    f.tabIndex = -1;
    f.setAttribute('scrolling', 'no');
    f.setAttribute('title', '预览: ' + slug);
    f.src = 'design-md/' + slug + '/preview.html';
    f.addEventListener('load', function () { thumb.classList.add('loaded'); });
    thumb.insertBefore(f, thumb.firstChild);
    fitThumb(thumb);
  }

  function renderGrid() {
    if (io) io.disconnect();
    hayBySlug = {};
    var out = '';
    for (var g = 0; g < brands.length; g++) {
      out += cardHtml(brands[g]);
      hayBySlug[brands[g].slug] = brands[g].hay;
    }
    grid.innerHTML = out;
    cards = grid.querySelectorAll('.card');
    var thumbs = grid.querySelectorAll('.thumb[data-slug]');
    if (io) {
      for (var th = 0; th < thumbs.length; th++) io.observe(thumbs[th]);
    } else {
      for (var th2 = 0; th2 < thumbs.length; th2++) mountFrame(thumbs[th2]);
    }
  }

  /* ---------------- search + category filtering ---------------- */
  var countEl = document.getElementById('count');
  var emptyEl = document.getElementById('empty');
  function applyFilters() {
    var q = state.q.trim().toLowerCase();
    var n = 0;
    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      var slug = card.getAttribute('data-slug');
      var okCat = state.cat === 'all' || card.getAttribute('data-cat') === state.cat;
      var okQ = !q || (hayBySlug[slug] || '').indexOf(q) !== -1;
      var ok = okCat && okQ;
      card.hidden = !ok;
      if (ok) n++;
    }
    countEl.textContent = t('countPrefix') + n + t('countMid') + brands.length + t('countSuffix');
    emptyEl.hidden = n !== 0;
  }
  var searchEl = document.getElementById('search');
  var deb = null;
  searchEl.addEventListener('input', function () {
    if (deb) clearTimeout(deb);
    deb = setTimeout(function () {
      state.q = searchEl.value;
      applyFilters();
    }, 120);
  });

  /* ---------------- preview modal ---------------- */
  var modal = document.getElementById('preview-modal');
  var mFrame = document.getElementById('modal-frame');
  var mTitle = document.getElementById('modal-title');
  var mCat = document.getElementById('modal-cat');
  var mActions = document.getElementById('modal-actions');
  var bySlug = {};
  for (var i3 = 0; i3 < brands.length; i3++) bySlug[brands[i3].slug] = brands[i3];

  function openModal(slug) {
    var b = bySlug[slug];
    if (!b || !b.hasPreview) return;
    mTitle.textContent = b.name;
    mCat.textContent = catLabel(b.category);
    mActions.innerHTML = actionsHtml(b);
    mFrame.src = 'design-md/' + slug + '/preview.html';
    document.documentElement.classList.add('modal-open');
    modal.showModal();
  }
  modal.addEventListener('close', function () {
    mFrame.src = 'about:blank';
    document.documentElement.classList.remove('modal-open');
  });
  modal.addEventListener('click', function (e) {
    if (e.target === modal) modal.close();
  });
  document.getElementById('modal-close').addEventListener('click', function () { modal.close(); });

  grid.addEventListener('click', function (e) {
    var el = e.target && e.target.closest ? e.target.closest('.thumb[data-slug]') : null;
    if (el) openModal(el.getAttribute('data-slug'));
  });
  grid.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    var el = e.target && e.target.closest ? e.target.closest('.thumb[data-slug]') : null;
    if (el) { e.preventDefault(); openModal(el.getAttribute('data-slug')); }
  });

  /* ---------------- language switching ---------------- */
  var subEl = document.getElementById('hero-sub');
  var footerEl = document.getElementById('site-footer');
  var modalCloseBtn = document.getElementById('modal-close');
  var chipEls = [
    ['chip-brands', 'chipBrands'],
    ['chip-categories', 'chipCategories'],
    ['chip-previews', 'chipPreviews'],
    ['chip-free', 'chipFree'],
  ];

  function renderFooter() {
    footerEl.innerHTML = t('footerPrefix') + esc(generatedAt) + t('footerMid') + '<a href="CREDITS.md">Credits</a>';
  }

  function applyLang() {
    var l = state.lang;
    root.setAttribute('lang', l === 'zh' ? 'zh-CN' : 'en');
    searchEl.placeholder = t('searchPlaceholder');
    searchEl.setAttribute('aria-label', t('searchAria'));
    pillsEl.setAttribute('aria-label', t('pillsAria'));
    grid.setAttribute('aria-label', t('gridAria'));
    emptyEl.textContent = t('emptyText');
    if (subEl) subEl.textContent = SUBTITLE[l] || SUBTITLE.zh;
    themeBtn.setAttribute('aria-label', t('themeAria'));
    langBtn.setAttribute('aria-label', t('langAria'));
    langLabelEl.textContent = t('langLabel');
    if (modalCloseBtn) modalCloseBtn.setAttribute('aria-label', t('modalClose'));
    mFrame.setAttribute('title', t('modalFrameTitle'));
    for (var ci = 0; ci < chipEls.length; ci++) {
      var chipEl = document.getElementById(chipEls[ci][0]);
      if (chipEl) chipEl.textContent = t(chipEls[ci][1]);
    }
    renderFooter();
    renderPills();
    renderGrid();
    applyFilters();
  }

  langBtn.addEventListener('click', function () {
    state.lang = state.lang === 'zh' ? 'en' : 'zh';
    try { localStorage.setItem('dg-lang', state.lang); } catch (e) {}
    applyLang();
    fitAll();
  });

  try {
    var savedLang = localStorage.getItem('dg-lang');
    if (savedLang === 'zh' || savedLang === 'en') state.lang = savedLang;
  } catch (e) {}

  applyLang();
})();
`;

/* -------------------------------------------------------------- i18n strings */

const I18N = {
  zh: {
    langLabel: '中',
    searchPlaceholder: '搜索品牌…',
    searchAria: '搜索品牌',
    pillsAria: '分类筛选',
    gridAria: '品牌列表',
    all: '全部',
    emptyText: '没有找到匹配的品牌',
    openPreview: '打开预览',
    posterNote: '预览即将上线',
    download: '⬇ 下载 DESIGN.md',
    downloadTitlePre: '下载 ',
    downloadTitlePost: ' 的 DESIGN.md',
    viewSource: '查看源码',
    darkPreview: '深色预览',
    website: '官网 ↗',
    countPrefix: '共 ',
    countMid: ' / ',
    countSuffix: ' 个设计系统',
    themeAria: '切换主题',
    langAria: '切换语言',
    modalClose: '关闭预览',
    modalFrameTitle: '品牌预览',
    footerPrefix: '数据更新于 ',
    footerMid: ' · 由 <code>scripts/build.mjs</code> 从 <code>data/index.json</code> 生成 · ',
    chipBrands: '个品牌',
    chipCategories: '个分类',
    chipPreviews: '个实时预览',
    chipFree: 'MIT · 100% 免费',
  },
  en: {
    langLabel: 'EN',
    searchPlaceholder: 'Search brands…',
    searchAria: 'Search brands',
    pillsAria: 'Category filters',
    gridAria: 'Brands',
    all: 'All',
    emptyText: 'No brands match your search',
    openPreview: 'Open preview',
    posterNote: 'Preview coming soon',
    download: '⬇ Download DESIGN.md',
    downloadTitlePre: 'Download the DESIGN.md for ',
    downloadTitlePost: '',
    viewSource: 'View source',
    darkPreview: 'Dark preview',
    website: 'Website ↗',
    countPrefix: '',
    countMid: ' / ',
    countSuffix: ' design systems',
    themeAria: 'Toggle theme',
    langAria: 'Switch language',
    modalClose: 'Close preview',
    modalFrameTitle: 'Brand preview',
    footerPrefix: 'Updated ',
    footerMid: ' · Generated by <code>scripts/build.mjs</code> from <code>data/index.json</code> · ',
    chipBrands: 'Brands',
    chipCategories: 'Categories',
    chipPreviews: 'Live Previews',
    chipFree: 'MIT · 100% Free',
  },
};

const subtitleEn = typeof index.subtitleEn === 'string' && index.subtitleEn.trim() ? index.subtitleEn : index.subtitle;

/* ------------------------------------------------------------------- HTML */

const payload = JSON.stringify({
  categories: index.categories,
  brands,
  i18n: I18N,
  subtitleZh: index.subtitle,
  subtitleEn,
  generatedAt: String(index.generatedAt ?? ''),
}).replace(/</g, '\\u003c');

const chipsHtml = [
  '<span class="chip"><b>' + total + '</b>&nbsp;<span id="chip-brands">' + I18N.zh.chipBrands + '</span></span>',
  '<span class="chip"><b>' + catCount + '</b>&nbsp;<span id="chip-categories">' + I18N.zh.chipCategories + '</span></span>',
  '<span class="chip"><b>' + previewCount + '</b>&nbsp;<span id="chip-previews">' + I18N.zh.chipPreviews + '</span></span>',
  '<span class="chip" id="chip-free">' + I18N.zh.chipFree + '</span>',
].join('\n        ');

const html = `<!doctype html>
<html lang="zh-CN" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark light">
<meta name="theme-color" content="#0B0F17" media="(prefers-color-scheme: dark)">
<meta name="theme-color" content="#F8FAFC" media="(prefers-color-scheme: light)">
<meta name="description" content="${escHtml(index.subtitle)}">
<title>${escHtml(index.title)} · Design System Gallery</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0' stop-color='%233B82F6'/%3E%3Cstop offset='1' stop-color='%239046FF'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='64' height='64' rx='14' fill='url(%23g)'/%3E%3Ctext x='32' y='43' font-family='sans-serif' font-size='30' font-weight='700' fill='white' text-anchor='middle'%3ED%3C/text%3E%3C/svg%3E">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=DM+Sans:wght@400;500;700&display=swap" rel="stylesheet">
<style>
  *,*::before,*::after{box-sizing:border-box}
  [hidden]{display:none!important}
  html{scroll-behavior:smooth}
  html.modal-open{overflow:hidden}
  :root{
    --accent1:#3B82F6;--accent2:#9046FF;--teal:#34E8BB;--orange:#F97316;
    --grad:linear-gradient(135deg,#3B82F6,#9046FF);
    --font-head:'Space Grotesk','DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif;
  }
  [data-theme="dark"]{
    --bg:#0B0F17;--bg2:#111827;
    --text:#E6EAF2;--text-dim:#8B95A9;
    --surface:rgba(255,255,255,.05);--surface-strong:rgba(255,255,255,.08);
    --border:rgba(255,255,255,.10);--border-strong:rgba(255,255,255,.20);
    --toolbar-bg:rgba(11,15,23,.72);--modal-bg:rgba(15,20,32,.97);
    --blob-opacity:.35;
    --shadow:0 18px 50px -18px rgba(0,0,0,.55);
    --shadow-hover:0 24px 60px -16px rgba(59,130,246,.28),0 8px 30px -10px rgba(144,70,255,.22);
    color-scheme:dark;
  }
  [data-theme="light"]{
    --bg:#F8FAFC;--bg2:#EEF2F8;
    --text:#0F172A;--text-dim:#5B6472;
    --surface:rgba(255,255,255,.7);--surface-strong:rgba(255,255,255,.92);
    --border:rgba(15,23,42,.08);--border-strong:rgba(15,23,42,.18);
    --toolbar-bg:rgba(248,250,252,.82);--modal-bg:rgba(255,255,255,.98);
    --blob-opacity:.22;
    --shadow:0 14px 40px -18px rgba(15,23,42,.18);
    --shadow-hover:0 24px 60px -18px rgba(59,130,246,.25),0 8px 30px -12px rgba(144,70,255,.18);
    color-scheme:light;
  }
  body{
    margin:0;min-height:100vh;overflow-x:hidden;
    font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif;
    background:var(--bg);color:var(--text);line-height:1.6;
    -webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;
  }
  ::selection{background:rgba(59,130,246,.35)}
  :focus-visible{outline:2px solid var(--accent1);outline-offset:2px}

  /* ---------- aurora background ---------- */
  .aurora{position:fixed;inset:0;z-index:-1;overflow:hidden;pointer-events:none}
  .blob{position:absolute;border-radius:50%;filter:blur(80px);opacity:var(--blob-opacity);will-change:transform}
  .b1{width:46vw;height:46vw;min-width:420px;min-height:420px;background:#3B82F6;top:-12%;left:-8%;animation:float1 26s ease-in-out infinite alternate}
  .b2{width:40vw;height:40vw;min-width:380px;min-height:380px;background:#9046FF;top:8%;right:-10%;animation:float2 32s ease-in-out infinite alternate}
  .b3{width:36vw;height:36vw;min-width:340px;min-height:340px;background:#34E8BB;bottom:-14%;left:18%;animation:float3 30s ease-in-out infinite alternate}
  .b4{width:30vw;height:30vw;min-width:300px;min-height:300px;background:#F97316;bottom:6%;right:14%;animation:float1 36s ease-in-out infinite alternate-reverse}
  @keyframes float1{from{transform:translate(0,0) scale(1)}to{transform:translate(6vw,8vh) scale(1.12)}}
  @keyframes float2{from{transform:translate(0,0) scale(1)}to{transform:translate(-7vw,10vh) scale(.92)}}
  @keyframes float3{from{transform:translate(0,0) scale(1)}to{transform:translate(8vw,-7vh) scale(1.08)}}

  /* ---------- top bar ---------- */
  .topbar{display:flex;align-items:center;justify-content:space-between;max-width:1440px;margin:0 auto;padding:18px clamp(16px,4vw,32px)}
  .logo{font-family:var(--font-head);font-weight:700;font-size:1.05rem;letter-spacing:-.02em;color:var(--text);text-decoration:none}
  .logo em{font-style:normal;background:var(--grad);-webkit-background-clip:text;background-clip:text;color:transparent}
  .topbar-actions{display:flex;align-items:center;gap:8px}
  .lang-btn{font-weight:700;font-size:.8rem;letter-spacing:.02em}
  .icon-btn{display:inline-flex;align-items:center;justify-content:center;width:38px;height:38px;border-radius:12px;border:1px solid var(--border);background:var(--surface);color:var(--text);cursor:pointer;transition:border-color .2s,background .2s,transform .2s;flex:none}
  .icon-btn:hover{border-color:var(--border-strong);background:var(--surface-strong);transform:translateY(-1px)}
  .icon-btn svg{width:18px;height:18px}
  [data-theme="dark"] .i-moon{display:none}
  [data-theme="light"] .i-sun{display:none}

  /* ---------- hero ---------- */
  .hero{position:relative;text-align:center;padding:clamp(40px,8vh,84px) 20px 36px;max-width:920px;margin:0 auto}
  .hero::before{content:'';position:absolute;left:50%;top:-30px;transform:translateX(-50%);width:min(760px,92vw);height:340px;background:radial-gradient(closest-side,rgba(59,130,246,.22),rgba(144,70,255,.12),transparent);filter:blur(50px);z-index:-1;pointer-events:none}
  .hero h1{
    margin:0 0 14px;font-family:var(--font-head);font-weight:700;
    font-size:clamp(2.5rem,6.5vw,4.3rem);line-height:1.05;letter-spacing:-.045em;
    background:linear-gradient(120deg,#60A5FA 0%,#9046FF 45%,#34E8BB 100%);
    -webkit-background-clip:text;background-clip:text;color:transparent;
  }
  [data-theme="light"] .hero h1{background:linear-gradient(120deg,#2563EB 0%,#7C3AED 45%,#0D9488 100%);-webkit-background-clip:text;background-clip:text}
  .hero .sub{color:var(--text-dim);font-size:clamp(.95rem,2vw,1.1rem);margin:0 0 28px}
  .chips{display:flex;flex-wrap:wrap;gap:10px;justify-content:center}
  .chip{display:inline-flex;align-items:center;padding:8px 16px;border-radius:999px;background:var(--surface);border:1px solid var(--border);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);font-size:.82rem;font-weight:500;color:var(--text);box-shadow:inset 0 1px 0 rgba(255,255,255,.08)}
  .chip b{font-family:var(--font-head);font-weight:700}

  /* ---------- toolbar ---------- */
  .toolbar{position:sticky;top:0;z-index:40;background:var(--toolbar-bg);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border-bottom:1px solid var(--border);padding:14px clamp(16px,4vw,32px) 12px;margin-top:10px}
  .toolbar-inner{max-width:1440px;margin:0 auto;display:flex;flex-direction:column;align-items:center;gap:12px}
  .search-wrap{position:relative;width:min(560px,100%)}
  .search-wrap svg{position:absolute;left:14px;top:50%;transform:translateY(-50%);width:16px;height:16px;color:var(--text-dim);pointer-events:none}
  #search{width:100%;padding:10px 16px 10px 40px;border-radius:999px;border:1px solid var(--border);background:var(--surface);color:var(--text);font:inherit;font-size:.9rem;outline:none;backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);transition:border-color .2s,box-shadow .2s}
  #search::placeholder{color:var(--text-dim)}
  #search:focus{border-color:var(--accent1);box-shadow:0 0 0 3px rgba(59,130,246,.22)}
  .pills{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;max-width:1200px}
  .pill{padding:7px 14px;border-radius:999px;border:1px solid var(--border);background:var(--surface);color:var(--text-dim);font:inherit;font-size:.78rem;font-weight:500;cursor:pointer;transition:color .2s,border-color .2s,transform .2s,box-shadow .2s;white-space:nowrap}
  .pill:hover{color:var(--text);border-color:var(--border-strong);transform:translateY(-1px)}
  .pill.active{background:var(--grad);border-color:transparent;color:#fff;box-shadow:0 4px 16px -4px rgba(59,130,246,.5)}
  .count{margin:0;font-size:.75rem;color:var(--text-dim)}

  /* ---------- grid + cards ---------- */
  .grid{max-width:1440px;margin:0 auto;padding:26px clamp(16px,4vw,32px) 40px;display:grid;gap:20px;grid-template-columns:1fr}
  @media (min-width:621px){.grid{grid-template-columns:repeat(2,1fr)}}
  @media (min-width:1025px){.grid{grid-template-columns:repeat(3,1fr)}}
  @media (min-width:1440px){.grid{grid-template-columns:repeat(4,1fr)}}

  .card{
    display:flex;flex-direction:column;
    background:var(--surface);border:1px solid var(--border);border-radius:18px;overflow:hidden;
    backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);
    box-shadow:var(--shadow);
    transition:transform .25s ease,box-shadow .25s ease,border-color .25s ease;
    content-visibility:auto;contain-intrinsic-size:auto 460px;
  }
  .card:hover{transform:translateY(-3px);box-shadow:var(--shadow-hover);border-color:rgba(59,130,246,.45)}

  .thumb{position:relative;height:260px;overflow:hidden;border-bottom:1px solid var(--border);background:var(--bg2)}
  .thumb[data-slug]{cursor:pointer}
  .thumb-frame{position:absolute;top:50%;left:50%;width:1440px;height:900px;transform:translate(-50%,-50%) scale(.289);transform-origin:center center;border:0;pointer-events:none;z-index:1;background:#fff}
  .thumb-ph{position:absolute;inset:0;z-index:2;transition:opacity .6s ease;pointer-events:none}
  .thumb-ph::after{content:'';position:absolute;inset:0;background:linear-gradient(110deg,transparent 30%,rgba(255,255,255,.10) 50%,transparent 70%);transform:translateX(-100%);animation:shimmer 2.8s ease-in-out infinite}
  @keyframes shimmer{to{transform:translateX(100%)}}
  .thumb.loaded .thumb-ph{opacity:0}
  .thumb-overlay{position:absolute;inset:0;z-index:3;display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity .22s ease;background:linear-gradient(180deg,rgba(4,8,18,0) 35%,rgba(4,8,18,.55));pointer-events:none}
  .thumb[data-slug]:hover .thumb-overlay,.thumb[data-slug]:focus-visible .thumb-overlay{opacity:1}
  .overlay-chip{padding:9px 18px;border-radius:999px;background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.25);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);color:#fff;font-size:.82rem;font-weight:600;letter-spacing:.01em}
  .thumb-poster{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px}
  .poster-letter{font-family:var(--font-head);font-weight:700;font-size:4.2rem;line-height:1;color:rgba(255,255,255,.95);text-shadow:0 4px 24px rgba(0,0,0,.35)}
  .poster-note{font-size:.72rem;color:rgba(255,255,255,.78);background:rgba(0,0,0,.25);padding:4px 12px;border-radius:999px;backdrop-filter:blur(4px)}

  .card-body{padding:15px 17px 17px;display:flex;flex-direction:column;gap:8px;flex:1}
  .card-head{display:flex;align-items:center;gap:10px;min-width:0}
  .swatch{width:14px;height:14px;border-radius:50%;flex:none;box-shadow:0 0 0 3px rgba(127,127,127,.12),inset 0 0 0 1px rgba(255,255,255,.25)}
  .card-name{margin:0;font-family:var(--font-head);font-weight:600;font-size:1.02rem;letter-spacing:-.015em;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .card-cat{margin:0;font-size:.72rem;color:var(--text-dim)}
  .card-desc{margin:0;font-size:.84rem;color:var(--text-dim);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;min-height:2.6em}
  .badges{display:flex;flex-wrap:wrap;gap:6px}
  .badge{font-size:.66rem;padding:3px 9px;border-radius:999px;background:var(--surface-strong);border:1px solid var(--border);color:var(--text-dim)}
  .actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:auto;padding-top:12px;border-top:1px solid var(--border)}
  .btn{display:inline-flex;align-items:center;gap:5px;padding:7px 12px;border-radius:10px;border:1px solid var(--border);background:var(--surface-strong);color:var(--text);font:inherit;font-size:.76rem;font-weight:500;text-decoration:none;cursor:pointer;transition:transform .18s ease,border-color .18s ease,box-shadow .18s ease,filter .18s ease;white-space:nowrap}
  .btn:hover{border-color:var(--border-strong);transform:translateY(-1px)}
  .btn-primary{background:var(--grad);border-color:transparent;color:#fff;box-shadow:0 4px 14px -4px rgba(59,130,246,.45)}
  .btn-primary:hover{box-shadow:0 6px 20px -4px rgba(144,70,255,.55);filter:brightness(1.06)}

  .empty{text-align:center;color:var(--text-dim);padding:70px 20px;font-size:.95rem}

  footer{max-width:1440px;margin:0 auto;padding:30px clamp(16px,4vw,32px) 46px;text-align:center;color:var(--text-dim);font-size:.78rem;border-top:1px solid var(--border)}
  footer a{color:var(--text-dim)}
  footer code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.72rem}

  /* ---------- preview modal ---------- */
  dialog#preview-modal{width:min(1240px,94vw);padding:0;border:1px solid var(--border-strong);border-radius:20px;background:var(--modal-bg);color:var(--text);box-shadow:0 40px 120px -20px rgba(0,0,0,.6);overflow:hidden}
  dialog#preview-modal::backdrop{background:rgba(4,8,18,.62);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
  .modal-head{display:flex;align-items:center;gap:14px;padding:13px 16px;border-bottom:1px solid var(--border);flex-wrap:wrap}
  .modal-title-wrap{flex:1;min-width:180px}
  #modal-title{margin:0;font-family:var(--font-head);font-size:1.12rem;font-weight:600;letter-spacing:-.01em}
  #modal-cat{margin:1px 0 0;font-size:.73rem;color:var(--text-dim)}
  .modal-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}
  .modal-body{height:min(78vh,840px)}
  #modal-frame{display:block;width:100%;height:100%;border:0;background:#fff}

  @media (max-width:620px){
    .pills{flex-wrap:nowrap;overflow-x:auto;justify-content:flex-start;max-width:100%;padding-bottom:4px;scrollbar-width:none}
    .pills::-webkit-scrollbar{display:none}
  }
  /* Short viewports: keep the sticky toolbar compact (single scrollable pill row) */
  @media (max-height:860px) and (min-width:621px){
    .pills{flex-wrap:nowrap;overflow-x:auto;justify-content:flex-start;max-width:100%;padding-bottom:4px;scrollbar-width:none}
    .pills::-webkit-scrollbar{display:none}
  }
  @media (prefers-reduced-motion:reduce){
    html{scroll-behavior:auto}
    .blob{animation:none}
    .thumb-ph::after{animation:none}
    .card,.btn,.pill,.icon-btn{transition:none}
  }
</style>
</head>
<body>
<div class="aurora" aria-hidden="true">
  <i class="blob b1"></i><i class="blob b2"></i><i class="blob b3"></i><i class="blob b4"></i>
</div>

<header class="topbar">
  <a class="logo" href="./">our design<em>.md</em></a>
  <div class="topbar-actions">
  <button id="lang-toggle" class="icon-btn lang-btn" type="button" aria-label="切换语言 / Switch language"><span id="lang-label">中</span></button>
  <button id="theme-toggle" class="icon-btn" type="button" aria-label="切换主题 / Toggle theme" aria-pressed="false">
    <svg class="i-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>
    <svg class="i-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
  </button>
  </div>
</header>

<main>
  <section class="hero">
    <h1>${escHtml(index.title)}</h1>
    <p class="sub" id="hero-sub">${escHtml(index.subtitle)}</p>
    <div class="chips">
        ${chipsHtml}
    </div>
  </section>

  <section class="toolbar">
    <div class="toolbar-inner">
      <div class="search-wrap">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
        <input id="search" type="search" placeholder="搜索品牌 / Search brands…" aria-label="搜索品牌 / Search brands" autocomplete="off" spellcheck="false">
      </div>
      <div class="pills" id="pills" role="group" aria-label="分类筛选 / Category filters"></div>
      <p class="count" id="count" aria-live="polite"></p>
    </div>
  </section>

  <section class="grid" id="grid" aria-label="品牌列表 / Brands"></section>
  <div class="empty" id="empty" hidden>没有找到匹配的品牌 / No brands match your search</div>
</main>

<footer id="site-footer">
  数据更新于 ${escHtml(String(index.generatedAt ?? ''))} · 由 <code>scripts/build.mjs</code> 从 <code>data/index.json</code> 生成 · <a href="CREDITS.md">Credits</a>
</footer>

<dialog id="preview-modal" aria-labelledby="modal-title">
  <div class="modal-head">
    <div class="modal-title-wrap">
      <h3 id="modal-title"></h3>
      <p id="modal-cat"></p>
    </div>
    <div class="modal-actions" id="modal-actions"></div>
    <button id="modal-close" class="icon-btn" type="button" aria-label="关闭预览 / Close preview">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>
    </button>
  </div>
  <div class="modal-body">
    <iframe id="modal-frame" title="品牌预览 / Brand preview"></iframe>
  </div>
</dialog>

<script type="application/json" id="gallery-data">${payload}</script>
<script>
${CLIENT_JS}
</script>
</body>
</html>
`;

/* ------------------------------------------------------------------- write */

mkdirSync(ROOT, { recursive: true });
writeFileSync(OUT_PATH, html, 'utf8');

const kb = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(0);
console.log(
  'index.html generated (' + total + ' brands, ' + previewCount + ' live previews, ' +
  darkCount + ' dark variants, ' + catCount + ' categories, ' + kb + ' KB)'
);

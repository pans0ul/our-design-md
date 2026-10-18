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

  var root = document.documentElement;

  /* ---------------- theme toggle ---------------- */
  var themeBtn = document.getElementById('theme-toggle');
  function applyTheme(mode) {
    root.setAttribute('data-theme', mode);
    if (themeBtn) themeBtn.setAttribute('aria-pressed', mode === 'dark' ? 'true' : 'false');
  }
  if (themeBtn) themeBtn.addEventListener('click', function () {
    var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    try { localStorage.setItem('dg-theme', next); } catch (e) {}
  });
  try {
    var savedTheme = localStorage.getItem('dg-theme');
    if (savedTheme === 'light' || savedTheme === 'dark') applyTheme(savedTheme);
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
        '<div class="thumb-ph" style="background:' + b.color + '"></div>' +
        '<div class="thumb-overlay"><span class="overlay-chip">' + esc(t('openPreview')) + '</span></div>' +
        '</div>';
    } else {
      thumb = '<div class="thumb thumb-poster" style="background:' + b.color + '">' +
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
    if (themeBtn) themeBtn.setAttribute('aria-label', t('themeAria'));
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
    download: '下载 DESIGN.md',
    downloadTitlePre: '下载 ',
    downloadTitlePost: ' 的 DESIGN.md',
    viewSource: '查看源码',
    darkPreview: '深色预览',
    website: '官网 ↗',
    countPrefix: '共 ',
    countMid: ' / ',
    countSuffix: ' 个设计系统',
    langAria: '切换语言',
    themeAria: '切换主题',
    modalClose: '关闭预览',
    modalFrameTitle: '品牌预览',
    footerPrefix: '数据更新于 ',
    footerMid: ' · 由 <code>scripts/build.mjs</code> 从 <code>data/index.json</code> 生成 · ',
    chipBrands: '个品牌',
    chipCategories: '个分类',
    chipPreviews: '个实时预览',
    chipFree: '免费 · MIT',
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
    download: 'Download DESIGN.md',
    downloadTitlePre: 'Download the DESIGN.md for ',
    downloadTitlePost: '',
    viewSource: 'View source',
    darkPreview: 'Dark preview',
    website: 'Website ↗',
    countPrefix: '',
    countMid: ' / ',
    countSuffix: ' design systems',
    langAria: 'Switch language',
    themeAria: 'Toggle theme',
    modalClose: 'Close preview',
    modalFrameTitle: 'Brand preview',
    footerPrefix: 'Updated ',
    footerMid: ' · Generated by <code>scripts/build.mjs</code> from <code>data/index.json</code> · ',
    chipBrands: 'Brands',
    chipCategories: 'Categories',
    chipPreviews: 'Live Previews',
    chipFree: 'Free · MIT',
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
  '<span class="chip"><b>' + total + '</b> <span id="chip-brands">' + I18N.zh.chipBrands + '</span></span>',
  '<span class="chip"><b>' + catCount + '</b> <span id="chip-categories">' + I18N.zh.chipCategories + '</span></span>',
  '<span class="chip"><b>' + previewCount + '</b> <span id="chip-previews">' + I18N.zh.chipPreviews + '</span></span>',
  '<span class="chip"><b>100%</b> <span id="chip-free">' + I18N.zh.chipFree + '</span></span>',
].join('\n        ');

const html = `<!doctype html>
<html lang="zh-CN" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#181e25" media="(prefers-color-scheme: dark)">
<meta name="description" content="${escHtml(index.subtitle)}">
<title>${escHtml(index.title)} · Design System Gallery</title>
<link rel="icon" type="image/svg+xml" href="favicon.svg">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  *,*::before,*::after{box-sizing:border-box}
  [hidden]{display:none!important}
  html{scroll-behavior:smooth}
  html.modal-open{overflow:hidden}
  :root{
    /* Light tokens: design-md/minimax/DESIGN.md */
    --canvas:#ffffff;--surface:#f7f8fa;--surface-soft:#f2f3f5;
    --hairline:#e5e7eb;--hairline-soft:#eaecf0;
    --ink:#0a0a0a;--ink-strong:#000000;--charcoal:#222222;
    --slate:#45515e;--steel:#5f5f5f;--stone:#8e8e93;--muted:#a8aab2;
    --coral:#ff5530;--magenta:#ea5ec1;--blue:#1456f0;--blue-mid:#3b82f6;
    --blue-deep:#1d4ed8;--cyan:#3daeff;--blue-200:#bfdbfe;--purple:#a855f7;
    --success-bg:#e8ffea;--success-text:#1ba673;
    --card-bg:#ffffff;--control-bg:#ffffff;--modal-bg:#ffffff;
    --accent:#0a0a0a;--accent-hover:#222222;--accent-ink:#ffffff;
    --focus:#1d4ed8;--ring:rgba(29,78,216,.18);
    --chip-bg:#bfdbfe;--chip-ink:#1d4ed8;
    --footer-bg:#0a0a0a;--footer-ink:#ffffff;--footer-dim:#a8aab2;
    --toolbar-bg:#ffffff;--toolbar-blur:none;
    --modal-shadow:0 12px 16px -4px rgba(36,36,36,.08);
    --backdrop:rgba(10,10,10,.40);
    --font:'DM Sans',Inter,-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif;
    color-scheme:light;
  }
  /* Dark tokens: design-md/minimax/preview-dark.html */
  [data-theme="dark"]{
    --canvas:#181e25;--surface:#1f2731;--surface-soft:#252d38;
    --hairline:rgba(255,255,255,.08);--hairline-soft:rgba(255,255,255,.06);
    --ink:#f0f2f5;--ink-strong:#ffffff;--charcoal:#252d38;
    --slate:#a0a8b4;--steel:#a0a8b4;--stone:#6b7280;--muted:#6b7280;
    --card-bg:#1f2731;--control-bg:rgba(255,255,255,.06);--modal-bg:#1f2731;
    --accent:#3b82f6;--accent-hover:#2563eb;--accent-ink:#ffffff;
    --focus:#3b82f6;--ring:rgba(59,130,246,.20);
    --chip-bg:rgba(59,130,246,.18);--chip-ink:#bfdbfe;
    --footer-bg:#111820;--footer-ink:rgba(255,255,255,.8);--footer-dim:rgba(255,255,255,.4);
    --toolbar-bg:rgba(24,30,37,.92);--toolbar-blur:blur(12px);
    --modal-shadow:0 12px 16px -4px rgba(0,0,0,.30);
    --backdrop:rgba(0,0,0,.60);
    color-scheme:dark;
  }
  body{
    margin:0;min-height:100vh;overflow-x:hidden;
    font-family:var(--font);
    background:var(--canvas);color:var(--ink);line-height:1.5;
    -webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;
  }
  ::selection{background:var(--ring)}
  :focus-visible{outline:2px solid var(--focus);outline-offset:2px}

  /* ---------- top bar ---------- */
  .topbar{display:flex;align-items:center;justify-content:space-between;max-width:1280px;margin:0 auto;padding:0 32px;height:64px;border-bottom:1px solid var(--hairline-soft);background:var(--canvas)}
  .logo{font-family:var(--font);font-weight:600;font-size:1.0625rem;letter-spacing:-.02em;color:var(--ink);text-decoration:none}
  .logo em{font-style:normal;color:var(--steel)}
  .topbar-actions{display:flex;align-items:center;gap:8px}
  .lang-btn{font-weight:600;font-size:.875rem;letter-spacing:0}
  .icon-btn{display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:9999px;border:1px solid var(--hairline);background:var(--control-bg);color:var(--ink);cursor:pointer;transition:border-color .18s ease;flex:none}
  .icon-btn:hover{border-color:var(--muted)}
  .icon-btn svg{width:18px;height:18px;stroke-width:1.5}
  [data-theme="dark"] .i-moon{display:none}
  [data-theme="light"] .i-sun{display:none}

  /* ---------- hero ---------- */
  .hero{text-align:center;padding:96px 24px 64px;max-width:920px;margin:0 auto}
  .hero h1{margin:0 0 20px;font-family:var(--font);font-weight:600;font-size:clamp(2rem,7vw,5rem);line-height:1.1;letter-spacing:-.025em;color:var(--ink)}
  .hero .sub{margin:0 0 40px;font-size:1.125rem;font-weight:500;line-height:1.5;color:var(--steel)}
  .chips{display:flex;flex-wrap:wrap;gap:48px;justify-content:center;align-items:flex-start}
  .chip{display:flex;flex-direction:column;align-items:center;gap:6px;background:none;border:0;padding:0;font-size:.875rem;font-weight:400;line-height:1.5;color:var(--steel)}
  .chip b{font-family:var(--font);font-weight:600;font-size:2.5rem;line-height:1.2;letter-spacing:-.025em;color:var(--ink)}

  /* ---------- toolbar ---------- */
  .toolbar{position:sticky;top:0;z-index:40;background:var(--toolbar-bg);backdrop-filter:var(--toolbar-blur);-webkit-backdrop-filter:var(--toolbar-blur);border-bottom:1px solid var(--hairline);padding:20px 32px}
  .toolbar-inner{max-width:1280px;margin:0 auto;display:flex;flex-direction:column;align-items:center;gap:16px}
  .search-wrap{position:relative;width:min(560px,100%)}
  .search-wrap svg{position:absolute;left:14px;top:50%;transform:translateY(-50%);width:16px;height:16px;color:var(--steel);stroke-width:1.5;pointer-events:none}
  #search{width:100%;height:40px;padding:0 14px 0 40px;border-radius:8px;border:1px solid var(--hairline);background:var(--surface);color:var(--ink);font-family:var(--font);font-size:1rem;line-height:1.5;outline:none;transition:border-color .18s ease}
  #search::placeholder{color:var(--steel)}
  #search:focus{border:2px solid var(--focus);box-shadow:0 0 0 3px var(--ring)}
  .pills{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;max-width:1120px}
  .pill{padding:8px 16px;border-radius:9999px;border:1px solid var(--hairline);background:var(--canvas);color:var(--steel);font-family:var(--font);font-size:.875rem;font-weight:500;line-height:1.5;cursor:pointer;transition:border-color .18s ease,background .18s ease,color .18s ease;white-space:nowrap}
  .pill:hover{border-color:var(--muted);color:var(--ink)}
  .pill.active{background:var(--accent);border-color:var(--accent);color:var(--accent-ink)}
  .count{margin:0;font-size:.8125rem;line-height:1.7;color:var(--steel)}

  /* ---------- grid + cards ---------- */
  .grid{max-width:1280px;margin:0 auto;padding:32px 32px 96px;display:grid;gap:24px;grid-template-columns:1fr}
  @media (min-width:768px){.grid{grid-template-columns:repeat(2,1fr)}}
  @media (min-width:1024px){.grid{grid-template-columns:repeat(3,1fr)}}
  @media (min-width:1280px){.grid{grid-template-columns:repeat(4,1fr)}}

  .card{
    display:flex;flex-direction:column;
    background:var(--card-bg);border:1px solid var(--hairline);border-radius:16px;overflow:hidden;
    transition:border-color .18s ease;
    content-visibility:auto;contain-intrinsic-size:auto 460px;
  }
  .card:hover{border-color:var(--muted)}

  .thumb{position:relative;aspect-ratio:8/5;overflow:hidden;border-bottom:1px solid var(--hairline);background:var(--surface-soft)}
  .thumb[data-slug]{cursor:pointer}
  .thumb-frame{position:absolute;top:50%;left:50%;width:1440px;height:900px;transform:translate(-50%,-50%) scale(.289);transform-origin:center center;border:0;pointer-events:none;z-index:1;background:#fff}
  .thumb-ph{position:absolute;inset:0;z-index:2;transition:opacity .4s ease;pointer-events:none}
  .thumb.loaded .thumb-ph{opacity:0}
  .thumb-overlay{position:absolute;inset:0;z-index:3;display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity .18s ease;background:rgba(10,10,10,.32);pointer-events:none}
  .thumb[data-slug]:hover .thumb-overlay,.thumb[data-slug]:focus-visible .thumb-overlay{opacity:1}
  .overlay-chip{padding:10px 20px;border-radius:9999px;background:#fff;border:1px solid var(--hairline);color:var(--ink);font-size:.875rem;font-weight:600;line-height:1.4}
  .thumb-poster{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px}
  .poster-letter{font-family:var(--font);font-weight:600;font-size:4rem;line-height:1.1;letter-spacing:-.025em;color:#fff}
  .poster-note{font-size:.8125rem;line-height:1.5;color:#fff;background:rgba(10,10,10,.28);padding:4px 12px;border-radius:9999px}

  .card-body{padding:20px 20px 24px;display:flex;flex-direction:column;gap:8px;flex:1}
  .card-head{display:flex;align-items:center;gap:10px;min-width:0}
  .swatch{width:14px;height:14px;border-radius:9999px;flex:none;box-shadow:inset 0 0 0 1px rgba(10,10,10,.12)}
  .card-name{margin:0;font-family:var(--font);font-weight:600;font-size:1.25rem;line-height:1.4;letter-spacing:-.01em;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .card-cat{margin:0;font-size:.875rem;line-height:1.5;color:var(--steel)}
  .card-desc{margin:0;font-size:.875rem;line-height:1.5;color:var(--slate);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;min-height:2.6em}
  .badges{display:flex;flex-wrap:wrap;gap:6px}
  .badge{font-size:.75rem;font-weight:600;line-height:1.5;padding:2px 8px;border-radius:6px;background:var(--chip-bg);color:var(--chip-ink)}
  .actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:auto;padding-top:16px;border-top:1px solid var(--hairline-soft)}
  .btn{display:inline-flex;align-items:center;gap:5px;padding:8px 16px;border-radius:9999px;border:1px solid var(--hairline);background:var(--control-bg);color:var(--ink);font-family:var(--font);font-size:.875rem;font-weight:600;line-height:1.4;text-decoration:none;cursor:pointer;transition:border-color .18s ease,background .18s ease;white-space:nowrap}
  .btn:hover{border-color:var(--muted)}
  .btn-primary{background:var(--accent);border-color:var(--accent);color:var(--accent-ink)}
  .btn-primary:hover{background:var(--accent-hover);border-color:var(--accent-hover)}

  .empty{text-align:center;color:var(--steel);padding:96px 24px;font-size:1rem;line-height:1.5}

  footer{background:var(--footer-bg);color:var(--footer-dim);padding:64px 32px;text-align:center;font-size:.875rem;line-height:1.5}
  footer a{color:var(--footer-ink);text-decoration:none}
  footer a:hover{text-decoration:underline}
  footer code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.8125rem;color:var(--footer-dim)}

  /* ---------- preview modal ---------- */
  dialog#preview-modal{width:min(1240px,94vw);padding:0;border:1px solid var(--hairline);border-radius:16px;background:var(--modal-bg);color:var(--ink);box-shadow:var(--modal-shadow);overflow:hidden}
  dialog#preview-modal::backdrop{background:var(--backdrop)}
  .modal-head{display:flex;align-items:center;gap:14px;padding:16px 20px;border-bottom:1px solid var(--hairline);flex-wrap:wrap}
  .modal-title-wrap{flex:1;min-width:180px}
  #modal-title{margin:0;font-family:var(--font);font-size:1.25rem;font-weight:600;line-height:1.4;letter-spacing:-.01em}
  #modal-cat{margin:2px 0 0;font-size:.875rem;line-height:1.5;color:var(--steel)}
  .modal-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}
  .modal-body{height:min(78vh,840px)}
  #modal-frame{display:block;width:100%;height:100%;border:0;background:#fff}

  @media (max-width:767px){
    .topbar{padding:0 20px}
    .toolbar{padding:16px 20px}
    .grid{padding:24px 20px 64px;gap:16px}
    .hero{padding:56px 20px 40px}
    .hero h1{font-size:2.5rem}
    .chips{gap:32px}
    .icon-btn{width:44px;height:44px}
    .icon-btn svg{width:20px;height:20px}
  }
  @media (max-width:620px){
    .pills{flex-wrap:nowrap;overflow-x:auto;justify-content:flex-start;max-width:100%;padding-bottom:4px;scrollbar-width:none}
    .pills::-webkit-scrollbar{display:none}
    .hero h1{font-size:2rem}
    .chip b{font-size:2rem}
    .chips{gap:24px}
  }
  /* Short viewports: keep the sticky toolbar compact (single scrollable pill row) */
  @media (max-height:860px) and (min-width:621px){
    .pills{flex-wrap:nowrap;overflow-x:auto;justify-content:flex-start;max-width:100%;padding-bottom:4px;scrollbar-width:none}
    .pills::-webkit-scrollbar{display:none}
  }
  @media (prefers-reduced-motion:reduce){
    html{scroll-behavior:auto}
    .card,.btn,.pill,.icon-btn{transition:none}
  }
</style>
</head>
<body>

<header class="topbar">
  <a class="logo" href="./">our design<em>.md</em></a>
  <div class="topbar-actions">
  <button id="lang-toggle" class="icon-btn lang-btn" type="button" aria-label="切换语言 / Switch language"><span id="lang-label">中</span></button>
  <button id="theme-toggle" class="icon-btn" type="button" aria-label="切换主题 / Toggle theme" aria-pressed="false">
    <svg class="i-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>
    <svg class="i-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
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
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
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
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>
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

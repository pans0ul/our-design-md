#!/usr/bin/env node
/**
 * generate-previews.mjs
 *
 * Generates a self-contained `preview.html` design-token catalog for every
 * brand folder in TARGETS that does not already have one.
 *
 * - Parses `design-md/<slug>/DESIGN.md` (YAML frontmatter or prose) to extract
 *   colors, fonts, radii, spacing and light/dark canvas.
 * - Cross-references `data/index.json` for name / url / primaryColor.
 * - Writes `design-md/<slug>/preview.html` (idempotent: skips existing files).
 *
 * Usage: node scripts/generate-previews.mjs
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DESIGN_DIR = join(ROOT, 'design-md');

const TARGETS = [
  'jobright', 'oracle', 'sap', 'binance', 'mastercard', 'mercury', 'nerdwallet',
  'meta', 'mydealz', 'nike', 'shopify', 'starbucks', '1win', 'aljazeera', 'dji',
  'hp', 'oura', 'playstation', 'slack', 'theverge', 'vodafone', 'wired',
  'bmw-m', 'bugatti', 'ferrari', 'lamborghini', 'renault', 'tesla',
  'dell-1996', 'nintendo-2001',
];

/* ------------------------------------------------------------------ */
/* Small utilities                                                     */
/* ------------------------------------------------------------------ */

const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const stripQuotes = (v) => {
  const t = v.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1).trim();
  }
  return t;
};

const titleize = (key) => key
  .replace(/[-_]/g, ' ')
  .replace(/\b\w/g, (c) => c.toUpperCase());

/** Simple weighted luminance 0..1 (good enough for theme decisions). */
function luminance(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return 1;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

function hexToRgbTriplet(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return '0,0,0';
  const n = parseInt(m[1], 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}

const onColor = (bgHex) => (luminance(bgHex) > 0.56 ? '#111111' : '#ffffff');

const isHex = (v) => /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v.trim());

/** Normalize #abc → #aabbcc for dedupe/luminance. */
const normHex = (v) => {
  const t = v.trim().replace(/^#/, '');
  return t.length === 3 ? t.split('').map((c) => c + c).join('') : t.toLowerCase();
};

/* ------------------------------------------------------------------ */
/* Frontmatter (mini-YAML) parser                                      */
/* ------------------------------------------------------------------ */

function parseFrontmatter(md) {
  if (!md.startsWith('---')) return null;
  const end = md.indexOf('\n---', 3);
  if (end === -1) return null;
  const lines = md.slice(4, end).split('\n');
  const root = {};
  const stack = []; // { indent, key }
  for (const line of lines) {
    const m = /^(\s*)([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!m) continue;
    const indent = m[1].length;
    const key = m[2];
    let raw = m[3].trim();
    // extract quoted value, else strip trailing "# comment"
    const qm = /^(["'])(.*?)\1/.exec(raw);
    let val = qm ? qm[2].trim() : raw.replace(/\s+#.*$/, '').trim();
    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
    if (val === '') {
      stack.push({ indent, key });
    } else {
      let obj = root;
      for (const s of stack) {
        obj[s.key] = obj[s.key] || {};
        obj = obj[s.key];
      }
      obj[key] = val;
    }
  }
  return root;
}

/** Resolve "{section.key}" token references against the frontmatter root. */
function resolveRef(fm, value) {
  const m = /^\{([a-z-]+)\.([a-z0-9-]+)\}$/.exec(String(value).trim());
  if (!m) return value;
  const sec = fm[m[1]];
  return sec && sec[m[2]] !== undefined ? sec[m[2]] : value;
}

/* ------------------------------------------------------------------ */
/* Prose parser                                                        */
/* ------------------------------------------------------------------ */

function parseProseColors(md) {
  const out = [];
  const seen = new Set();
  const lines = md.split('\n');
  for (const line of lines) {
    // find hex codes in document order
    const re = /#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g;
    let match;
    const names = [...line.matchAll(/\*\*([^*]+)\*\*\s*[(`]/g)].map((x) => x[1].trim());
    let ni = 0;
    while ((match = re.exec(line)) !== null) {
      const hex = match[0];
      const key = normHex(hex);
      if (seen.has(key)) continue;
      seen.add(key);
      // associate a bold name on the same line if one precedes this hex
      const before = line.slice(0, match.index);
      const nameMatch = [...before.matchAll(/\*\*([^*]+)\*\*/g)].pop();
      const name = nameMatch ? nameMatch[1].replace(/\s*\(.*$/, '').trim() : (names[ni++] || null);
      out.push({ name, value: hex });
      if (out.length >= 16) return out;
    }
  }
  return out;
}

function extractProseSection(md, headingRe) {
  const lines = md.split('\n');
  let start = -1, level = 0;
  for (let i = 0; i < lines.length; i++) {
    const h = /^(#{1,6})\s+(.*)$/.exec(lines[i]);
    if (h && headingRe.test(h[2])) { start = i; level = h[1].length; break; }
  }
  if (start === -1) return '';
  const out = [];
  for (let i = start + 1; i < lines.length; i++) {
    const h = /^(#{1,6})\s+/.exec(lines[i]);
    if (h && h[1].length <= level) break;
    out.push(lines[i]);
  }
  return out.join('\n');
}

function parseProseFonts(md, slug) {
  // Verified font names for prose-format brands (their font names are bolded,
  // not backticked, so generic extraction is unreliable).
  const KNOWN = {
    mastercard: ['MarkForMC'],
    starbucks: ['SoDoSans', 'Lander Tall', 'Kalam'],
    theverge: ['Manuka', 'PolySans', 'PolySans Mono'],
    lamborghini: ['LamboType', 'Open Sans'],
    tesla: ['Universal Sans Display', 'Universal Sans Text'],
  };
  if (KNOWN[slug]) return KNOWN[slug];
  const sec = extractProseSection(md, /font famil|typography/i);
  const tokens = [...sec.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
  const names = [];
  for (const t of tokens) {
    for (const part of t.split(',')) {
      const n = stripQuotes(part).trim();
      if (!n || /^(sans-serif|serif|monospace|-apple-system|system-ui|ui-[a-z-]+|helvetica|arial|georgia|courier.*|impact)$/i.test(n)) continue;
      if (!names.includes(n)) names.push(n);
    }
    if (names.length >= 3) break;
  }
  return names;
}

function parseProseRadii(md) {
  // Prefer a dedicated "Border Radius Scale" section.
  const sec = extractProseSection(md, /border radius/i);
  const source = sec || md;
  const vals = [];
  const push = (v) => { if (!vals.includes(v) && vals.length < 8) vals.push(v); };
  const re = /(\d+(?:\.\d+)?)\s*(px|%)/gi;
  let m;
  const scoped = sec ? sec : md.split('\n').filter((l) => /radius/i.test(l)).join('\n');
  while ((m = re.exec(scoped)) !== null) {
    if (m[2].toLowerCase() === 'px' && m[1] === '1') continue; // 1px is a border width, not a radius
    push(m[1] + m[2].toLowerCase());
  }
  if (!vals.length && /zero|no border[- ]radius|sharp/i.test(scoped)) push('0px');
  return vals;
}

function parseProseTypeRows(md) {
  const sec = extractProseSection(md, /hierarchy/i);
  if (!sec) return [];
  const rows = [];
  for (const line of sec.split('\n')) {
    if (!/^\s*\|/.test(line) || /^\s*\|[\s|-]+\|/.test(line)) continue;
    const cells = line.split('|').map((c) => c.trim()).filter((c) => c !== '');
    if (cells.length < 3) continue;
    if (/^role/i.test(cells[0])) continue;
    const sizeM = /(\d+(?:\.\d+)?)\s*px/.exec(cells[1] || '');
    if (!sizeM) continue;
    const weightM = /(\d{3})/.exec(cells[2] || '');
    const lhM = /\(?\s*(\d\.\d+)/.exec(cells[3] || '');
    const lsM = /(-?\d+(?:\.\d+)?)\s*px/.exec(cells[4] || '');
    rows.push({
      role: cells[0],
      fontSize: sizeM[1] + 'px',
      fontWeight: weightM ? weightM[1] : '400',
      lineHeight: lhM ? lhM[1] : '1.3',
      letterSpacing: lsM ? lsM[1] + 'px' : '0',
    });
    if (rows.length >= 8) break;
  }
  return rows;
}

function parseProseCanvas(md, colors) {
  const lines = md.split('\n');
  // 1) a line where a hex code and a canvas/background phrase sit close
  //    together (either order, max 80 chars apart) — take the closest pair
  for (const line of lines.slice(0, 140)) {
    if (!/canvas|page background/i.test(line)) continue;
    const phrases = [...line.matchAll(/canvas|page background/gi)].map((m) => ({ i: m.index }));
    const hexes = [...line.matchAll(/#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g)].map((m) => ({ i: m.index, v: m[0] }))
      .filter((h) => isHex(h.v));
    let best = null, bestDist = Infinity;
    for (const p of phrases) for (const h of hexes) {
      const d = Math.abs(p.i - h.i);
      if (d < bestDist) { bestDist = d; best = h.v; }
    }
    if (best && bestDist <= 80) return best;
  }
  // 2) named color about canvas/background
  const named = colors.find((c) => c.name && /canvas|background|surface/i.test(c.name) && isHex(c.value));
  if (named) return named.value;
  // 3) first light-ish color, else white
  const light = colors.find((c) => isHex(c.value) && luminance(c.value) > 0.8);
  return light ? light.value : '#ffffff';
}

function parseProseShadows(md) {
  const out = [];
  const res = [
    /rgba?\([^)]*\)\s*(-?[\d.]+px)\s+(-?[\d.]+px)(?:\s+(-?[\d.]+px))?/g,
    /(-?[\d.]+px)\s+(-?[\d.]+px)(?:\s+(-?[\d.]+px))?\s+rgba?\([^)]*\)/g,
  ];
  const usable = (shadow) => {
    if (/rgba?\(\s*\d+,\s*\d+,\s*\d+,\s*0\s*\)/.test(shadow)) return false; // fully transparent
    const nums = shadow.match(/-?[\d.]+px/g) || [];
    return nums.some((n) => parseFloat(n) !== 0); // at least one non-zero offset/blur
  };
  for (const re of res) {
    let m;
    while ((m = re.exec(md)) !== null) {
      const rgba = /rgba?\([^)]*\)/.exec(m[0]);
      if (!rgba) continue;
      const parts = [m[1], m[2], m[3]].filter(Boolean).join(' ');
      const shadow = rgba[0].includes('rgba') && rgba[0] === m[0].slice(0, rgba[0].length)
        ? `${rgba[0]} ${parts}`
        : `${parts} ${rgba[0]}`;
      if (!out.includes(shadow) && usable(shadow)) out.push(shadow);
      if (out.length >= 2) return out;
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Font resolution (custom brand fonts → Google Fonts proxies)         */
/* ------------------------------------------------------------------ */

const GF = {
  'Titillium Web': [400, 600, 700],
  'Inter': [400, 500, 600, 700],
  'Roboto': [400, 500, 700],
  'Open Sans': [400, 600, 700],
  'Source Sans 3': [400, 600, 700],
  'Barlow': [400, 500, 700],
  'Sora': [400, 600, 700],
  'Archivo': [400, 500, 700],
  'Archivo Black': [400],
  'Jost': [400, 500, 700],
  'Poppins': [400, 500, 600, 700],
  'Figtree': [400, 500, 700],
  'Manrope': [400, 500, 700],
  'Work Sans': [400, 500, 700],
  'Karla': [400, 500, 700],
  'Mukta': [400, 500, 700],
  'IBM Plex Sans': [400, 500, 600, 700],
  'Space Grotesk': [400, 500, 700],
  'Space Mono': [400, 700],
  'Anton': [400],
  'Oswald': [400, 500, 600],
  'Bodoni Moda': [400, 700],
  'Fraunces': [400, 600],
  'Lora': [400, 700],
  'Plus Jakarta Sans': [400, 500, 700],
  'Kalam': [400, 700],
};

/** substring-of-font-name → Google Fonts proxy family */
const PROXY = [
  [/titillium/, 'Titillium Web'],
  [/inter/, 'Inter'],
  [/^roboto$/, 'Roboto'],
  [/open sans/, 'Open Sans'],
  [/oracle sans/, 'Source Sans 3'],
  [/72 brand/, 'Barlow'],
  [/arcadiadisplay|arcadia display/, 'Sora'],
  [/arcadia/, 'Inter'],
  [/nike futura/, 'Archivo Black'],
  [/helvetica now display/, 'Archivo'],
  [/helvetica/, null],
  [/forma/, 'Jost'],
  [/editorial new/, 'Fraunces'],
  [/akkurat/, 'Work Sans'],
  [/sst|playstation/, 'Mukta'],
  [/vodafone/, 'Poppins'],
  [/wireddisplay|wired display/, 'Bodoni Moda'],
  [/apercu/, 'Karla'],
  [/brevetext|breve text/, 'Lora'],
  [/bmwtypenext/, 'Inter'],
  [/bugatti/, 'Jost'],
  [/ferrarisans|ferrari sans/, 'Barlow'],
  [/nouvelr|nouvel r/, 'Archivo'],
  [/optimistic/, 'Manrope'],
  [/averta/, 'Figtree'],
  [/binance/, 'IBM Plex Sans'],
  [/neuehaas|neue haas/, 'Archivo'],
  [/salesforce-avant/, 'Space Grotesk'],
  [/salesforce/, 'Inter'],
  [/sodo/, 'Plus Jakarta Sans'],
  [/markformc|mark for mc/, 'Jost'],
  [/manuka/, 'Anton'],
  [/polysans mono/, 'Space Mono'],
  [/polysans/, 'Space Grotesk'],
  [/universal sans/, 'Archivo'],
  [/lambotype|lambo type/, 'Oswald'],
  [/lander/, 'Lora'],
  [/kalam/, 'Kalam'],
  [/georgia|times|garamond|baskerville/, null], // system serif
];

function proxyFor(name) {
  const key = name.toLowerCase().replace(/[\s_-]/g, '').replace(/[\s_-]/g, '');
  const k = name.toLowerCase();
  for (const [re, gf] of PROXY) {
    if (re.test(k) || re.test(key)) return gf;
  }
  return null;
}

const SERINE_RE = /georgia|serif|times|garamond|baskerville|bodoni|playfair|fraunces|lora|editorial/i;

function buildStack(primaryName, proxy) {
  const serif = SERINE_RE.test(primaryName) || (proxy && SERINE_RE.test(proxy) && /Bodoni|Fraunces|Lora/.test(proxy));
  const fallback = serif
    ? "Georgia, 'Times New Roman', serif"
    : "system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif";
  const parts = [];
  if (primaryName) parts.push(`'${primaryName.replace(/'/g, '')}'`);
  if (proxy) parts.push(`'${proxy}'`);
  return parts.concat(fallback).join(', ');
}

function resolveFonts(rawFamilies) {
  // rawFamilies: array of raw fontFamily strings (may include fallbacks)
  const primaries = [];
  for (const raw of rawFamilies) {
    const first = stripQuotes(String(raw).split(',')[0]).trim();
    if (first && !primaries.includes(first)) primaries.push(first);
  }
  const display = primaries[0] || 'system-ui';
  const text = primaries[1] || primaries[0] || 'system-ui';
  const monoish = primaries.find((f) => /mono|code/i.test(f));
  const dProxy = proxyFor(display);
  const tProxy = proxyFor(text);
  const mProxy = monoish ? (proxyFor(monoish) === 'Space Mono' ? 'Space Mono' : null) : null;
  const google = new Set();
  for (const p of [dProxy, tProxy, mProxy]) if (p && GF[p]) google.add(p);
  return {
    displayStack: buildStack(display, dProxy),
    textStack: buildStack(text, tProxy),
    monoStack: `'${(monoish || 'ui-monospace').replace(/'/g, '')}', ${mProxy ? `'${mProxy}', ` : ''}ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`,
    google: [...google],
    displayName: display,
  };
}

function googleFontsLink(families) {
  if (!families.length) return '';
  const q = families.map((f) => `family=${f.replace(/ /g, '+')}:wght@${GF[f].join(';')}`).join('&amp;');
  return `<link rel="preconnect" href="https://fonts.googleapis.com">\n<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n<link href="https://fonts.googleapis.com/css2?${q}&amp;display=swap" rel="stylesheet">`;
}

/* ------------------------------------------------------------------ */
/* Token extraction per brand                                          */
/* ------------------------------------------------------------------ */

function extractTokens(slug, md, meta) {
  const fm = parseFrontmatter(md);
  const colors = []; // {name, value} in document order
  let fonts = [];
  let radii = [];
  let spacing = [];
  let typeRows = [];
  let canvas = null;
  let btnRadius = null;
  let cardRadius = null;
  let inputRadius = null;
  let shadows = [];

  if (fm) {
    const cmap = fm.colors || {};
    for (const [k, v] of Object.entries(cmap)) {
      if (typeof v === 'string' && (isHex(v) || /^rgba?\(/i.test(v))) colors.push({ name: titleize(k), value: v });
    }
    const typ = fm.typography || {};
    const fams = [];
    for (const role of Object.keys(typ)) {
      const f = typ[role] && typ[role].fontFamily;
      if (f && !fams.includes(f)) fams.push(f);
    }
    fonts = fams;
    const rounded = fm.rounded || {};
    radii = Object.entries(rounded).map(([, v]) => String(v));
    spacing = Object.entries(fm.spacing || {}).map(([, v]) => String(v));
    // component-driven radii
    const comp = fm.components || {};
    const ref = (v) => (v !== undefined ? resolveRef(fm, v) : undefined);
    btnRadius = ref(comp['button-primary'] && comp['button-primary'].rounded)
      || ref(comp['button'] && comp['button'].rounded)
      || radii.find((r) => /pill|btn|button/i.test(r)) || radii[0] || '8px';
    cardRadius = ref(comp['card'] && comp['card'].rounded)
      || (() => { const mid = radii.find((r) => { const n = parseFloat(r); return !/%/.test(r) && n >= 8 && n <= 40; }); return mid || radii[0] || '12px'; })();
    inputRadius = ref(comp['text-input'] && comp['text-input'].rounded)
      || radii.find((r) => /input|sm|md/i.test(r)) || radii[0] || '8px';
    canvas = (cmap.canvas && isHex(cmap.canvas) && cmap.canvas)
      || (cmap['canvas-dark'] && isHex(cmap['canvas-dark']) && cmap['canvas-dark'])
      || (cmap.background && isHex(cmap.background) && cmap.background)
      || (cmap['canvas-light'] && isHex(cmap['canvas-light']) && cmap['canvas-light'])
      || '#ffffff';
    // typography specimen rows from frontmatter roles
    const pick = (...names) => {
      for (const n of names) if (typ[n]) return { role: n, ...typ[n] };
      return null;
    };
    const roles = [
      pick('display', 'hero', 'heading-1'),
      pick('heading-1', 'heading-2', 'display'),
      pick('heading-2', 'heading-3', 'heading-1'),
      pick('body-md', 'body-lg', 'body', 'body-default'),
      pick('caption', 'body-sm', 'label', 'badge'),
    ].filter(Boolean);
    typeRows = roles.map((r) => ({
      role: titleize(r.role),
      fontSize: r.fontSize || '16px',
      fontWeight: String(r.fontWeight || '400'),
      lineHeight: String(r.lineHeight || '1.4'),
      letterSpacing: String(r.letterSpacing || '0'),
      fontFamily: r.fontFamily,
    }));
    shadows = parseProseShadows(md);
  } else {
    colors.push(...parseProseColors(md));
    fonts = parseProseFonts(md, slug);
    radii = parseProseRadii(md);
    typeRows = parseProseTypeRows(md);
    canvas = parseProseCanvas(md, colors);
    shadows = parseProseShadows(md);
    // button/card radius: iterate lines mentioning radius + button|CTA / card,
    // keep the px value closest to the word "radius" on the first line that has one
    const pxNearRadius = (line) => {
      const ri = line.toLowerCase().indexOf('radius');
      if (ri === -1) return null;
      let best = null, bestDist = Infinity;
      for (const mm of line.matchAll(/(\d+(?:\.\d+)?)\s*px/g)) {
        const d = Math.abs(mm.index - ri);
        if (d < bestDist) { bestDist = d; best = mm[1] + 'px'; }
      }
      return best;
    };
    const findRadiusLine = (contextRe) => {
      for (const l of md.split('\n')) {
        if (!/radius/i.test(l) || !contextRe.test(l)) continue;
        const px = pxNearRadius(l);
        if (px) return px;
      }
      return null;
    };
    const midRadius = () => {
      const mid = radii.find((r) => { const n = parseFloat(r); return /%/.test(r) === false && n >= 8 && n <= 32; });
      return mid || radii[0] || '12px';
    };
    btnRadius = findRadiusLine(/button|cta/i) || midRadius();
    const zeroCard = md.split('\n').some((l) => /card/i.test(l) && /radius/i.test(l) && /zero|sharp|no rounded/i.test(l));
    cardRadius = findRadiusLine(/card/i) || (zeroCard ? '0px' : midRadius());
    inputRadius = radii.find((r) => parseFloat(r) <= 12) || radii[0] || '8px';
    // type rows fallback
    if (!typeRows.length) {
      typeRows = [
        { role: 'Display', fontSize: '56px', fontWeight: '700', lineHeight: '1.1', letterSpacing: '-1px' },
        { role: 'Heading', fontSize: '36px', fontWeight: '700', lineHeight: '1.2', letterSpacing: '-0.5px' },
        { role: 'Subhead', fontSize: '24px', fontWeight: '600', lineHeight: '1.3', letterSpacing: '0' },
        { role: 'Body', fontSize: '16px', fontWeight: '400', lineHeight: '1.6', letterSpacing: '0' },
        { role: 'Caption', fontSize: '13px', fontWeight: '500', lineHeight: '1.4', letterSpacing: '0' },
      ];
    }
  }

  // ensure primaryColor present in palette
  if (meta.primaryColor && isHex(meta.primaryColor)) {
    const key = normHex(meta.primaryColor);
    if (!colors.some((c) => isHex(c.value) && normHex(c.value) === key)) {
      colors.unshift({ name: 'Primary', value: meta.primaryColor });
    }
  }

  const dark = luminance(canvas) < 0.45;
  return { fm, colors, fonts, radii, spacing, typeRows, canvas, dark, btnRadius, cardRadius, inputRadius, shadows };
}

/* ------------------------------------------------------------------ */
/* Theme derivation                                                    */
/* ------------------------------------------------------------------ */

function deriveTheme(tokens, meta) {
  const { colors, canvas, dark } = tokens;
  const hexColors = colors.filter((c) => isHex(c.value));
  const byName = (re) => hexColors.find((c) => c.name && re.test(c.name.toLowerCase()));

  const text = dark
    ? ((byName(/on[- ]?dark|^white/) || {}).value || '#ffffff')
    : ((byName(/^(ink|text)$/) || byName(/ink|text|heading/) || {}).value
      || hexColors.filter((c) => luminance(c.value) < 0.35).sort((a, b) => luminance(a.value) - luminance(b.value))[0]?.value
      || '#111111');
  const muted = (byName(/muted|secondary|gray|grey|placeholder/) || {}).value
    || (dark ? 'rgba(255,255,255,0.62)' : 'rgba(0,0,0,0.56)');
  const surface = (byName(/^(surface|card|panel|overlay)/) || {}).value
    || (dark ? (luminance(canvas) < 0.08 ? '#16181d' : '#202020') : '#ffffff');
  const primary = isHex(meta.primaryColor) ? meta.primaryColor : '#0055ff';
  const border = dark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.10)';
  const borderStrong = dark ? 'rgba(255,255,255,0.28)' : 'rgba(0,0,0,0.22)';

  const shadows = tokens.shadows.length
    ? tokens.shadows
    : (dark
      ? ['0 1px 2px rgba(0,0,0,0.5)', '0 12px 32px rgba(0,0,0,0.55)']
      : ['0 1px 3px rgba(0,0,0,0.08)', '0 12px 32px rgba(0,0,0,0.12)']);

  return { text, muted, surface, primary, border, borderStrong, shadows, onPrimary: onColor(primary) };
}

/* ------------------------------------------------------------------ */
/* Style variants                                                      */
/* ------------------------------------------------------------------ */

const VARIANTS = {
  retro: ['dell-1996', 'nintendo-2001'],
  luxury: ['bmw-m', 'bugatti', 'lamborghini', 'ferrari'],
  bold: ['theverge', 'wired', 'nike'],
};
const variantFor = (slug) =>
  (VARIANTS.retro.includes(slug) && 'retro')
  || (VARIANTS.luxury.includes(slug) && 'luxury')
  || (VARIANTS.bold.includes(slug) && 'bold')
  || 'clean';

/* ------------------------------------------------------------------ */
/* HTML generation                                                     */
/* ------------------------------------------------------------------ */

function clampFont(sizePx) {
  const n = parseFloat(sizePx);
  if (!isFinite(n) || n < 30) return `${sizePx}`;
  const vw = Math.round((n / 14.4) * 10) / 10;
  return `clamp(26px, ${vw}vw, ${n}px)`;
}

function typeRowHtml(row, fontStack, mono) {
  const ls = row.letterSpacing && row.letterSpacing !== '0' ? `letter-spacing:${row.letterSpacing};` : '';
  const sample = row.role.toLowerCase().includes('display') || parseFloat(row.fontSize) >= 40
    ? 'Design Language'
    : 'The quick brown fox jumps over 0123456789';
  return `<div class="type-row">
    <div class="type-sample" style="font-family:${fontStack};font-size:${clampFont(row.fontSize)};font-weight:${row.fontWeight};line-height:${row.lineHeight};${ls}">${esc(sample)}</div>
    <div class="type-meta">${esc(row.role)} &mdash; ${esc(row.fontSize)} / ${esc(row.fontWeight)} / ${esc(row.lineHeight)}${row.letterSpacing !== '0' ? ' / ' + esc(row.letterSpacing) : ''}</div>
  </div>`;
}

function generate(slug, meta, categoryLabel) {
  const mdPath = join(DESIGN_DIR, slug, 'DESIGN.md');
  const md = readFileSync(mdPath, 'utf8');
  const tokens = extractTokens(slug, md, meta);
  const theme = deriveTheme(tokens, meta);
  const variant = variantFor(slug);
  const fonts = resolveFonts(tokens.fonts.length ? tokens.fonts : (tokens.fm ? Object.values(tokens.fm.typography || {}).map((t) => t.fontFamily).filter(Boolean) : []));
  const gfLink = googleFontsLink(fonts.google);

  const rgb = hexToRgbTriplet(theme.primary);
  const dark = tokens.dark;
  const name = meta.name || titleize(slug);
  const visit = meta.url ? `\n    <a class="visit" href="${esc(meta.url)}" target="_blank" rel="noopener">Visit site &#8599;</a>` : '';

  // ---- palette swatches (cap 14) ----
  const swatches = tokens.colors.slice(0, 14).map((c) => {
    const light = isHex(c.value) && luminance(c.value) > 0.92;
    const edge = light ? 'border-bottom:1px solid var(--border);' : '';
    return `<div class="swatch"><div class="swatch-block" style="background:${esc(c.value)};${edge}"></div><div class="swatch-info"><div class="swatch-name">${esc(c.name || 'Color')}</div><div class="swatch-hex">${esc(c.value)}</div></div></div>`;
  }).join('\n    ');

  // ---- typography rows ----
  const typeRows = tokens.typeRows.slice(0, 5).map((row) => {
    const isMono = /mono|code|badge|label|caption/i.test(row.role) && /mono/i.test(row.fontFamily || '');
    const stack = isMono ? fonts.monoStack
      : (parseFloat(row.fontSize) >= 32 || /display|heading/i.test(row.role) ? fonts.displayStack : fonts.textStack);
    return typeRowHtml(row, stack);
  }).join('\n    ');

  // ---- radii chips ----
  const radii = (tokens.radii.length ? tokens.radii : ['4px', '8px', '12px', '16px']).slice(0, 7);
  const radiusChips = radii.map((r) => `<div class="radius-item"><div class="radius-box" style="border-radius:${esc(r)}"></div><div class="radius-label">${esc(r)}</div></div>`).join('\n      ');

  // ---- spacing strip (frontmatter brands) ----
  const spacingStrip = tokens.spacing.length
    ? `<div class="sub-label">Spacing scale</div><div class="spacing-row">${tokens.spacing.slice(0, 8).map((s) => {
      const px = parseFloat(s) || 4;
      return `<div class="spacing-item"><div class="spacing-block" style="width:${Math.min(px, 96)}px"></div><div class="spacing-value">${esc(s)}</div></div>`;
    }).join('')}</div>`
    : '';

  // ---- elevation ----
  const elevation = `<div class="sub-label">Elevation</div><div class="elevation-grid">
        <div class="elev-card" style="box-shadow:none"><div class="elev-name">Flat</div><div class="elev-desc">no shadow</div></div>
        <div class="elev-card" style="box-shadow:${esc(theme.shadows[0])}"><div class="elev-name">Raised</div><div class="elev-desc">${esc(theme.shadows[0])}</div></div>
        <div class="elev-card" style="box-shadow:${esc(theme.shadows[1] || theme.shadows[0])}"><div class="elev-name">Floating</div><div class="elev-desc">${esc(theme.shadows[1] || theme.shadows[0])}</div></div>
      </div>`;

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(name)} &mdash; Design Token Catalog</title>
${gfLink}
<style>
  :root {
    --bg: ${tokens.canvas};
    --surface: ${theme.surface};
    --text: ${theme.text};
    --muted: ${theme.muted};
    --border: ${theme.border};
    --border-strong: ${theme.borderStrong};
    --primary: ${theme.primary};
    --on-primary: ${theme.onPrimary};
    --primary-rgb: ${rgb};
    --r-btn: ${tokens.btnRadius};
    --r-card: ${tokens.cardRadius};
    --r-input: ${tokens.inputRadius};
    --shadow-1: ${theme.shadows[0]};
    --shadow-2: ${theme.shadows[1] || theme.shadows[0]};
    --font-display: ${fonts.displayStack};
    --font-text: ${fonts.textStack};
    --font-mono: ${fonts.monoStack};
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--text); font: 16px/1.6 var(--font-text); -webkit-font-smoothing: antialiased; }
  a { color: inherit; }

  .masthead { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 18px 32px; border-bottom: 1px solid var(--border); }
  .brand { font-family: var(--font-display); font-size: 19px; font-weight: 700; letter-spacing: -0.01em; }
  .masthead-right { display: flex; align-items: center; gap: 14px; }
  .cat-chip { font-family: var(--font-mono); font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); border: 1px solid var(--border); border-radius: 999px; padding: 4px 10px; }
  .visit { font-size: 14px; font-weight: 600; text-decoration: none; color: var(--primary); }
  .visit:hover { text-decoration: underline; }

  .intro { max-width: 1080px; margin: 0 auto; padding: 64px 32px 48px; }
  .kicker { font-family: var(--font-mono); font-size: 12px; text-transform: uppercase; letter-spacing: 0.14em; color: var(--muted); margin-bottom: 14px; }
  .intro h1 { margin: 0 0 16px; font-family: var(--font-display); font-size: ${clampFont('56px')}; font-weight: 700; line-height: 1.05; letter-spacing: -0.02em; }
  .intro p { margin: 0; max-width: 640px; color: var(--muted); font-size: 17px; }

  section { max-width: 1080px; margin: 0 auto; padding: 48px 32px; border-top: 1px solid var(--border); }
  .sec-label { font-family: var(--font-mono); font-size: 12px; text-transform: uppercase; letter-spacing: 0.14em; color: var(--muted); margin-bottom: 6px; }
  .sec-title { margin: 0 0 28px; font-family: var(--font-display); font-size: 28px; font-weight: 700; letter-spacing: -0.01em; }
  .sub-label { font-family: var(--font-mono); font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--muted); margin: 28px 0 12px; }

  /* colors */
  .swatches { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; }
  .swatch { border: 1px solid var(--border); border-radius: var(--r-card); overflow: hidden; background: var(--surface); }
  .swatch-block { height: 64px; }
  .swatch-info { padding: 9px 11px; }
  .swatch-name { font-size: 13px; font-weight: 600; }
  .swatch-hex { font-family: var(--font-mono); font-size: 11px; color: var(--muted); margin-top: 2px; }

  /* typography */
  .type-row { padding: 18px 0; border-bottom: 1px solid var(--border); }
  .type-row:last-child { border-bottom: none; }
  .type-sample { overflow-wrap: break-word; }
  .type-meta { font-family: var(--font-mono); font-size: 11px; color: var(--muted); margin-top: 6px; }

  /* buttons */
  .btn-row { display: flex; gap: 16px; flex-wrap: wrap; align-items: flex-start; }
  .btn-item { text-align: center; }
  .btn { display: inline-block; font-family: var(--font-text); font-size: 15px; font-weight: 600; padding: 11px 24px; border-radius: var(--r-btn); text-decoration: none; cursor: pointer; transition: filter .15s, transform .15s; }
  .btn-primary { background: var(--primary); color: var(--on-primary); border: none; }
  .btn-primary:hover { filter: brightness(1.08); }
  .btn-outline { background: transparent; color: var(--text); border: 1px solid var(--border-strong); }
  .btn-outline:hover { border-color: var(--text); }
  .btn-ghost { background: transparent; color: var(--primary); border: none; text-decoration: underline; text-underline-offset: 3px; }
  .btn-label { font-family: var(--font-mono); font-size: 11px; color: var(--muted); margin-top: 8px; }

  /* cards + form */
  .demo-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 20px; }
  .card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-card); padding: 24px; box-shadow: var(--shadow-1); }
  .card.elevated { box-shadow: var(--shadow-2); }
  .badge { display: inline-block; font-family: var(--font-mono); font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; padding: 4px 10px; border-radius: 999px; background: rgba(var(--primary-rgb), 0.14); color: var(--primary); margin-bottom: 12px; }
  .card h3 { margin: 0 0 8px; font-family: var(--font-display); font-size: 20px; font-weight: 700; }
  .card p { margin: 0; font-size: 14px; color: var(--muted); }
  .card .card-link { display: inline-block; margin-top: 14px; font-size: 14px; font-weight: 600; color: var(--primary); text-decoration: none; }
  .card .card-link:hover { text-decoration: underline; }
  .form-card { max-width: 420px; }
  .form-label { display: block; font-size: 14px; font-weight: 600; margin-bottom: 6px; }
  .form-input { width: 100%; background: var(--bg); color: var(--text); border: 1px solid var(--border-strong); border-radius: var(--r-input); padding: 10px 12px; font: 14px/1.4 var(--font-text); outline: none; transition: border-color .15s, box-shadow .15s; }
  .form-input::placeholder { color: var(--muted); }
  .form-input:focus { border-color: var(--primary); box-shadow: 0 0 0 3px rgba(var(--primary-rgb), 0.25); }
  .form-hint { font-size: 12px; color: var(--muted); margin-top: 6px; }

  /* radius / spacing / elevation */
  .radius-row { display: flex; gap: 16px; flex-wrap: wrap; align-items: flex-end; }
  .radius-item { text-align: center; }
  .radius-box { width: 64px; height: 56px; background: var(--border-strong); opacity: 0.85; margin-bottom: 6px; }
  .radius-label { font-family: var(--font-mono); font-size: 11px; color: var(--muted); }
  .spacing-row { display: flex; gap: 12px; flex-wrap: wrap; align-items: flex-end; }
  .spacing-item { text-align: center; }
  .spacing-block { height: 26px; background: var(--primary); opacity: 0.85; border-radius: 3px; margin-bottom: 6px; }
  .spacing-value { font-family: var(--font-mono); font-size: 11px; color: var(--muted); }
  .elevation-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; }
  .elev-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-card); padding: 18px; }
  .elev-name { font-weight: 600; font-size: 14px; }
  .elev-desc { font-family: var(--font-mono); font-size: 10px; color: var(--muted); margin-top: 4px; overflow-wrap: anywhere; }

  footer { border-top: 1px solid var(--border); padding: 28px 32px 40px; text-align: center; font-size: 13px; color: var(--muted); }
  footer a { color: var(--primary); }

  /* ---- variant flourishes ---- */
  .v-luxury .brand, .v-luxury .intro h1, .v-luxury .sec-title, .v-luxury .kicker, .v-luxury .sec-label { text-transform: uppercase; letter-spacing: 0.12em; }
  .v-luxury .card { box-shadow: none; }
  .v-luxury .btn { letter-spacing: 0.1em; text-transform: uppercase; font-size: 13px; }
  .v-luxury .intro h1 { font-weight: 500; }

  .v-bold .intro h1 { text-transform: uppercase; letter-spacing: -0.01em; font-weight: 800; }
  .v-bold .sec-title { text-transform: uppercase; }
  .v-bold .kicker { color: var(--primary); }
  .v-bold .card { border-width: 1px; box-shadow: none; }
  .v-bold .card.elevated { box-shadow: var(--shadow-2); }

  .v-retro .masthead, .v-retro section, .v-retro footer { border-bottom: none; }
  .v-retro .swatch, .v-retro .card, .v-retro .elev-card { border: 2px solid var(--text); box-shadow: 4px 4px 0 var(--text); border-radius: var(--r-card); }
  .v-retro .card.elevated { box-shadow: 6px 6px 0 var(--primary); }
  .v-retro .btn { border: 2px solid var(--text); box-shadow: 3px 3px 0 var(--text); }
  .v-retro .btn-primary { box-shadow: 3px 3px 0 var(--text); }
  .v-retro .btn:active { transform: translate(2px, 2px); box-shadow: 1px 1px 0 var(--text); }
  .v-retro .form-input { border: 2px solid var(--text); border-radius: var(--r-input); }
  .v-retro .kicker { background: var(--text); color: var(--bg); display: inline-block; padding: 3px 10px; }

  @media (max-width: 720px) {
    .masthead { padding: 14px 20px; flex-wrap: wrap; }
    .intro { padding: 44px 20px 32px; }
    section { padding: 36px 20px; }
    .intro h1 { font-size: clamp(30px, 9vw, 44px); }
    .swatches { grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); }
    .demo-grid { grid-template-columns: 1fr; }
  }
</style>
</head>
<body class="v-${variant}">

  <header class="masthead">
    <div class="brand">${esc(name)}</div>
    <div class="masthead-right">
      <span class="cat-chip">${esc(categoryLabel || meta.category || '')}</span>${visit}
    </div>
  </header>

  <div class="intro">
    <div class="kicker">Design token catalog</div>
    <h1>${esc(name)}</h1>
    <p>${esc((meta.descEn || 'Design tokens extracted from DESIGN.md — colors, type, shape and depth, visualized.').slice(0, 220))}</p>
  </div>

  <section id="colors">
    <div class="sec-label">01 / Colors</div>
    <h2 class="sec-title">Color Palette</h2>
    <div class="swatches">
    ${swatches}
    </div>
  </section>

  <section id="typography">
    <div class="sec-label">02 / Typography</div>
    <h2 class="sec-title">Type Scale</h2>
    ${typeRows}
  </section>

  <section id="buttons">
    <div class="sec-label">03 / Buttons</div>
    <h2 class="sec-title">Button Variants</h2>
    <div class="btn-row">
      <div class="btn-item"><a class="btn btn-primary" href="#">Primary action</a><div class="btn-label">Primary &middot; radius ${esc(tokens.btnRadius)}</div></div>
      <div class="btn-item"><a class="btn btn-outline" href="#">Secondary</a><div class="btn-label">Outline</div></div>
      <div class="btn-item"><a class="btn btn-ghost" href="#">Learn more</a><div class="btn-label">Ghost</div></div>
    </div>
  </section>

  <section id="components">
    <div class="sec-label">04 / Cards &amp; Forms</div>
    <h2 class="sec-title">Components</h2>
    <div class="demo-grid">
      <div class="card">
        <span class="badge">Featured</span>
        <h3>Card example</h3>
        <p>Surface, border, radius and shadow tokens composed into a standard content card.</p>
        <a class="card-link" href="#">View details &rarr;</a>
      </div>
      <div class="card elevated">
        <span class="badge">Elevated</span>
        <h3>Raised card</h3>
        <p>The same card lifted with the brand's stronger elevation token.</p>
        <a class="card-link" href="#">View details &rarr;</a>
      </div>
      <div class="card form-card">
        <label class="form-label" for="demo-input">Email address</label>
        <input class="form-input" id="demo-input" type="text" placeholder="you@example.com">
        <div class="form-hint">Input &middot; radius ${esc(tokens.inputRadius)} &middot; focus ring uses primary</div>
      </div>
    </div>
  </section>

  <section id="shape">
    <div class="sec-label">05 / Shape &amp; Depth</div>
    <h2 class="sec-title">Radius &amp; Elevation</h2>
    <div class="radius-row">
      ${radiusChips}
    </div>
    ${spacingStrip}
    ${elevation}
  </section>

  <footer>
    Generated from DESIGN.md &mdash; awesome-design-md &middot; ${esc(name)}
  </footer>

</body>
</html>
`;
  return html;
}

/* ------------------------------------------------------------------ */
/* Main                                                                */
/* ------------------------------------------------------------------ */

const index = JSON.parse(readFileSync(join(ROOT, 'data', 'index.json'), 'utf8'));
const catLabel = new Map(index.categories.map((c) => [c.id, c.label]));
const brandBySlug = new Map(index.brands.map((b) => [b.slug, b]));

const generated = [];
const skipped = [];
const errors = [];

for (const slug of TARGETS) {
  const outPath = join(DESIGN_DIR, slug, 'preview.html');
  if (existsSync(outPath)) { skipped.push(slug); continue; }
  const meta = brandBySlug.get(slug);
  if (!meta) { errors.push(`${slug}: not found in data/index.json`); continue; }
  try {
    const html = generate(slug, meta, catLabel.get(meta.category));
    writeFileSync(outPath, html);
    generated.push(slug);
  } catch (err) {
    errors.push(`${slug}: ${err.message}`);
  }
}

console.log(`Generated ${generated.length} preview(s):`);
for (const s of generated) console.log(`  + design-md/${s}/preview.html`);
if (skipped.length) console.log(`Skipped (already exist): ${skipped.join(', ')}`);
if (errors.length) {
  console.error('ERRORS:');
  for (const e of errors) console.error('  ! ' + e);
  process.exit(1);
}

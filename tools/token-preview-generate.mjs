// SPDX-License-Identifier: BUSL-1.1

/**
 * Design Token Preview Generator
 *
 * Reads DTCG-compliant token JSON files from packages/design-tokens/tokens/
 * and generates a self-contained HTML preview page with:
 *   - Color swatches (primitive palettes, CVD-safe chart colors)
 *   - Semantic color comparison (light / dark / OLED dark)
 *   - WCAG AA/AAA contrast ratio checks for every theme
 *   - Typography scale samples
 *   - Spacing scale visualization
 *   - Border-radius, elevation, and motion tokens
 *
 * Usage:
 *   node tools/token-preview-generate.mjs          # write dist HTML
 *   node tools/token-preview-generate.mjs --help
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const TOKENS_DIR = join(__dirname, '..', 'packages', 'design-tokens', 'tokens');
const DIST_DIR = join(__dirname, '..', 'packages', 'design-tokens', 'build', 'preview');

// ── Utility helpers ──────────────────────────────────────────────────

function readJson(p) {
  return JSON.parse(readFileSync(p, 'utf-8'));
}

/** Flatten nested DTCG object → { 'path.to.token': { $value, $type, … } } */
function flattenTokens(obj, prefix = '') {
  const out = {};
  for (const [key, val] of Object.entries(obj)) {
    if (key.startsWith('$')) continue;
    const path = prefix ? `${prefix}.${key}` : key;
    if (val && typeof val === 'object' && '$value' in val) {
      out[path] = val;
    } else if (val && typeof val === 'object') {
      Object.assign(out, flattenTokens(val, path));
    }
  }
  return out;
}

/** Resolve a DTCG reference like "{color.neutral.900}" to its leaf value */
function resolve(value, map, seen = new Set()) {
  if (typeof value !== 'string') return value;
  const m = value.match(/^\{(.+)\}$/);
  if (!m) return value;
  if (seen.has(m[1])) return value;
  seen.add(m[1]);
  const ref = map[m[1]];
  return ref ? resolve(ref.$value, map, seen) : value;
}

// ── WCAG colour-contrast helpers ─────────────────────────────────────

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
}

function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function grade(ratio, ui = false) {
  if (ui) return ratio >= 3 ? 'AA' : 'FAIL';
  if (ratio >= 7) return 'AAA';
  if (ratio >= 4.5) return 'AA';
  return 'FAIL';
}

const isHex = (v) => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/i.test(v);
const fgFor = (hex) => (luminance(hex) > 0.179 ? '#111827' : '#F9FAFB');
const esc = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

// ── Token loading ────────────────────────────────────────────────────

const PRIM = [
  'colors.json',
  'typography.json',
  'spacing.json',
  'border-radius.json',
  'breakpoints.json',
  'motion.json',
  'shadows.json',
];
const SEM_SHARED = ['typography.json', 'elevation.json', 'breakpoints.json', 'animation.json'];
const COMP = ['button.json', 'card.json', 'input.json', 'navigation.json', 'animation.json'];

function loadDir(dir, files) {
  let t = {};
  for (const f of files) Object.assign(t, flattenTokens(readJson(join(TOKENS_DIR, dir, f))));
  return t;
}

function loadPrimitives() {
  return loadDir('primitive', PRIM);
}

/** Load a fully-resolved theme (primitives + theme colours + shared semantic + components) */
function loadTheme(colorFile) {
  const all = {
    ...loadPrimitives(),
    ...flattenTokens(readJson(join(TOKENS_DIR, 'semantic', colorFile))),
    ...loadDir('semantic', SEM_SHARED),
    ...loadDir('component', COMP),
  };
  const res = {};
  for (const [p, t] of Object.entries(all)) res[p] = { ...t, r: resolve(t.$value, all) };
  return res;
}

// ── Contrast-pair definitions ────────────────────────────────────────

const PAIRS = [
  { fg: 'semantic.text.primary', bg: 'semantic.background.primary', l: 'Primary text' },
  { fg: 'semantic.text.secondary', bg: 'semantic.background.primary', l: 'Secondary text' },
  { fg: 'semantic.text.disabled', bg: 'semantic.background.primary', l: 'Disabled text' },
  {
    fg: 'semantic.text.primary',
    bg: 'semantic.background.secondary',
    l: 'Primary text on secondary bg',
  },
  {
    fg: 'semantic.text.primary',
    bg: 'semantic.background.elevated',
    l: 'Primary text on elevated bg',
  },
  { fg: 'semantic.interactive.default', bg: 'semantic.background.primary', l: 'Interactive' },
  { fg: 'semantic.status.positive', bg: 'semantic.background.primary', l: 'Status positive' },
  { fg: 'semantic.status.negative', bg: 'semantic.background.primary', l: 'Status negative' },
  { fg: 'semantic.status.warning', bg: 'semantic.background.primary', l: 'Status warning' },
  { fg: 'semantic.amount.positive', bg: 'semantic.background.primary', l: 'Amount positive' },
  { fg: 'semantic.amount.negative', bg: 'semantic.background.primary', l: 'Amount negative' },
  { fg: 'button.primary.text', bg: 'button.primary.background', l: 'Primary btn text' },
  {
    fg: 'button.destructive.text',
    bg: 'button.destructive.background',
    l: 'Destructive btn text',
  },
  {
    fg: 'semantic.border.default',
    bg: 'semantic.background.primary',
    l: 'Border (3:1 UI)',
    ui: true,
  },
  {
    fg: 'semantic.border.focus',
    bg: 'semantic.background.primary',
    l: 'Focus ring (3:1 UI)',
    ui: true,
  },
  {
    fg: 'semantic.border.error',
    bg: 'semantic.background.primary',
    l: 'Error border (3:1 UI)',
    ui: true,
  },
];

function checkContrasts(tokens) {
  return PAIRS.map((p) => {
    const fg = tokens[p.fg]?.r;
    const bg = tokens[p.bg]?.r;
    if (!isHex(fg) || !isHex(bg)) return { ...p, fg, bg, ratio: null, g: 'N/A' };
    const ratio = contrast(fg, bg);
    return { ...p, fg, bg, ratio, g: grade(ratio, p.ui) };
  });
}

// ── Shadow helper ────────────────────────────────────────────────────

function shadowCss(v) {
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object' && v.offsetX) {
    return `${v.offsetX} ${v.offsetY} ${v.blur} ${v.spread} ${v.color}`;
  }
  return 'none';
}

// ── HTML section renderers ───────────────────────────────────────────

function renderStats(pc, sc, cc, passRate) {
  const items = [
    { v: pc, l: 'Primitive' },
    { v: sc, l: 'Semantic' },
    { v: cc, l: 'Component' },
    { v: pc + sc + cc, l: 'Total Tokens' },
    { v: passRate, l: 'WCAG Pass Rate' },
  ];
  return `<div class="stats">${items.map((i) => `<div class="stat"><span class="stat-v">${esc(String(i.v))}</span><span class="stat-l">${esc(i.l)}</span></div>`).join('')}</div>`;
}

function renderPalettes(prims) {
  const groups = {};
  for (const [path, tok] of Object.entries(prims)) {
    if (!path.startsWith('color.') || tok.$type !== 'color') continue;
    const parts = path.split('.');
    const name = parts[1];
    const step = parts.slice(2).join('.');
    if (!groups[name]) groups[name] = [];
    groups[name].push({ step, hex: tok.$value, desc: tok.$description || '' });
  }
  // Sort steps numerically where possible
  for (const g of Object.values(groups)) {
    g.sort((a, b) => {
      const na = parseInt(a.step, 10);
      const nb = parseInt(b.step, 10);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return a.step.localeCompare(b.step);
    });
  }
  const order = ['blue', 'teal', 'green', 'amber', 'red', 'neutral', 'oled'];
  let html = '';
  for (const name of order) {
    const swatches = groups[name];
    if (!swatches) continue;
    html += `<div class="pal"><h3>${esc(name)}</h3><div class="pal-row">`;
    for (const s of swatches) {
      const fg = fgFor(s.hex);
      html += `<div class="sw" style="background:${s.hex};color:${fg}" title="${esc(s.desc)}"><span class="sw-step">${esc(s.step)}</span><span class="sw-hex">${s.hex}</span></div>`;
    }
    html += '</div></div>';
  }
  return sec('primitive-colors', 'Primitive Colors', html);
}

function renderChart(prims) {
  const items = [];
  for (const [path, tok] of Object.entries(prims)) {
    if (!path.startsWith('color.chart.')) continue;
    items.push({ n: path.split('.')[2], hex: tok.$value, desc: tok.$description || '' });
  }
  items.sort((a, b) => parseInt(a.n, 10) - parseInt(b.n, 10));
  let html =
    '<p class="sec-desc">IBM CVD-safe palette — safe for protanopia, deuteranopia, and tritanopia. Never convey meaning through colour alone.</p>';
  html += '<div class="chart-row">';
  for (const c of items) {
    const fg = fgFor(c.hex);
    html += `<div class="chart-sw"><div class="chart-c" style="background:${c.hex};color:${fg}">${c.n}</div><div class="chart-info"><span class="mono">${c.hex}</span><span class="chart-d">${esc(c.desc)}</span></div></div>`;
  }
  html += '</div>';
  return sec('chart-colors', 'Chart Colors (CVD-Safe)', html);
}

function renderSemantic(light, dark, oled) {
  const cats = [
    { k: 'background', t: ['primary', 'secondary', 'elevated'] },
    { k: 'text', t: ['primary', 'secondary', 'disabled', 'inverse'] },
    { k: 'border', t: ['default', 'focus', 'error'] },
    { k: 'interactive', t: ['default', 'hover', 'pressed', 'disabled'] },
    { k: 'status', t: ['positive', 'negative', 'warning', 'info'] },
    { k: 'amount', t: ['positive', 'negative'] },
  ];

  function col(label, tokens, bgHex) {
    const fg = fgFor(bgHex);
    let h = `<div class="sem-col" style="background:${bgHex}"><h3 style="color:${fg};border-color:rgba(128,128,128,.25)">${esc(label)}</h3>`;
    for (const cat of cats) {
      h += `<div class="sem-grp"><h4 style="color:${fg};opacity:.55">${esc(cat.k)}</h4>`;
      for (const t of cat.t) {
        const path = `semantic.${cat.k}.${t}`;
        const tok = tokens[path];
        if (!tok) continue;
        const v = tok.r;
        const hex = isHex(v);
        h += `<div class="sem-tok"><span class="sem-sw" style="background:${hex ? v : 'transparent'};${hex ? '' : 'border-style:dashed'}"></span><span style="color:${fg}">${esc(t)}</span><span class="mono" style="color:${fg};opacity:.5">${hex ? v : esc(String(v))}</span></div>`;
      }
      h += '</div>';
    }
    return h + '</div>';
  }

  const lBg = light['semantic.background.primary']?.r || '#FFFFFF';
  const dBg = dark['semantic.background.primary']?.r || '#030712';
  const oBg = oled['semantic.background.primary']?.r || '#000000';
  const html = `<div class="sem-grid">${col('Light', light, lBg)}${col('Dark', dark, dBg)}${col('OLED Dark', oled, oBg)}</div>`;
  return sec('semantic-colors', 'Semantic Colors', html);
}

function renderContrast(lightC, darkC, oledC) {
  function tbl(rows) {
    let h =
      '<table class="ct"><thead><tr><th>Pair</th><th>Foreground</th><th>Background</th><th>Ratio</th><th>Grade</th><th>Preview</th></tr></thead><tbody>';
    for (const r of rows) {
      const badge =
        r.g === 'AAA' ? 'b-aaa' : r.g === 'AA' ? 'b-aa' : r.g === 'FAIL' ? 'b-fail' : 'b-na';
      const ratioStr = r.ratio ? r.ratio.toFixed(2) + ':1' : '—';
      const fgSw = isHex(r.fg) ? `<span class="msw" style="background:${r.fg}"></span>` : '';
      const bgSw = isHex(r.bg) ? `<span class="msw" style="background:${r.bg}"></span>` : '';
      const preview =
        isHex(r.fg) && isHex(r.bg)
          ? `<span class="prev" style="background:${r.bg};color:${r.fg}">Abc $1,234</span>`
          : '—';
      h += `<tr><td>${esc(r.l)}</td><td>${fgSw}${esc(r.fg || '—')}</td><td>${bgSw}${esc(r.bg || '—')}</td><td class="mono">${ratioStr}</td><td><span class="badge ${badge}">${r.g}</span></td><td>${preview}</td></tr>`;
    }
    return h + '</tbody></table>';
  }

  const tabs = [
    { id: 'light', label: 'Light', rows: lightC },
    { id: 'dark', label: 'Dark', rows: darkC },
    { id: 'oled', label: 'OLED Dark', rows: oledC },
  ];
  let html =
    '<p class="sec-desc">Text requires 4.5 : 1 (AA) or 7 : 1 (AAA). UI components require 3 : 1.</p>';
  html += '<div class="tabs">';
  for (let i = 0; i < tabs.length; i++) {
    html += `<button class="tab${i === 0 ? ' active' : ''}" onclick="switchTab('${tabs[i].id}',this)">${tabs[i].label}</button>`;
  }
  html += '</div>';
  for (let i = 0; i < tabs.length; i++) {
    html += `<div id="panel-${tabs[i].id}" class="panel${i === 0 ? ' active' : ''}">${tbl(tabs[i].rows)}</div>`;
  }
  return sec('wcag-contrast', 'WCAG Contrast Ratios', html);
}

function renderTypography(theme) {
  const scales = [
    { name: 'Display', path: 'typeScale.display' },
    { name: 'Headline', path: 'typeScale.headline' },
    { name: 'Title', path: 'typeScale.title' },
    { name: 'Body', path: 'typeScale.body' },
    { name: 'Label', path: 'typeScale.label' },
    { name: 'Caption', path: 'typeScale.caption' },
  ];
  let html = '';
  for (const s of scales) {
    const fs = theme[`${s.path}.fontSize`]?.r || '16px';
    const fw = theme[`${s.path}.fontWeight`]?.r || '400';
    const lh = theme[`${s.path}.lineHeight`]?.r || '1.5';
    html += `<div class="ts"><div class="ts-sample" style="font-size:${fs};font-weight:${fw};line-height:${lh}">${esc(s.name)} — The quick brown fox jumps over $1,234.56</div><div class="ts-meta"><span>${esc(s.name)}</span><span class="mono">size: ${esc(fs)}</span><span class="mono">weight: ${esc(String(fw))}</span><span class="mono">line-height: ${esc(String(lh))}</span></div></div>`;
  }
  return sec('typography', 'Typography Scale', html);
}

function renderSpacing(prims) {
  const items = [];
  for (const [path, tok] of Object.entries(prims)) {
    if (!path.startsWith('spacing.')) continue;
    const name = path.replace('spacing.', '');
    items.push({ name, val: tok.$value, px: parseInt(tok.$value, 10) || 0 });
  }
  items.sort((a, b) => a.px - b.px);
  let html = '';
  for (const s of items) {
    html += `<div class="sp-row"><span class="sp-label">spacing-${esc(s.name)}</span><div class="sp-bar" style="width:${s.px}px" aria-label="${s.val}"></div><span class="mono sp-val">${esc(s.val)}</span></div>`;
  }
  return sec('spacing', 'Spacing Scale', html);
}

function renderRadius(prims) {
  const items = [];
  for (const [path, tok] of Object.entries(prims)) {
    if (!path.startsWith('borderRadius.')) continue;
    items.push({ name: path.replace('borderRadius.', ''), val: tok.$value });
  }
  let html = '<div class="rad-row">';
  for (const r of items) {
    html += `<div class="rad-item"><div class="rad-box" style="border-radius:${r.val}"></div><span class="rad-name">${esc(r.name)}</span><span class="mono rad-val">${esc(r.val)}</span></div>`;
  }
  html += '</div>';
  return sec('border-radius', 'Border Radius', html);
}

function renderElevation(prims) {
  const shadows = {};
  for (const [path, tok] of Object.entries(prims)) {
    if (!path.startsWith('shadow.')) continue;
    shadows[path] = shadowCss(tok.$value);
  }
  let html = '<div class="elev-row">';
  for (const [path, val] of Object.entries(shadows)) {
    const name = path.replace('shadow.', '');
    html += `<div class="elev-item" style="box-shadow:${val}"><span class="elev-name">${esc(name)}</span><span class="mono elev-val">${esc(val === 'none' ? 'none' : val.substring(0, 30) + '…')}</span></div>`;
  }
  html += '</div>';
  return sec('elevation', 'Elevation &amp; Shadows', html);
}

function renderMotion(prims) {
  let html = '<div class="motion-section">';
  // Durations
  html += '<h3>Durations</h3>';
  for (const [path, tok] of Object.entries(prims)) {
    if (!path.startsWith('duration.')) continue;
    const name = path.replace('duration.', '');
    const ms = parseInt(tok.$value, 10) || 0;
    html += `<div class="mo-row"><span class="mo-label">${esc(name)}</span><span class="mono mo-val">${esc(tok.$value)}</span><div class="mo-bar-track"><div class="mo-bar" style="animation-duration:${ms}ms"></div></div></div>`;
  }
  // Easings
  html += '<h3 style="margin-top:20px">Easings</h3>';
  for (const [path, tok] of Object.entries(prims)) {
    if (!path.startsWith('easing.')) continue;
    const name = path.replace('easing.', '');
    const desc = tok.$description || '';
    html += `<div class="mo-row"><span class="mo-label">${esc(name)}</span><span class="mono mo-val">${esc(typeof tok.$value === 'string' ? tok.$value : JSON.stringify(tok.$value))}</span>${desc ? `<span class="mo-desc">${esc(desc)}</span>` : ''}</div>`;
  }
  html += '</div>';
  return sec('motion', 'Motion &amp; Animation', html);
}

/** Wrap content in a section element */
function sec(id, title, content) {
  return `<section id="${id}" class="section"><h2 class="sec-title">${title}</h2><div class="card">${content}</div></section>`;
}

// ── CSS ──────────────────────────────────────────────────────────────

function css() {
  return `
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;background:#f1f5f9;color:#1e293b;line-height:1.6;-webkit-font-smoothing:antialiased}
.hdr{background:#0f172a;color:#f8fafc;padding:20px 32px;position:sticky;top:0;z-index:100;box-shadow:0 2px 8px rgba(0,0,0,.15)}
.hdr h1{font-size:22px;font-weight:700;letter-spacing:-.3px}
.hdr p{color:#94a3b8;font-size:13px;margin-top:2px}
nav.nav{background:#fff;border-bottom:1px solid #e2e8f0;padding:0 32px;display:flex;gap:20px;overflow-x:auto;position:sticky;top:62px;z-index:99}
nav.nav a{display:block;padding:10px 0;color:#64748b;text-decoration:none;font-size:13px;font-weight:500;white-space:nowrap;border-bottom:2px solid transparent;transition:color .15s,border-color .15s}
nav.nav a:hover{color:#1e293b;border-color:#cbd5e1}
.main{max-width:1280px;margin:0 auto;padding:32px}
.section{margin-bottom:40px}
.sec-title{font-size:22px;font-weight:700;color:#0f172a;margin-bottom:12px;padding-bottom:8px;border-bottom:2px solid #e2e8f0}
.sec-desc{color:#64748b;font-size:14px;margin-bottom:16px}
.card{background:#fff;border-radius:12px;padding:24px;box-shadow:0 1px 3px rgba(0,0,0,.06)}
.mono{font-family:'SF Mono',SFMono-Regular,'Fira Code','Cascadia Code',Consolas,monospace}

/* Stats */
.stats{display:flex;gap:12px;margin-bottom:32px;flex-wrap:wrap}
.stat{background:#fff;border-radius:12px;padding:16px 20px;box-shadow:0 1px 3px rgba(0,0,0,.06);min-width:120px;text-align:center}
.stat-v{display:block;font-size:28px;font-weight:700;color:#0f172a}
.stat-l{display:block;font-size:12px;color:#64748b;margin-top:2px}

/* Palettes */
.pal{margin-bottom:20px}
.pal h3{font-size:15px;font-weight:600;margin-bottom:6px;text-transform:capitalize;color:#334155}
.pal-row{display:flex;gap:4px;flex-wrap:wrap}
.sw{width:76px;height:72px;border-radius:8px;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;padding:5px;font-size:10px;border:1px solid rgba(0,0,0,.06);transition:transform .12s;cursor:default}
.sw:hover{transform:scale(1.06)}
.sw-step{font-weight:700;font-size:11px}
.sw-hex{font-family:'SF Mono',SFMono-Regular,Consolas,monospace;font-size:9px;opacity:.9}

/* Chart */
.chart-row{display:flex;gap:12px;flex-wrap:wrap}
.chart-sw{width:112px;border-radius:10px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.06)}
.chart-c{height:60px;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:700}
.chart-info{background:#fff;padding:8px;text-align:center}
.chart-info .mono{font-size:11px;display:block;color:#475569}
.chart-d{font-size:10px;color:#94a3b8;display:block;margin-top:2px}

/* Semantic */
.sem-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
@media(max-width:900px){.sem-grid{grid-template-columns:1fr}}
.sem-col{border-radius:12px;padding:20px;box-shadow:0 1px 3px rgba(0,0,0,.08)}
.sem-col h3{font-size:15px;font-weight:700;margin-bottom:12px;padding-bottom:6px;border-bottom:1px solid}
.sem-grp{margin-bottom:12px}
.sem-grp h4{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px}
.sem-tok{display:flex;align-items:center;gap:6px;padding:2px 0;font-size:12px}
.sem-sw{width:20px;height:20px;border-radius:5px;border:1px solid rgba(128,128,128,.2);flex-shrink:0}

/* Contrast tables */
.tabs{display:flex;gap:4px;margin-bottom:12px}
.tab{padding:7px 14px;border-radius:6px;border:none;background:#f1f5f9;color:#475569;font-size:13px;font-weight:500;cursor:pointer;transition:background .15s,color .15s}
.tab:hover{background:#e2e8f0}
.tab.active{background:#0f172a;color:#fff}
.panel{display:none}
.panel.active{display:block}
.ct{width:100%;border-collapse:collapse;font-size:13px}
.ct th{text-align:left;padding:8px 10px;background:#f8fafc;border-bottom:2px solid #e2e8f0;font-weight:600;color:#475569;font-size:11px;text-transform:uppercase;letter-spacing:.04em}
.ct td{padding:8px 10px;border-bottom:1px solid #f1f5f9;vertical-align:middle}
.ct tr:hover td{background:#f8fafc}
.msw{display:inline-block;width:14px;height:14px;border-radius:3px;border:1px solid rgba(0,0,0,.1);vertical-align:middle;margin-right:4px}
.badge{display:inline-block;padding:2px 7px;border-radius:4px;font-size:10px;font-weight:700;letter-spacing:.03em}
.b-aaa{background:#dcfce7;color:#166534}
.b-aa{background:#dbeafe;color:#1e40af}
.b-fail{background:#fef2f2;color:#991b1b}
.b-na{background:#f1f5f9;color:#94a3b8}
.prev{display:inline-block;padding:2px 8px;border-radius:4px;font-size:12px;font-weight:500}

/* Typography */
.ts{padding:14px 0;border-bottom:1px solid #f1f5f9}
.ts:last-child{border-bottom:none}
.ts-sample{color:#0f172a}
.ts-meta{display:flex;gap:14px;align-items:baseline;margin-top:4px;flex-wrap:wrap}
.ts-meta span{font-size:11px;color:#64748b}

/* Spacing */
.sp-row{display:flex;align-items:center;gap:10px;padding:6px 0}
.sp-label{font-size:12px;color:#475569;min-width:90px;font-weight:500}
.sp-bar{height:20px;background:linear-gradient(135deg,#3b82f6,#2563eb);border-radius:3px;min-width:2px}
.sp-val{font-size:11px;color:#94a3b8}

/* Border radius */
.rad-row{display:flex;gap:16px;flex-wrap:wrap}
.rad-item{display:flex;flex-direction:column;align-items:center;gap:6px}
.rad-box{width:72px;height:72px;background:linear-gradient(135deg,#3b82f6,#2563eb);border:2px solid #2563eb}
.rad-name{font-size:12px;font-weight:500;color:#475569}
.rad-val{font-size:11px;color:#94a3b8}

/* Elevation */
.elev-row{display:flex;gap:20px;flex-wrap:wrap;padding:12px 0}
.elev-item{width:120px;height:80px;background:#fff;border-radius:10px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px}
.elev-name{font-size:13px;font-weight:600;color:#475569}
.elev-val{font-size:9px;color:#94a3b8;text-align:center;max-width:100px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

/* Motion */
.motion-section h3{font-size:15px;font-weight:600;color:#334155;margin-bottom:8px}
.mo-row{display:flex;align-items:center;gap:12px;padding:7px 0;border-bottom:1px solid #f1f5f9;flex-wrap:wrap}
.mo-label{font-size:13px;font-weight:500;color:#475569;min-width:100px}
.mo-val{font-size:11px;color:#64748b}
.mo-desc{font-size:11px;color:#94a3b8;font-style:italic}
.mo-bar-track{width:100px;height:8px;background:#e2e8f0;border-radius:4px;overflow:hidden}
.mo-bar{height:100%;width:40%;background:#3b82f6;border-radius:4px;animation:slide 2s infinite alternate ease-in-out}
@keyframes slide{0%{transform:translateX(0)}100%{transform:translateX(150%)}}
`;
}

// ── Navigation links ─────────────────────────────────────────────────

const NAV = [
  ['#primitive-colors', 'Colors'],
  ['#chart-colors', 'Chart'],
  ['#semantic-colors', 'Semantic'],
  ['#wcag-contrast', 'Contrast'],
  ['#typography', 'Typography'],
  ['#spacing', 'Spacing'],
  ['#border-radius', 'Radius'],
  ['#elevation', 'Elevation'],
  ['#motion', 'Motion'],
];

// ── Main entry point ─────────────────────────────────────────────────

export function generate(opts = {}) {
  const prims = loadPrimitives();
  const light = loadTheme('colors.light.json');
  const dark = loadTheme('colors.dark.json');
  const oled = loadTheme('colors.dark-oled.json');

  const lc = checkContrasts(light);
  const dc = checkContrasts(dark);
  const oc = checkContrasts(oled);

  const pc = Object.keys(prims).length;
  const sc = Object.keys(loadDir('semantic', [...SEM_SHARED, 'colors.light.json'])).length;
  const cc = Object.keys(loadDir('component', COMP)).length;
  const all = [...lc, ...dc, ...oc].filter((c) => c.g !== 'N/A');
  const pass = all.filter((c) => c.g !== 'FAIL').length;
  const rate = all.length ? Math.round((pass / all.length) * 100) + '%' : '—';

  const navHtml = NAV.map(([href, label]) => `<a href="${href}">${label}</a>`).join('');
  const ts = new Date().toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
  const sse = opts.liveReload
    ? '<script>new EventSource("/sse").onmessage=function(){location.reload()}</script>'
    : '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Finance Design Tokens</title>
<style>${css()}</style>
</head>
<body>
<header class="hdr"><h1>Finance Design Tokens</h1><p>Generated ${ts} · ${pc + sc + cc} tokens across 3 tiers · 3 themes</p></header>
<nav class="nav">${navHtml}</nav>
<main class="main">
${renderStats(pc, sc, cc, rate)}
${renderPalettes(prims)}
${renderChart(prims)}
${renderSemantic(light, dark, oled)}
${renderContrast(lc, dc, oc)}
${renderTypography(light)}
${renderSpacing(prims)}
${renderRadius(prims)}
${renderElevation(prims)}
${renderMotion(prims)}
</main>
<script>
function switchTab(id,btn){
  document.querySelectorAll('.tab').forEach(function(t){t.classList.remove('active')});
  document.querySelectorAll('.panel').forEach(function(p){p.classList.remove('active')});
  document.getElementById('panel-'+id).classList.add('active');
  btn.classList.add('active');
}
</script>
${sse}
</body>
</html>`;

  mkdirSync(DIST_DIR, { recursive: true });
  writeFileSync(join(DIST_DIR, 'index.html'), html);
  console.log(`\u2705 Generated: ${join(DIST_DIR, 'index.html')} (${pc + sc + cc} tokens)`);
}

// Run if executed directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--help')) {
    console.log('Usage: node tools/token-preview-generate.mjs');
    console.log('Generates a self-contained HTML preview of design tokens.');
    console.log('Output: packages/design-tokens/build/preview/index.html');
    process.exit(0);
  }
  generate();
}

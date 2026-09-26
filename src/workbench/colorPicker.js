/**
 * Color picker: a swatch that opens a small popover with a saturation/brightness field,
 * hue and opacity sliders, a hex field, palette presets, recent colors and your own palette.
 * Values are '#rrggbb' or '#rrggbbaa' (canvas and SVG both read 8-digit hex).
 */
import { h } from './ui.js';
import { allPalettes, toHex, nameOf, paletteFromImage, savePalette } from './palettes.js';


const RECENT_KEY = 'ams_colors_recent';
const MINE_KEY = 'ams_colors_mine';
const PALETTE_KEY = 'ams_colors_palette';
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const store = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } };

// ---- color math ----------------------------------------------------------------------
export function parseColor(v, fallback = '#1d1b19') {
  let s = String(v || fallback).trim();
  if (/^#[0-9a-f]{3}$/i.test(s)) s = `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`;
  if (/^#[0-9a-f]{8}$/i.test(s)) return { hex: s.slice(0, 7).toLowerCase(), alpha: parseInt(s.slice(7), 16) / 255 };
  if (/^#[0-9a-f]{6}$/i.test(s)) return { hex: s.toLowerCase(), alpha: 1 };
  const m = s.match(/rgba?\(([^)]+)\)/i);
  if (m) { const [r, g, b, a = 1] = m[1].split(',').map(Number); return { hex: rgbHex(r, g, b), alpha: a }; }
  return v === fallback ? { hex: '#1d1b19', alpha: 1 } : parseColor(fallback, '#1d1b19');
}
export const formatColor = (hex, alpha) => (alpha >= 0.999 ? hex : `${hex}${Math.round(Math.max(0, alpha) * 255).toString(16).padStart(2, '0')}`);
const rgbHex = (r, g, b) => `#${[r, g, b].map(x => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, '0')).join('')}`;
function hexHsv(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255, b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), d = max - Math.min(r, g, b);
  let hh = 0;
  if (d) hh = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: ((hh * 60) + 360) % 360, s: max ? d / max : 0, v: max };
}
function hsvHex({ h: hh, s, v }) {
  const f = n => { const k = (n + hh / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
  return rgbHex(f(5) * 255, f(3) * 255, f(1) * 255);
}

// ---- the field -----------------------------------------------------------------------
/** A swatch that opens the picker. onChange receives '#rrggbb' or '#rrggbbaa'. */
export function colorField(value, onChange, { title = 'Color', fallback = '#1d1b19', app = null } = {}) {
  let { hex, alpha } = parseColor(value, fallback);
  const chip = h('span', { class: 'wb-cp-chip' });
  const label = h('span', { class: 'wb-cp-label' });
  const btn = h('button', { class: 'wb-cp-swatch', title, type: 'button' }, h('span', { class: 'wb-cp-checker' }, chip), label);
  const paint = () => { chip.style.background = formatColor(hex, alpha); label.textContent = `${hex.slice(1)}${alpha < 0.999 ? ` · ${Math.round(alpha * 100)}%` : ''}`; };
  paint();
  btn.addEventListener('click', () => openPicker(btn, { hex, alpha }, (c, final) => {
    hex = c.hex; alpha = c.alpha; paint();
    if (final) onChange(formatColor(hex, alpha));
  }, app));
  return btn;
}

let open = null;

/**
 * Eyedropper: the browser's EyeDropper samples any pixel on screen (Chrome, Edge); elsewhere,
 * click a point on the canvas (with the reference) to sample it. Resolves '#rrggbb' or null.
 */
export async function eyedrop(app) {
  if (window.EyeDropper) {
    try { const r = await new window.EyeDropper().open(); return r.sRGBHex.length === 7 ? r.sRGBHex : parseColor(r.sRGBHex).hex; } catch { return null; }
  }
  const cv = app.canvas.canvas;
  app.canvas.flash?.('Click to pick a color');
  const prev = cv.style.cursor;
  cv.style.cursor = 'crosshair';
  return new Promise(resolve => {
    const pick = e => {
      e.stopPropagation(); e.preventDefault();
      window.removeEventListener('pointerdown', pick, true);
      cv.style.cursor = prev;
      const r = cv.getBoundingClientRect();
      const k = cv.width / r.width;
      const d = cv.getContext('2d').getImageData(Math.round((e.clientX - r.left) * k), Math.round((e.clientY - r.top) * k), 1, 1).data;
      resolve(e.target === cv ? rgbHex(d[0], d[1], d[2]) : null);
    };
    window.addEventListener('pointerdown', pick, true);
  });
}

/** Where a picked color goes: the open picker, else the selection, else the current tool's default. */
export async function eyedropToTarget(app) {
  if (open?.accept) { const c = await eyedrop(app); if (c) open.accept(c); return c; }
  const c = await eyedrop(app);
  if (!c) return null;
  const sel = app.selectedElements?.() || [];
  if (sel.length) app.store.patchElements(sel.map(e => e.id), { color: c }, 'color');
  else if (app.tool && app.setDefaults) app.setDefaults(app.tool, { color: c });
  store(RECENT_KEY, [c, ...load(RECENT_KEY, []).filter(x => x !== c)].slice(0, 10));
  app.log?.(`Picked ${c}${sel.length ? ` for ${sel.length} element(s)` : ''}.`);
  return c;
}

export function openPicker(anchor, start, onChange, app, { allowNone = false } = {}) {
  open?.close();
  let hsv = hexHsv(start.hex), alpha = start.alpha, dirty = false;
  const hex = () => hsvHex(hsv);
  const sv = h('canvas', { class: 'wb-cp-sv', width: 200, height: 130 });
  const hue = h('input', { type: 'range', class: 'wb-cp-hue', min: 0, max: 360, step: 1, value: hsv.h, title: 'Hue' });
  const alp = h('input', { type: 'range', class: 'wb-cp-alpha', min: 0, max: 100, step: 1, value: Math.round(alpha * 100), title: 'Opacity' });
  const hexIn = h('input', { class: 'wb-inline wb-cp-hex', spellcheck: 'false', title: 'Hex (#rrggbb or #rrggbbaa), or a name: burnt sienna, crimson…' });
  const pctIn = h('input', { type: 'number', class: 'wb-inline wb-cp-pct', min: 0, max: 100, title: 'Opacity %' });
  const preview = h('span', { class: 'wb-cp-chip' });
  const paletteSel = h('select', { class: 'wb-select wb-cp-palette' });
  const fillPalettes = () => { paletteSel.replaceChildren(...Object.keys(allPalettes()).map(k => h('option', { value: k }, k))); paletteSel.value = allPalettes()[load(PALETTE_KEY, '')] ? load(PALETTE_KEY, '') : 'Klee · Senecio'; };
  fillPalettes();
  const fromRef = app?.reference ? h('button', { class: 'wb-cp-drop wb-cp-fromref', type: 'button', title: 'Make a palette from the reference image', html: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-8 8"/></svg>',
    onclick: () => { const cols = paletteFromImage(app.reference.img, 8); const name = `From ${app.reference.title}`.slice(0, 48); savePalette(name, cols); store(PALETTE_KEY, name); fillPalettes(); renderRows(); } }) : null;
  const presets = h('div', { class: 'wb-cp-row' });
  const recents = h('div', { class: 'wb-cp-row' });
  const mine = h('div', { class: 'wb-cp-row' });

  const drawSV = () => {
    const ctx = sv.getContext('2d'), W = sv.width, H = sv.height;
    ctx.fillStyle = hsvHex({ h: hsv.h, s: 1, v: 1 }); ctx.fillRect(0, 0, W, H);
    const wg = ctx.createLinearGradient(0, 0, W, 0); wg.addColorStop(0, '#fff'); wg.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = wg; ctx.fillRect(0, 0, W, H);
    const bg = ctx.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, 'rgba(0,0,0,0)'); bg.addColorStop(1, '#000'); ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    const x = hsv.s * W, y = (1 - hsv.v) * H;
    ctx.lineWidth = 2; ctx.strokeStyle = hsv.v > 0.6 && hsv.s < 0.5 ? '#000' : '#fff';
    ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.stroke();
  };
  const sync = (final = false) => {
    drawSV();
    hue.value = hsv.h;
    alp.value = Math.round(alpha * 100);
    alp.style.setProperty('--cp-color', hex());
    if (document.activeElement !== hexIn) hexIn.value = formatColor(hex(), alpha).slice(1);
    if (document.activeElement !== pctIn) pctIn.value = Math.round(alpha * 100);
    preview.style.background = formatColor(hex(), alpha);
    preview.title = nameOf(hex());
    dirty = true;
    onChange({ hex: hex(), alpha }, final);
  };
  const choose = c => { const p = parseColor(c); hsv = hexHsv(p.hex); alpha = p.alpha; sync(true); };
  const chipBtn = (c, extra = {}) => {
    const hexv = typeof c === 'string' ? c : c.hex, name = typeof c === 'string' ? nameOf(c) : c.name || nameOf(c.hex);
    return h('button', { class: 'wb-cp-preset', type: 'button', title: `${name} · ${hexv}`, onclick: () => choose(hexv), ...extra }, h('span', { class: 'wb-cp-chip', style: { background: hexv } }));
  };
  const renderRows = () => {
    presets.replaceChildren(...(allPalettes()[paletteSel.value] || []).map(c => chipBtn(c)));
    const r = load(RECENT_KEY, []);
    recents.replaceChildren(...(r.length ? r.map(c => chipBtn(c)) : [h('span', { class: 'wb-muted wb-small' }, '—')]));
    const m = load(MINE_KEY, []);
    mine.replaceChildren(...m.map(c => chipBtn(c, { oncontextmenu: ev => { ev.preventDefault(); store(MINE_KEY, load(MINE_KEY, []).filter(x => x !== c)); renderRows(); }, title: `${c} (right-click removes)` })),
      h('button', { class: 'wb-cp-preset wb-cp-add', type: 'button', title: 'Add the current color to your palette', onclick: () => { const c = formatColor(hex(), alpha); store(MINE_KEY, [...new Set([...load(MINE_KEY, []), c])].slice(-24)); renderRows(); } }, '+'));
  };
  paletteSel.addEventListener('change', () => { store(PALETTE_KEY, paletteSel.value); renderRows(); });

  const dragSV = ev => {
    const r = sv.getBoundingClientRect();
    const set = e => { hsv.s = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)); hsv.v = Math.max(0, Math.min(1, 1 - (e.clientY - r.top) / r.height)); sync(); };
    set(ev);
    const up = e => { window.removeEventListener('pointermove', set); window.removeEventListener('pointerup', up); set(e); onChange({ hex: hex(), alpha }, true); };
    window.addEventListener('pointermove', set); window.addEventListener('pointerup', up);
  };
  sv.addEventListener('pointerdown', dragSV);
  hue.addEventListener('input', () => { hsv.h = Number(hue.value); sync(); });
  hue.addEventListener('change', () => sync(true));
  alp.addEventListener('input', () => { alpha = Number(alp.value) / 100; sync(); });
  alp.addEventListener('change', () => sync(true));
  // Hex, or a name: "burnt sienna", "payne's gray", "crimson", or a palette color's name.
  hexIn.addEventListener('change', () => { const raw = hexIn.value.trim(); if (allowNone && /^(none|no|transparent|-|)$/i.test(raw)) { onChange(null, true); close(); return; } const v = toHex(/^[0-9a-f]{3,8}$/i.test(raw) ? `#${raw}` : raw); if (v) choose(v); else hexIn.value = formatColor(hex(), alpha).slice(1); });
  pctIn.addEventListener('change', () => { alpha = Math.max(0, Math.min(100, Number(pctIn.value) || 0)) / 100; sync(true); });
  for (const i of [hexIn, pctIn]) i.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') i.blur(); });

  const pop = h('div', { class: 'wb-cp-pop' },
    sv, hue, alp,
    h('div', { class: 'wb-cp-row wb-cp-inputs' }, h('span', { class: 'wb-cp-checker wb-cp-big' }, preview),
      app ? h('button', { class: 'wb-cp-drop', type: 'button', title: 'Pick a color from the screen (I)', html: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5l4 4M4 20l1-4 9.5-9.5 3 3L8 19z"/><path d="M16 4l4 4"/></svg>', onclick: () => eyedrop(app).then(c => c && choose(c)) }) : null, h('span', { class: 'wb-muted' }, '#'), hexIn, pctIn, h('span', { class: 'wb-muted' }, '%'),
      allowNone ? h('button', { class: 'wb-cp-none', type: 'button', title: 'None (or type none)', html: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="4" y="4" width="16" height="16" rx="3" stroke="var(--wb-muted)"/><path d="M5 19L19 5"/></svg>', onclick: () => { onChange(null, true); close(); } }) : null),
    h('div', { class: 'wb-cp-row wb-cp-inputs' }, paletteSel, fromRef), presets,
    h('div', { class: 'wb-cp-head' }, 'Recent'), recents,
    h('div', { class: 'wb-cp-head' }, 'Mine'), mine);
  document.body.append(pop);
  const r = anchor.getBoundingClientRect();
  const pw = 224, ph = pop.offsetHeight || 400;
  pop.style.left = `${Math.max(8, Math.min(window.innerWidth - pw - 8, r.left))}px`;
  pop.style.top = `${r.bottom + ph + 8 < window.innerHeight ? r.bottom + 6 : Math.max(8, r.top - ph - 6)}px`;

  const close = () => {
    pop.remove();
    window.removeEventListener('pointerdown', outside, true);
    window.removeEventListener('keydown', esc, true);
    if (dirty) store(RECENT_KEY, [formatColor(hex(), alpha), ...load(RECENT_KEY, []).filter(c => c !== formatColor(hex(), alpha))].slice(0, 10));
    open = null;
  };
  const outside = e => { if (!pop.contains(e.target) && !anchor.contains(e.target)) close(); };
  const esc = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  setTimeout(() => { window.addEventListener('pointerdown', outside, true); window.addEventListener('keydown', esc, true); });
  open = { close, accept: c => choose(c) };
  renderRows();
  sync(false);
  dirty = false;
}

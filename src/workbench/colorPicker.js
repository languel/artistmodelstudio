/**
 * Color picker: a swatch that opens a small popover with a saturation/brightness field,
 * hue and opacity sliders, a hex field, palette presets, recent colors and your own palette.
 * Values are '#rrggbb' or '#rrggbbaa' (canvas and SVG both read 8-digit hex).
 */
import { h } from './ui.js';
import { allPalettes, toHex, nameOf, paletteFromImage, savePalette } from './palettes.js';
import { hexToOklch, oklchHex, oklchLinear, fitChroma, inGamut, CHROMA_MAX } from './oklch.js';


const RECENT_KEY = 'ams_colors_recent';
const MINE_KEY = 'ams_colors_mine';
const PALETTE_KEY = 'ams_colors_palette';
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const store = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } };

/**
 * A paint marker, like the toolbar's swatches: the fill is a solid rounded square, the stroke a hollow one; size px
 * across, both with a hairline edge so they read on any color. active adds a thin frame around it.
 */
function marker(ctx, kind, x, y, size, color, active = false) {
  const rr = (sz, r) => { const a = x - sz / 2, b = y - sz / 2; ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(a, b, sz, sz, r); else ctx.rect(a, b, sz, sz); };
  const hair = (sz, r) => { rr(sz, r); ctx.lineWidth = 0.7; ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.stroke(); };
  if (kind === 'fill') { rr(size, size * 0.25); ctx.fillStyle = color; ctx.fill(); hair(size, size * 0.25); }
  else {
    const t = Math.max(2.4, size * 0.24);
    rr(size - t, size * 0.2); ctx.lineWidth = t; ctx.strokeStyle = color; ctx.stroke();
    hair(size, size * 0.25); hair(size - 2 * t, size * 0.1);
  }
  if (active) { rr(size + 7, size * 0.3); ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.stroke(); }
}

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

/**
 * One picker's body: the field, sliders, hex, palettes. start: { hex, alpha, none }. dismiss: what "none" does when the
 * picker is alone (closes it); with keepOpen the body just dims, for pickers that sit side by side.
 */
function buildPicker(start, onChange, app, { allowNone = false, dismiss = () => {}, keepOpen = false, compact = false, cursor = null, svH = 96 } = {}) {
  let hsv = hexHsv(start.hex), alpha = start.alpha, dirty = false;
  const hex = () => hsvHex(hsv);
  const sv = h('canvas', { class: 'wb-cp-sv', width: compact ? 100 : 200, height: compact ? svH : 130 });
  if (compact) sv.style.height = `${svH}px`;
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
    if (cursor) { marker(ctx, cursor === 'dot' ? 'fill' : 'stroke', x, y, cursor === 'dot' ? 12 : 14, hex()); return; }   // fill: solid, stroke: hollow
    ctx.lineWidth = 2; ctx.strokeStyle = hsv.v > 0.6 && hsv.s < 0.5 ? '#000' : '#fff';
    ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.stroke();
  };
  const sync = (final = false) => {
    body.classList.remove('wb-cp-off');
    drawSV();
    hue.value = hsv.h;
    alp.value = Math.round(alpha * 100);
    alp.style.setProperty('--cp-color', hex());
    if (document.activeElement !== hexIn) hexIn.value = formatColor(hex(), alpha).slice(1);
    if (document.activeElement !== pctIn) pctIn.value = Math.round(alpha * 100);
    // the chip is the toolbar's swatch: solid for the fill, a hollow frame for the stroke
    if (cursor === 'ring') { preview.style.background = 'transparent'; preview.style.boxShadow = `inset 0 0 0 5px ${formatColor(hex(), alpha)}`; }
    else preview.style.background = formatColor(hex(), alpha);
    preview.title = nameOf(hex());
    dirty = true;
    onChange({ hex: hex(), alpha }, final);
  };
  const none = () => { if (keepOpen) body.classList.add('wb-cp-off'); else dismiss(); };
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
  hexIn.addEventListener('change', () => { const raw = hexIn.value.trim(); if (allowNone && /^(none|no|transparent|-|)$/i.test(raw)) { onChange(null, true); none(); return; } const v = toHex(/^[0-9a-f]{3,8}$/i.test(raw) ? `#${raw}` : raw); if (v) choose(v); else hexIn.value = formatColor(hex(), alpha).slice(1); });
  pctIn.addEventListener('input', () => { if (document.activeElement === pctIn) return; alpha = Math.max(0, Math.min(100, Number(pctIn.value) || 0)) / 100; sync(); });
  pctIn.addEventListener('change', () => { alpha = Math.max(0, Math.min(100, Number(pctIn.value) || 0)) / 100; sync(true); });
  for (const i of [hexIn, pctIn]) i.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') i.blur(); });

  const noneBtn = allowNone ? h('button', { class: 'wb-cp-none', type: 'button', title: 'None (or type none)', html: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M7 17L17 7"/></svg>', onclick: () => { onChange(null, true); none(); } }) : null;
  const dropBtn = app ? h('button', { class: 'wb-cp-drop', type: 'button', title: 'Pick a color from the screen (I)', html: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5l4 4M4 20l1-4 9.5-9.5 3 3L8 19z"/><path d="M16 4l4 4"/></svg>', onclick: () => eyedrop(app).then(c => c && choose(c)) }) : null;
  // Compact (side by side): the field, hue, opacity, hex and none; the palette is shared, so it is not here.
  const body = compact
    ? h('div', { class: 'wb-cp-body' }, sv, hue, alp, h('div', { class: 'wb-cp-row wb-cp-inputs' }, h('span', { class: 'wb-cp-checker wb-cp-big' }, preview), hexIn, noneBtn))
    : h('div', { class: 'wb-cp-body' },
      sv, hue, alp,
      h('div', { class: 'wb-cp-row wb-cp-inputs' }, h('span', { class: 'wb-cp-checker wb-cp-big' }, preview), dropBtn, h('span', { class: 'wb-muted' }, '#'), hexIn, pctIn, h('span', { class: 'wb-muted' }, '%'), noneBtn),
      h('div', { class: 'wb-cp-row wb-cp-inputs' }, paletteSel, fromRef), presets,
      h('div', { class: 'wb-cp-head' }, 'Recent'), recents,
      h('div', { class: 'wb-cp-head' }, 'Mine'), mine);

  renderRows();
  sync(false);
  dirty = false;
  if (start.none) body.classList.add('wb-cp-off');
  return {
    el: body, choose, drop: () => app && eyedrop(app).then(c => c && choose(c)),
    get: () => formatColor(hex(), alpha),
    finish: () => { if (dirty) store(RECENT_KEY, [formatColor(hex(), alpha), ...load(RECENT_KEY, []).filter(c => c !== formatColor(hex(), alpha))].slice(0, 10)); },
  };
}

export function openPicker(anchor, start, onChange, app, { allowNone = false } = {}) {
  open?.close();
  const b = buildPicker(start, onChange, app, { allowNone, dismiss: () => close() });
  const pop = h('div', { class: 'wb-cp-pop' }, b.el);
  document.body.append(pop);
  const r = anchor.getBoundingClientRect();
  const pw = 224, ph = pop.offsetHeight || 400;
  pop.style.left = `${Math.max(8, Math.min(window.innerWidth - pw - 8, r.left))}px`;
  pop.style.top = `${r.bottom + ph + 8 < window.innerHeight ? r.bottom + 6 : Math.max(8, r.top - ph - 6)}px`;

  const close = () => {
    pop.remove();
    window.removeEventListener('pointerdown', outside, true);
    window.removeEventListener('keydown', esc, true);
    b.finish();
    open = null;
  };
  const outside = e => { if (!pop.contains(e.target) && !anchor.contains(e.target)) close(); };
  const esc = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  setTimeout(() => { window.addEventListener('pointerdown', outside, true); window.addEventListener('keydown', esc, true); });
  open = { close, accept: c => b.choose(c) };
}

/** Stroke and fill side by side: a field, hue, opacity and hex for each, one palette. */
const FIELD_H = 183;   // the field's height, so this mode is as tall as the canvas modes
function fieldsBody(app, { stroke, fill, set }) {
  const none = v => !v || v === 'none';
  const side = (which, label, v, fallback) => {
    const b = buildPicker({ ...parseColor(none(v) ? fallback : v, fallback), none: none(v) }, (c, final) => { if (final) set(which, c ? formatColor(c.hex, c.alpha) : null); }, app, { allowNone: true, keepOpen: true, compact: true, cursor: which === 'fill' ? 'dot' : 'ring', svH: FIELD_H });
    const col = h('div', { class: 'wb-cp-col', 'data-paint': which, title: label }, b.el);
    return { b, col };
  };
  const F = side('fill', 'Fill', fill, '#ffffff'), S = side('stroke', 'Stroke', stroke, '#1d1b19');
  const swap = h('button', { class: 'wb-cp-swap', type: 'button', title: 'Swap stroke and fill', onclick: () => {
    const f = F.b.get(), s = S.b.get(), fo = F.b.el.classList.contains('wb-cp-off'), so = S.b.el.classList.contains('wb-cp-off');
    if (so) { set('fill', null); F.b.el.classList.add('wb-cp-off'); } else F.b.choose(s);
    if (fo) { set('stroke', null); S.b.el.classList.add('wb-cp-off'); } else S.b.choose(f);
  } }, '⇄');
  // One palette for both: a chip goes to the side last touched.
  let last = F;
  const sel = h('select', { class: 'wb-select wb-cp-palette' });
  sel.replaceChildren(...Object.keys(allPalettes()).map(k => h('option', { value: k }, k)));
  sel.value = allPalettes()[load(PALETTE_KEY, '')] ? load(PALETTE_KEY, '') : 'Klee · Senecio';
  const chips = h('div', { class: 'wb-cp-row' });
  const fillChips = () => chips.replaceChildren(...(allPalettes()[sel.value] || []).map(c => {
    const hexv = typeof c === 'string' ? c : c.hex, name = typeof c === 'string' ? nameOf(c) : c.name || nameOf(c.hex);
    return h('button', { class: 'wb-cp-preset', type: 'button', title: `${name} · ${hexv}`, onclick: () => last.b.choose(hexv) }, h('span', { class: 'wb-cp-chip', style: { background: hexv } }));
  }));
  sel.addEventListener('change', () => { store(PALETTE_KEY, sel.value); fillChips(); });
  fillChips();
  const drop = app ? h('button', { class: 'wb-cp-drop', type: 'button', title: 'Pick a color from the screen for the side you last touched', html: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5l4 4M4 20l1-4 9.5-9.5 3 3L8 19z"/><path d="M16 4l4 4"/></svg>', onclick: () => last.b.drop() }) : null;
  const pair = h('div', { class: 'wb-cp-sides' }, F.col, swap, S.col);
  for (const t of [F, S]) t.col.addEventListener('pointerdown', () => { last = t; });
  const el = h('div', { class: 'wb-cp-body' }, pair, h('div', { class: 'wb-cp-row wb-cp-inputs' }, drop, sel), chips);
  return { el, finish: () => { F.b.finish(); S.b.finish(); }, accept: c => last.b.choose(c) };
}

/**
 * The shared body of the one-canvas paint modes (the wheel, the cube): both colors as hsv + opacity, a hex row
 * and none button for each, opacity of the side touched last, one palette, eyedropper, swap. A widget draws the
 * colors on a canvas and edits them: widget(ctx) -> { el, render() }, where ctx is
 * { st, active(), setActive(w), hexOf(w), commit(w), refresh() } and st[w] = { hsv, alpha, off, dirty }.
 */
function shellBody(app, { stroke, fill, set }, widget) {
  const none = v => !v || v === 'none';
  const mk = (v, fb) => { const p = parseColor(none(v) ? fb : v, fb); return { hsv: hexHsv(p.hex), alpha: p.alpha, off: none(v), dirty: false }; };
  const st = { stroke: mk(stroke, '#1d1b19'), fill: mk(fill, '#ffffff') };
  let active = 'stroke';
  const hexOf = w => hsvHex(st[w].hsv), fmt = w => formatColor(hexOf(w), st[w].alpha);
  const sidesUI = {};
  const alp = h('input', { type: 'range', class: 'wb-cp-alpha', min: 0, max: 100, step: 1, title: 'Opacity of the side you last touched' });
  let wid = null;

  const syncUI = () => {
    for (const w of ['stroke', 'fill']) {
      const u = sidesUI[w];
      if (w === 'stroke') { u.chip.style.background = 'transparent'; u.chip.style.boxShadow = st[w].off ? 'none' : `inset 0 0 0 5px ${fmt(w)}`; }
      else u.chip.style.background = st[w].off ? 'transparent' : fmt(w);
      if (document.activeElement !== u.hex) u.hex.value = st[w].off ? '' : fmt(w).slice(1);
      u.row.classList.toggle('wb-cp-on', w === active);
    }
    alp.value = Math.round(st[active].alpha * 100);
    alp.style.setProperty('--cp-color', hexOf(active));
    wid?.render();
  };
  const commit = w => { st[w].dirty = true; set(w, st[w].off ? null : fmt(w)); syncUI(); };
  const choose = (w, c) => { const p = parseColor(c); st[w].hsv = hexHsv(p.hex); st[w].alpha = p.alpha; st[w].off = false; active = w; commit(w); };
  const clear = w => { st[w].off = true; active = w; set(w, null); syncUI(); };

  const mkRow = (w, label) => {
    const chip = h('span', { class: 'wb-cp-chip' });
    const hexIn = h('input', { class: 'wb-inline wb-cp-hex', spellcheck: 'false', title: 'Hex, or a name: crimson, burnt sienna…' });
    hexIn.addEventListener('focus', () => { active = w; syncUI(); });
    hexIn.addEventListener('change', () => {
      const raw = hexIn.value.trim();
      if (/^(none|no|transparent|-|)$/i.test(raw)) { clear(w); return; }
      const v = toHex(/^[0-9a-f]{3,8}$/i.test(raw) ? `#${raw}` : raw);
      if (v) choose(w, v); else syncUI();
    });
    hexIn.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') hexIn.blur(); });
    const noneBtn = h('button', { class: 'wb-cp-none', type: 'button', title: 'None', html: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M7 17L17 7"/></svg>', onclick: () => clear(w) });
    const row = h('div', { class: 'wb-cp-row wb-cp-inputs wb-cp-wrow', 'data-paint': w, title: label, onpointerdown: () => { active = w; syncUI(); } },
      h('span', { class: 'wb-cp-checker wb-cp-big' }, chip), hexIn, noneBtn);
    sidesUI[w] = { chip, hex: hexIn, row };
    return row;
  };
  alp.addEventListener('input', () => { st[active].alpha = Number(alp.value) / 100; st[active].dirty = true; syncUI(); });
  alp.addEventListener('change', () => commit(active));

  const sel = h('select', { class: 'wb-select wb-cp-palette' });
  sel.replaceChildren(...Object.keys(allPalettes()).map(k => h('option', { value: k }, k)));
  sel.value = allPalettes()[load(PALETTE_KEY, '')] ? load(PALETTE_KEY, '') : 'Klee · Senecio';
  const chips = h('div', { class: 'wb-cp-row' });
  const fillChips = () => chips.replaceChildren(...(allPalettes()[sel.value] || []).map(c => {
    const hexv = typeof c === 'string' ? c : c.hex, name = typeof c === 'string' ? nameOf(c) : c.name || nameOf(c.hex);
    return h('button', { class: 'wb-cp-preset', type: 'button', title: `${name} · ${hexv}`, onclick: () => choose(active, hexv) }, h('span', { class: 'wb-cp-chip', style: { background: hexv } }));
  }));
  sel.addEventListener('change', () => { store(PALETTE_KEY, sel.value); fillChips(); });
  fillChips();
  const drop = app ? h('button', { class: 'wb-cp-drop', type: 'button', title: 'Pick a color from the screen for the side you last touched', html: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5l4 4M4 20l1-4 9.5-9.5 3 3L8 19z"/><path d="M16 4l4 4"/></svg>', onclick: () => eyedrop(app).then(c => c && choose(active, c)) }) : null;
  const swap = h('button', { class: 'wb-cp-drop', type: 'button', title: 'Swap stroke and fill', onclick: () => {
    const a = st.stroke; st.stroke = st.fill; st.fill = a;
    st.stroke.dirty = st.fill.dirty = true;
    set('stroke', st.stroke.off ? null : fmt('stroke')); set('fill', st.fill.off ? null : fmt('fill')); syncUI();
  } }, '⇄');

  wid = widget({ st, active: () => active, setActive: w => { active = w; }, hexOf, commit, refresh: syncUI });
  const el = h('div', { class: 'wb-cp-body' }, h('div', { class: 'wb-cp-wheelbox' }, wid.el), alp,
    h('div', { class: 'wb-cp-row wb-cp-inputs wb-cp-pairrow' }, mkRow('fill', 'Fill'), mkRow('stroke', 'Stroke')),
    h('div', { class: 'wb-cp-row wb-cp-inputs' }, drop, swap, sel), chips);
  syncUI();
  return {
    el, accept: c => choose(active, c), stop: () => wid.stop?.(),
    finish: () => {
      const recent = ['stroke', 'fill'].filter(w => st[w].dirty && !st[w].off).map(fmt);
      if (recent.length) store(RECENT_KEY, [...recent, ...load(RECENT_KEY, []).filter(c => !recent.includes(c))].slice(0, 10));
    },
  };
}

/**
 * Stroke and fill as two dots on one disc of hue (the angle) and chroma (the distance from the middle), in OKLCH, so
 * the distance between the dots is how different the colors look. Lightness is the bar at each side: the left one is
 * the fill's, the right one the stroke's. The disc shows the colors at the lightness of the side touched last. Click
 * the disc to move the nearer dot there. The fill is a solid square, the stroke a hollow one.
 */
const discWidget = ({ st, active, setActive, hexOf, commit, refresh }) => {
  {
    const W = 212, H = 196, CX = W / 2, CY = H / 2, R = 80, BAR = 16, dpr = Math.min(2, window.devicePixelRatio || 1);
    const cv = h('canvas', { class: 'wb-cp-wheelcv', width: W * dpr, height: H * dpr, title: 'Click the disc to move the nearer dot; the bars at the sides set lightness (left: fill, right: stroke)' });
    cv.style.width = `${W}px`; cv.style.height = `${H}px`;
    const ok = {}, okHex = {};
    const cur = w => {   // the side's OKLCH, kept while its hex is the one we made (a gray would forget its hue)
      const hx = hexOf(w);
      if (okHex[w] !== hx) { ok[w] = hexToOklch(hx); okHex[w] = hx; }
      return ok[w];
    };
    const put = (w, L, C, hue) => {
      const c = { L: Math.max(0, Math.min(1, L)), C: fitChroma(Math.max(0, Math.min(1, L)), Math.max(0, Math.min(CHROMA_MAX, C)), hue), h: hue };
      const hx = oklchHex(c.L, c.C, c.h);
      ok[w] = c; okHex[w] = hx; st[w].hsv = hexHsv(hx); st[w].off = false; st[w].dirty = true;
    };
    const at = w => { const c = cur(w), r = (c.C / CHROMA_MAX) * R, a = (c.h * Math.PI) / 180; return [CX + Math.cos(a) * r, CY + Math.sin(a) * r]; };
    const img = document.createElement('canvas'); img.width = img.height = 2 * R;
    const render = () => {
      const ctx = cv.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      // the disc at the active side's lightness: out-of-gamut places stay empty
      const L = cur(active()).L, ictx = img.getContext('2d'), data = ictx.createImageData(2 * R, 2 * R);
      for (let py = 0; py < 2 * R; py++) for (let px = 0; px < 2 * R; px++) {
        const dx = px - R + 0.5, dy = py - R + 0.5, d = Math.hypot(dx, dy);
        if (d > R) continue;
        const lin = oklchLinear(L, (d / R) * CHROMA_MAX, ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360);
        if (!inGamut(lin)) continue;
        const o = (py * 2 * R + px) * 4;
        for (let k = 0; k < 3; k++) { const v = Math.max(0, Math.min(1, lin[k])); data.data[o + k] = Math.round((v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055) * 255); }
        data.data[o + 3] = 255;
      }
      ictx.putImageData(data, 0, 0);
      ctx.drawImage(img, CX - R, CY - R);
      ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(128,128,128,0.45)'; ctx.beginPath(); ctx.arc(CX, CY, R, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(CX, CY, 2, 0, Math.PI * 2); ctx.fillStyle = 'rgba(128,128,128,0.6)'; ctx.fill();
      // the lightness bars, in the dot's own hue and chroma
      for (const [w, bx] of [['fill', 0], ['stroke', W - BAR]]) {
        const c = cur(w);
        for (let yy = 0; yy < H; yy++) { ctx.fillStyle = oklchHex(1 - yy / (H - 1), c.C, c.h); ctx.fillRect(bx, yy, BAR, 1); }
        const my = (1 - c.L) * (H - 1);
        ctx.globalAlpha = st[w].off ? 0.4 : 1;
        marker(ctx, w, bx + BAR / 2, my, 11, hexOf(w));
        ctx.globalAlpha = 1;
      }
      const [p0, p1] = ['stroke', 'fill'].map(at);
      cv.dataset.dots = JSON.stringify({ stroke: p0, fill: p1 });   // for tests and tooling
      ctx.setLineDash([3, 3]); ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.stroke(); ctx.setLineDash([]);
      for (const w of ['stroke', 'fill']) {
        const [sx, sy] = at(w), c = hexOf(w);
        ctx.globalAlpha = st[w].off ? 0.4 : 1;
        marker(ctx, w, sx, sy, 13, c, w === active());
        ctx.globalAlpha = 1;
      }
    };
    cv.addEventListener('pointerdown', ev => {
      const r = cv.getBoundingClientRect(), px = ev.clientX - r.left, py = ev.clientY - r.top;
      let mode = null;
      if (px <= BAR + 2) mode = 'fill-bar'; else if (px >= W - BAR - 2) mode = 'stroke-bar';
      else if (Math.hypot(px - CX, py - CY) <= R + 8) mode = 'disc';
      if (!mode) return;
      ev.preventDefault();
      let w;
      if (mode === 'disc') { w = ['stroke', 'fill'].reduce((a, b) => (Math.hypot(at(a)[0] - px, at(a)[1] - py) <= Math.hypot(at(b)[0] - px, at(b)[1] - py) ? a : b)); }
      else w = mode === 'stroke-bar' ? 'stroke' : 'fill';
      setActive(w);
      const move = e => {
        const qx = e.clientX - r.left, qy = e.clientY - r.top, c = cur(w);
        if (mode === 'disc') put(w, c.L, (Math.hypot(qx - CX, qy - CY) / R) * CHROMA_MAX, ((Math.atan2(qy - CY, qx - CX) * 180) / Math.PI + 360) % 360);
        else put(w, 1 - qy / (H - 1), c.C, c.h);
        refresh();
      };
      move(ev);
      const up = e => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); move(e); commit(w); };
      window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
    });
    return { el: cv, render };
  }
};

/**
 * Stroke and fill as two points in the RGB cube. The points live inside it, not only on its faces: red, green and
 * blue are the three directions, black the corner at the bottom and white the corner at the top (the cube stands on
 * its black corner). Drag the empty space to turn the cube, flick it to let it coast, double-click to reset. Drag a
 * dot and it stays under the pointer: it slides along your line of sight only as far as it must to stay inside the
 * cube; the tiny dots at the corners snap. The fill is a solid square, the stroke a hollow one.
 */
const cubeWidget = ({ st, active, setActive, hexOf, commit, refresh }) => {
  {
    const W = 212, H = 196, S = 52, dpr = Math.min(2, window.devicePixelRatio || 1);
    const HOME = { yaw: -Math.PI / 4, pitch: -0.9553 };   // the gray diagonal upright, white on top
    const view = { ...HOME };
    const cv = h('canvas', { class: 'wb-cp-wheelcv', width: W * dpr, height: H * dpr, title: 'Drag to turn the cube; drag a dot to move it (it can go inside); the corner dots snap; double-click to reset the view' });
    cv.style.width = `${W}px`; cv.style.height = `${H}px`;
    const rgb = w => { const c = hexOf(w); return [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16) / 255); };
    const toHex = c => `#${c.map(v => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')).join('')}`;
    // a color (0..1 each) → view space: x right, y up, z toward the viewer
    const rot = c => {
      const px = (c[0] - 0.5) * 2 * S, py = (c[1] - 0.5) * 2 * S, pz = (c[2] - 0.5) * 2 * S;
      const cy = Math.cos(view.yaw), sy = Math.sin(view.yaw), cp = Math.cos(view.pitch), sp = Math.sin(view.pitch);
      const x1 = px * cy + pz * sy, z1 = -px * sy + pz * cy;
      return [x1, py * cp - z1 * sp, py * sp + z1 * cp];
    };
    const unrot = v => {   // view space → color
      const cy = Math.cos(view.yaw), sy = Math.sin(view.yaw), cp = Math.cos(view.pitch), sp = Math.sin(view.pitch);
      const y1 = v[1] * cp + v[2] * sp, z1 = -v[1] * sp + v[2] * cp;
      const px = v[0] * cy - z1 * sy, pz = v[0] * sy + z1 * cy;
      return [px / (2 * S) + 0.5, y1 / (2 * S) + 0.5, pz / (2 * S) + 0.5];
    };
    const screen = v => [W / 2 + v[0], H / 2 - v[1]];
    const css = c => `rgb(${c.map(v => Math.round(v * 255)).join(',')})`;
    const CORNERS = [0, 1].flatMap(r => [0, 1].flatMap(g => [0, 1].map(b => [r, g, b])));
    const N = 5;
    const faces = [];
    for (let k = 0; k < 3; k++) for (const val of [0, 1]) faces.push({ k, val });
    const at = (k, val, a, b) => { const c = [0, 0, 0]; c[k] = val; c[(k + 1) % 3] = a; c[(k + 2) % 3] = b; return c; };
    const render = () => {
      const ctx = cv.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const order = faces.map(f => ({ ...f, z: rot(at(f.k, f.val, 0.5, 0.5))[2] })).sort((p, q) => p.z - q.z);
      for (const f of order) {
        ctx.globalAlpha = f.z > 0 ? 0.3 : 0.95;
        for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
          const a0 = i / N, a1 = (i + 1) / N, b0 = j / N, b1 = (j + 1) / N;
          const quad = [[a0, b0], [a1, b0], [a1, b1], [a0, b1]].map(([a, b]) => screen(rot(at(f.k, f.val, a, b))));
          const col = css(at(f.k, f.val, (a0 + a1) / 2, (b0 + b1) / 2));
          ctx.beginPath(); quad.forEach(([qx, qy], n) => (n ? ctx.lineTo(qx, qy) : ctx.moveTo(qx, qy))); ctx.closePath();
          ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineWidth = 0.6; ctx.fill(); ctx.stroke();
        }
      }
      ctx.globalAlpha = 0.4; ctx.strokeStyle = '#000'; ctx.lineWidth = 1;
      const line = (c0, c1) => { const p = screen(rot(c0)), q = screen(rot(c1)); ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke(); };
      for (const a of [0, 1]) for (const b of [0, 1]) { line([0, a, b], [1, a, b]); line([a, 0, b], [a, 1, b]); line([a, b, 0], [a, b, 1]); }
      // the corners: tiny dots in their own color (they snap)
      ctx.globalAlpha = 1;
      for (const c of CORNERS) { const [sx, sy] = screen(rot(c)); ctx.beginPath(); ctx.arc(sx, sy, 1.7, 0, Math.PI * 2); ctx.fillStyle = css(c); ctx.fill(); }
      const pts = ['stroke', 'fill'].map(w => ({ w, v: rot(rgb(w)) }));
      const [p0, p1] = pts.map(p => screen(p.v));
      cv.dataset.dots = JSON.stringify({ stroke: p0, fill: p1 });   // where the dots are on the canvas, for tests and tooling
      cv.dataset.corners = JSON.stringify(CORNERS.map(c => screen(rot(c))));
      ctx.setLineDash([3, 3]); ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.stroke(); ctx.setLineDash([]);
      for (const { w, v } of pts) {
        const [sx, sy] = screen(v), r = 7 + (v[2] / S) * 1.5, c = hexOf(w);
        ctx.globalAlpha = st[w].off ? 0.4 : 1;
        marker(ctx, w, sx, sy, 2 * r - 1, c, w === active());
        ctx.globalAlpha = 1;
      }
    };
    /**
     * The color under a screen point (px, py relative to the canvas), as near the given depth as the cube allows: the
     * line of sight through the point crosses the cube over a stretch of depths, and the dot takes the one closest to
     * where it was. Off the cube altogether, it is clamped into it at that depth.
     */
    const pick = (px, py, depth) => {
      const qx = px - W / 2, qy = H / 2 - py;
      let best = null, bd = 9;
      for (const c of CORNERS) { const [sx, sy] = screen(rot(c)); const d = Math.hypot(sx - px, sy - py); if (d < bd) { bd = d; best = c; } }
      if (best) return { c: [...best], depth: rot(best)[2] };
      const a = unrot([qx, qy, 0]), b = unrot([qx, qy, 1]), d = b.map((v, i) => v - a[i]);
      let t0 = -Infinity, t1 = Infinity;
      for (let i = 0; i < 3; i++) {
        if (Math.abs(d[i]) < 1e-9) { if (a[i] < 0 || a[i] > 1) { t0 = Infinity; break; } continue; }
        const u = (0 - a[i]) / d[i], v = (1 - a[i]) / d[i];
        t0 = Math.max(t0, Math.min(u, v)); t1 = Math.min(t1, Math.max(u, v));
      }
      if (t0 <= t1) { const t = Math.max(t0, Math.min(t1, depth)); return { c: a.map((v, i) => Math.max(0, Math.min(1, v + t * d[i]))), depth: t }; }
      return { c: unrot([qx, qy, depth]).map(v => Math.max(0, Math.min(1, v))), depth };
    };
    let raf = 0, vel = [0, 0];
    const coast = () => {
      view.yaw += vel[0]; view.pitch = Math.max(-1.5, Math.min(1.5, view.pitch + vel[1]));
      vel = vel.map(v => v * 0.93);
      refresh();
      raf = Math.abs(vel[0]) + Math.abs(vel[1]) > 0.0004 ? requestAnimationFrame(coast) : 0;
    };
    cv.addEventListener('pointerdown', ev => {
      ev.preventDefault();
      cancelAnimationFrame(raf); raf = 0;
      const r = cv.getBoundingClientRect(), px = ev.clientX - r.left, py = ev.clientY - r.top;
      let grab = null, best = 18;
      for (const w of ['stroke', 'fill']) { const [sx, sy] = screen(rot(rgb(w))); const d = Math.hypot(sx - px, sy - py); if (d < best) { best = d; grab = w; } }
      let lx = ev.clientX, ly = ev.clientY;
      if (grab) {
        setActive(grab); st[grab].off = false;
        let depth = rot(rgb(grab))[2];
        const [ox, oy] = screen(rot(rgb(grab)));
        const dx = px - ox, dy = py - oy;   // keep the grab offset, so the dot does not jump under the pointer
        const move = e => {
          const res = pick(e.clientX - r.left - dx, e.clientY - r.top - dy, depth);
          depth = res.depth;
          st[grab].hsv = hexHsv(toHex(res.c)); st[grab].dirty = true; refresh();
        };
        move(ev);
        const up = e => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); move(e); commit(grab); };
        window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
        return;
      }
      const move = e => {
        const ddx = e.clientX - lx, ddy = e.clientY - ly; lx = e.clientX; ly = e.clientY;
        view.yaw += ddx * 0.012; view.pitch = Math.max(-1.5, Math.min(1.5, view.pitch + ddy * 0.012));
        vel = [ddx * 0.012, ddy * 0.012];
        refresh();
      };
      const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); if (Math.abs(vel[0]) + Math.abs(vel[1]) > 0.004) raf = requestAnimationFrame(coast); };
      window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
    });
    cv.addEventListener('dblclick', () => { Object.assign(view, HOME); vel = [0, 0]; refresh(); });
    return { el: cv, render, stop: () => cancelAnimationFrame(raf) };
  }
};

const MODES_KEY = 'ams_paint_mode';
const MODES = [
  { id: 'fields', title: 'Fields: a field, hue and opacity for each', icon: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="8" height="14" rx="1.5"/><rect x="13" y="5" width="8" height="14" rx="1.5"/></svg>' },
  { id: 'disc', title: 'Disc: hue and chroma on one disc, a lightness bar each', icon: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="8.5"/><circle cx="14.5" cy="9.5" r="1.6" fill="currentColor" stroke="none"/><circle cx="9" cy="14" r="1.6" fill="currentColor" stroke="none"/></svg>' },
  { id: 'cube', title: 'Cube: both colors as points in a spinning RGB cube', icon: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M12 12l8-4.5M12 12L4 7.5M12 12v9"/></svg>' },
];

/**
 * Stroke and fill at (x, y), picked together, in one popup of one size with three modes (the icons at the top): the
 * two fields side by side, a hue/chroma disc, or the RGB cube. io: { stroke, fill, set(which, color|null) }; the colors
 * carry over when you switch.
 */
export function openPaintPicker(app, x, y, io, mode = load(MODES_KEY, 'fields')) {
  open?.close();
  const vals = { stroke: io.stroke, fill: io.fill };
  const set = (w, c) => { vals[w] = c; io.set(w, c); };
  let body = null;
  const holder = h('div', { class: 'wb-cp-mode' });
  const bar = h('div', { class: 'wb-cp-modes', role: 'radiogroup', 'aria-label': 'Picker mode' });
  const mount = id => {
    body?.finish(); body?.stop?.();
    const args = { stroke: vals.stroke, fill: vals.fill, set };
    body = id === 'disc' ? shellBody(app, args, discWidget) : id === 'cube' ? shellBody(app, args, cubeWidget) : fieldsBody(app, args);
    holder.replaceChildren(body.el);
    for (const b of bar.children) { const on = b.dataset.mode === id; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); }
    store(MODES_KEY, id);
  };
  for (const m of MODES) bar.append(h('button', { class: 'wb-cp-modebtn', type: 'button', role: 'radio', 'data-mode': m.id, title: m.title, html: m.icon, onclick: () => mount(m.id) }));
  const pop = h('div', { class: 'wb-cp-pop wb-cp-unified' }, bar, holder);
  document.body.append(pop);
  mount(MODES.some(m => m.id === mode) ? mode : 'fields');
  const pw = pop.offsetWidth || 248, ph = pop.offsetHeight || 380;
  pop.style.left = `${Math.max(8, Math.min(window.innerWidth - pw - 8, x - pw / 2))}px`;
  pop.style.top = `${Math.max(8, Math.min(window.innerHeight - ph - 8, y - 24))}px`;
  const close = () => {
    pop.remove();
    window.removeEventListener('pointerdown', outside, true);
    window.removeEventListener('keydown', esc, true);
    body.finish(); body.stop?.();
    open = null;
  };
  const outside = e => { if (!pop.contains(e.target)) close(); };
  const esc = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  setTimeout(() => { window.addEventListener('pointerdown', outside, true); window.addEventListener('keydown', esc, true); });
  open = { close, accept: c => body.accept(c) };
  return { close };
}


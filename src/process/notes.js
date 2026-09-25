/**
 * Notes: writing on the process. Laid out in artboard units, so a note is part of the page,
 * like handwriting in a notebook, rather than a screen overlay.
 *
 * e.note = { style: notebook | sticky | card | plain, font: hand | print | serif | sans | mono,
 *            size (artboard units), width (wrap width), bg (colour or null), angle (radians) }
 * The text colour is the element's colour.
 */
export const NOTE_STYLES = {
  notebook: 'Notebook: handwriting on the page',
  sticky: 'Sticky note',
  card: 'Index card',
  plain: 'Plain text'
};

export const NOTE_FONTS = {
  hand: ['Handwriting', '"Caveat", "Patrick Hand", cursive'],
  print: ['Printed hand', '"Patrick Hand", "Caveat", cursive'],
  serif: ['Serif', '"Newsreader", Georgia, serif'],
  sans: ['Sans', 'Inter, system-ui, sans-serif'],
  mono: ['Mono', 'ui-monospace, Menlo, monospace']
};

const STYLE_DEFAULTS = {
  notebook: { font: 'hand', size: 22, bg: null, ink: '#3a332b' },
  sticky: { font: 'print', size: 17, bg: '#fbe9a6', ink: '#2b2620' },
  card: { font: 'print', size: 17, bg: '#fbfaf5', ink: '#2b2620' },
  plain: { font: 'sans', size: 15, bg: null, ink: '#2b2620' }
};

export function noteProps(e) {
  const n = e.note || {};
  const style = NOTE_STYLES[n.style] ? n.style : 'notebook';
  const d = STYLE_DEFAULTS[style];
  return {
    style,
    font: NOTE_FONTS[n.font] ? n.font : d.font,
    size: Number(n.size) > 0 ? Number(n.size) : d.size,
    width: Number(n.width) > 0 ? Number(n.width) : 280,
    bg: n.bg === undefined ? d.bg : n.bg,
    angle: Number(n.angle) || 0,
    ink: e.color || d.ink
  };
}

let measurer = null;
function measureCtx() {
  if (measurer) return measurer;
  try {
    const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(8, 8) : document.createElement('canvas');
    measurer = c.getContext('2d');
  } catch { measurer = { font: '', measureText: t => ({ width: String(t).length * 0.5 * (parseFloat(measurer.font) || 16) }) }; }
  return measurer;
}

function wrap(ctx, text, maxW) {
  const out = [];
  for (const para of String(text).split('\n')) {
    let line = '';
    for (const w of para.split(' ')) {
      const t = line ? `${line} ${w}` : w;
      if (ctx.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t;
    }
    out.push(line);
  }
  return out;
}

/** Box and wrapped lines of a note, in artboard units (unrotated, from its top-left point). */
export function noteLayout(e) {
  const p = noteProps(e);
  const [x, y] = e.points[0] || [0, 0];
  const ctx = measureCtx();
  ctx.font = `${p.size}px ${NOTE_FONTS[p.font][1]}`;
  const text = e.text || e.why || '';
  const pad = p.bg ? p.size * 0.55 : p.size * 0.15;
  const lines = text ? wrap(ctx, text, p.width - pad * 2) : [''];
  const lh = p.size * (p.font === 'hand' ? 1.15 : 1.32);
  return { x, y, w: p.width, h: lines.length * lh + pad * 2, pad, lh, lines, props: p };
}

/** The four corners of a note's box in artboard units, after its rotation (about its top-left). */
export function noteCorners(e) {
  const L = noteLayout(e);
  const c = Math.cos(L.props.angle), s = Math.sin(L.props.angle);
  return [[0, 0], [L.w, 0], [L.w, L.h], [0, L.h]].map(([u, v]) => [L.x + u * c - v * s, L.y + u * s + v * c]);
}

export function drawNote(ctx, e) {
  const L = noteLayout(e);
  const p = L.props;
  if (!e.text && !e.why) return;
  ctx.save();
  ctx.translate(L.x, L.y);
  if (p.angle) ctx.rotate(p.angle);
  if (p.bg) {
    if (p.style === 'sticky') { ctx.shadowColor = 'rgba(0,0,0,0.18)'; ctx.shadowBlur = p.size * 0.5; ctx.shadowOffsetY = p.size * 0.15; }
    ctx.fillStyle = p.bg;
    ctx.fillRect(0, 0, L.w, L.h);
    ctx.shadowColor = 'transparent';
    if (p.style === 'card') {
      // Index card: a red top rule and faint blue lines.
      ctx.globalAlpha *= 0.5;
      ctx.strokeStyle = '#8fb3d9'; ctx.lineWidth = Math.max(0.5, p.size * 0.04);
      for (let i = 1; i <= L.lines.length; i++) { const yy = L.pad + i * L.lh + p.size * 0.12; ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(L.w, yy); ctx.stroke(); }
      ctx.strokeStyle = '#d98b8b'; ctx.beginPath(); ctx.moveTo(0, L.pad + p.size * 0.12); ctx.lineTo(L.w, L.pad + p.size * 0.12); ctx.stroke();
      ctx.globalAlpha /= 0.5;
    }
  }
  ctx.fillStyle = p.ink;
  ctx.font = `${p.size}px ${NOTE_FONTS[p.font][1]}`;
  ctx.textBaseline = 'alphabetic';
  L.lines.forEach((l, i) => ctx.fillText(l, L.pad, L.pad + (i + 1) * L.lh - L.lh * 0.25));
  ctx.restore();
}

/** SVG for a note (text wrapped as tspans; rotation as a transform). */
export function noteSVG(e, esc, r2) {
  const L = noteLayout(e);
  const p = L.props;
  const tf = p.angle ? ` transform="rotate(${r2((p.angle * 180) / Math.PI)} ${r2(L.x)} ${r2(L.y)})"` : '';
  const bg = p.bg ? `<rect x="${r2(L.x)}" y="${r2(L.y)}" width="${r2(L.w)}" height="${r2(L.h)}" fill="${esc(p.bg)}"/>` : '';
  const spans = L.lines.map((l, i) => `<tspan x="${r2(L.x + L.pad)}" y="${r2(L.y + L.pad + (i + 1) * L.lh - L.lh * 0.25)}">${esc(l)}</tspan>`).join('');
  return `<g${tf}>${bg}<text font-family="${esc(NOTE_FONTS[p.font][1])}" font-size="${r2(p.size)}" fill="${esc(p.ink)}">${spans}</text></g>`;
}

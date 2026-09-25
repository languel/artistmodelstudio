/**
 * Render a process document to a 2D canvas context.
 *
 * mode:
 *   'picture'  the finished picture: construction (guides, gestures, notes) left out
 *   'process'  the picture plus construction overlays and notes
 * upTo:       render only stages up to and including this index (filmstrip, replay)
 * transform:  { x, y, scale }, artboard → screen
 */
import { BRUSHES, mulberry32, resolveParams, installLines } from './brushes.js';

export function renderDocument(ctx, doc, {
  mode = 'process', upTo = Infinity, transform = { x: 0, y: 0, scale: 1 },
  selected = new Set(), hovered = null, ground = true, showNotes = true, screenNotes = false, selectColor = '#8a8a8a'
} = {}) {
  const { width, height } = doc.artboard;
  ctx.save();
  ctx.translate(transform.x, transform.y);
  ctx.scale(transform.scale, transform.scale);
  if (ground) {
    ctx.fillStyle = doc.artboard.ground || '#ffffff';
    ctx.fillRect(0, 0, width, height);
  }
  const rank = new Map(doc.stages.map((s, i) => [s.id, i]));
  const stageOf = new Map(doc.stages.map(s => [s.id, s]));
  const ordered = doc.elements
    .map((e, i) => [e, i])
    .sort((a, b) => (rank.get(a[0].stage) ?? 0) - (rank.get(b[0].stage) ?? 0) || a[1] - b[1])
    .map(([e]) => e);

  installLines(doc);
  const env = { scale: transform.scale, rng: null };
  const overlay = [];
  for (const e of ordered) {
    const s = stageOf.get(e.stage);
    if (!s || !s.visible) continue;
    if ((rank.get(e.stage) ?? 0) > upTo) continue;
    const brush = BRUSHES[e.realize?.brush] || BRUSHES.ink;
    const construction = brush.construction || e.role === 'guide' || e.role === 'gesture' || e.role === 'note';
    if (construction) { overlay.push(e); continue; }
    env.rng = mulberry32(e.seed || 1);
    brush.draw(ctx, e, resolveParams(e.realize.brush, e.realize.params), env);
  }
  if (mode === 'process') {
    for (const e of overlay) {
      env.rng = mulberry32(e.seed || 1);
      if (e.role === 'note') { if (showNotes) drawNote(ctx, e, screenNotes ? transform.scale : 1); continue; }
      const brushId = BRUSHES[e.realize?.brush]?.construction ? e.realize.brush : 'guide';
      BRUSHES[brushId].draw(ctx, e, resolveParams(brushId, e.realize.params), env);
    }
  }
  // Selection and hover outlines.
  for (const e of doc.elements) {
    if (!selected.has(e.id) && hovered !== e.id) continue;
    ctx.save();
    ctx.strokeStyle = selectColor; ctx.globalAlpha = selected.has(e.id) ? 1 : 0.5;
    ctx.lineWidth = 1.5 / transform.scale;
    ctx.setLineDash([4 / transform.scale, 3 / transform.scale]);
    const xs = e.points.map(p => p[0]), ys = e.points.map(p => p[1]);
    const pad = 6 / transform.scale;
    if (xs.length) ctx.strokeRect(Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) - Math.min(...xs) + pad * 2, Math.max(...ys) - Math.min(...ys) + pad * 2);
    ctx.restore();
  }
  ctx.restore();
}

/** scale: screen px per unit when notes should keep a readable screen size (canvas view), else 1. */
function drawNote(ctx, e, scale) {
  const [x, y] = e.points[0] || [0, 0];
  const text = e.text || e.why || '';
  if (!text) return;
  ctx.save();
  const fs = 13 / scale;
  ctx.font = `${fs}px Inter, system-ui, sans-serif`;
  const lines = wrap(ctx, text, 220 / scale);
  const w = Math.max(...lines.map(l => ctx.measureText(l).width)) + 12 / scale;
  const h = lines.length * fs * 1.3 + 10 / scale;
  ctx.fillStyle = e.color || 'rgba(255, 236, 150, 0.92)';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#2b2620';
  lines.forEach((l, i) => ctx.fillText(l, x + 6 / scale, y + 5 / scale + fs * (i + 0.95) * 1.3 - fs * 0.25));
  ctx.restore();
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

/** Render to an offscreen canvas at the artboard's size (or scaled), for exports and thumbnails. */
export function renderToCanvas(doc, { scale = 1, mode = 'picture', upTo = Infinity } = {}) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(doc.artboard.width * scale));
  c.height = Math.max(1, Math.round(doc.artboard.height * scale));
  renderDocument(c.getContext('2d'), doc, { mode, upTo, transform: { x: 0, y: 0, scale } });
  return c;
}

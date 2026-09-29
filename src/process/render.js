/**
 * Render a process document to a 2D canvas context.
 *
 * mode:
 *   'picture'  the finished picture: construction (guides, gestures, notes) left out
 *   'process'  the picture plus construction overlays and notes
 * upTo:       render only stages up to and including this index (filmstrip, replay)
 * transform:  { x, y, scale }, artboard → screen
 */
import { envelope, reveal, expired, changing, cutPath } from './envelope.js';
import { BRUSHES, mulberry32, resolveParams, installLines, KIT } from './brushes.js';
import { boardDoc, boardsOf, MAIN } from './boards.js';
import { drawNote, noteCorners } from './notes.js';

// A mark's opacity from its time envelope, for the mark being drawn (read by withLook).
let TIME_ALPHA = 1;

/** Does any mark still change with time (fading, drawing, looping) at `now` (epoch ms)? Then the view must keep redrawing. */
export function timedActive(doc, now) {
  for (const e of doc.elements) if (e.time && changing(e.time, (now - (e.born ?? now)) / 1000)) return true;
  return false;
}

export function renderDocument(ctx, doc, {
  mode = 'process', upTo = Infinity, transform = { x: 0, y: 0, scale: 1 },
  selected = new Set(), hovered = null, ground = true, showNotes = true, screenNotes = false, selectColor = '#8a8a8a', frozen = false, now = null
} = {}) {
  const { width, height } = doc.artboard;
  ctx.save();
  ctx.translate(transform.x, transform.y);
  ctx.scale(transform.scale, transform.scale);
  if (ground) {
    // Every board's paper (a single board, as exported, is just the artboard).
    for (const b of boardsOf(doc)) { ctx.fillStyle = b.ground || '#ffffff'; ctx.fillRect(b.x, b.y, b.width, b.height); }
  }
  const rank = new Map(doc.stages.map((s, i) => [s.id, i]));
  const stageOf = new Map(doc.stages.map(s => [s.id, s]));
  const ordered = doc.elements
    .map((e, i) => [e, i])
    .sort((a, b) => (rank.get(a[0].stage) ?? 0) - (rank.get(b[0].stage) ?? 0) || a[1] - b[1])
    .map(([e]) => e);

  installLines(doc);
  const env = { scale: transform.scale, rng: null, frozen, now, age: 0 };
  const boardRects = new Map(boardsOf(doc).map(b => [b.id, { x: b.x, y: b.y, width: b.width, height: b.height }]));
  const overlay = [];
  for (const e0 of ordered) {
    let e = e0;
    const s = stageOf.get(e.stage);
    if (!s || !s.visible || e.hidden) continue;
    if ((rank.get(e.stage) ?? 0) > upTo) continue;
    // Time: a mark with an envelope fades (and draws itself on) by its age; gone when its life is over.
    TIME_ALPHA = 1; env.age = 0;
    if (now != null && e.time) {
      const age = (now - (e.born ?? now)) / 1000;
      if (expired(e.time, age)) continue;
      TIME_ALPHA = envelope(e.time, age);
      if (TIME_ALPHA <= 0.003) continue;
      env.age = age;
      const share = reveal(e.time, age);
      if (share < 1) e = { ...e, points: cutPath(e.points, share) };
    }
    const brush = BRUSHES[e.realize?.brush] || BRUSHES.ink;
    const construction = brush.construction || e.role === 'guide' || e.role === 'gesture' || e.role === 'note';
    if (construction) { overlay.push(e); continue; }
    env.rng = mulberry32(e.seed || 1);
    env.straight = e.path === 'straight';
    env.board = boardRects.get(e.board || MAIN) || boardRects.get(MAIN);
    if (e.color === 'none') {
      // No stroke: only the fill (a plane's brush paints it).
      if (e.fill && e.role === 'plane') withLook(ctx, e, () => brush.draw(ctx, { ...e, color: e.fill }, resolveParams(e.realize.brush, e.realize.params), env));
      else if (e.fill && e.points.length > 2 && e.closed) withLook(ctx, e, () => fillShape(ctx, e));
      continue;
    }
    if (e.fill && e.role === 'plane') {
      // A plane's brush is its fill; the stroke outlines it.
      withLook(ctx, e, () => { brush.draw(ctx, { ...e, color: e.fill }, resolveParams(e.realize.brush, e.realize.params), env); if (e.color) strokeShape(ctx, e, env.scale); });
      continue;
    }
    if (e.fill && e.points.length > 2 && e.closed) withLook(ctx, e, () => fillShape(ctx, e));
    withLook(ctx, e, () => brush.draw(ctx, e, resolveParams(e.realize.brush, e.realize.params), env));
  }
  TIME_ALPHA = 1;
  if (mode === 'process') {
    for (const e of overlay) {
      env.rng = mulberry32(e.seed || 1);
      env.straight = e.path === 'straight';
      if (e.role === 'note') { if (showNotes) withLook(ctx, e, () => drawNote(ctx, e)); continue; }
      const brushId = BRUSHES[e.realize?.brush]?.construction ? e.realize.brush : 'guide';
      withLook(ctx, e, () => BRUSHES[brushId].draw(ctx, e, resolveParams(brushId, e.realize.params), env));
    }
  }
  // Selection and hover outlines.
  for (const e of doc.elements) {
    if (!selected.has(e.id) && hovered !== e.id) continue;
    ctx.save();
    ctx.strokeStyle = selectColor; ctx.globalAlpha = selected.has(e.id) ? 1 : 0.5;
    ctx.lineWidth = 1.5 / transform.scale;
    ctx.setLineDash([4 / transform.scale, 3 / transform.scale]);
    const pts = e.role === 'note' ? noteCorners(e) : e.points;
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    const pad = 6 / transform.scale;
    if (xs.length) ctx.strokeRect(Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) - Math.min(...xs) + pad * 2, Math.max(...ys) - Math.min(...ys) + pad * 2);
    ctx.restore();
  }
  ctx.restore();
}

/** scale: screen px per unit when notes should keep a readable screen size (canvas view), else 1. */
/** An element's own opacity and blend mode, on top of whatever its brush does. */
function withLook(ctx, e, draw) {
  if ((e.opacity ?? 1) >= 1 && TIME_ALPHA >= 1 && (!e.blend || e.blend === 'normal')) return draw();
  ctx.save();
  ctx.globalAlpha *= (e.opacity ?? 1) * TIME_ALPHA;
  if (e.blend && e.blend !== 'normal') ctx.globalCompositeOperation = e.blend;
  draw();
  ctx.restore();
}

/** Render to an offscreen canvas at the artboard's size (or scaled), for exports and thumbnails. */
export function renderToCanvas(doc, { scale = 1, mode = 'picture', upTo = Infinity, board = MAIN } = {}) {
  doc = boardDoc(doc, board);
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(doc.artboard.width * scale));
  c.height = Math.max(1, Math.round(doc.artboard.height * scale));
  renderDocument(c.getContext('2d'), doc, { mode, upTo, transform: { x: 0, y: 0, scale } });
  return c;
}

/** Fill: the inside of a closed mark, painted under its stroke. */
function fillShape(ctx, e) {
  const pts = e.path === 'straight' ? e.points : KIT.smoothPath(e.points, true);
  ctx.save();
  ctx.fillStyle = e.fill;
  KIT.tracePath(ctx, pts, true);
  ctx.fill();
  ctx.restore();
}

function strokeShape(ctx, e) {
  ctx.save();
  ctx.strokeStyle = e.color; ctx.lineWidth = 2; ctx.lineJoin = 'round';
  KIT.tracePath(ctx, e.path === 'straight' ? e.points : KIT.smoothPath(e.points, true), true);
  ctx.stroke();
  ctx.restore();
}

/**
 * Render a process document to a 2D canvas context.
 *
 * mode:
 *   'picture'  the finished picture: construction (guides, gestures, notes) left out
 *   'process'  the picture plus construction overlays and notes
 * upTo:       render only stages up to and including this index (filmstrip, replay)
 * transform:  { x, y, scale }, artboard → screen
 */
import { envelope, reveal, expired, nextChange, cutPath } from './envelope.js';
import { BRUSHES, mulberry32, resolveParams, installLines, KIT } from './brushes.js';
import { boardDoc, boardsOf, MAIN } from './boards.js';
import { drawNote, noteCorners } from './notes.js';
import { txBeginFrame, txArm, txDisarm, txKnown, txBlit, txHash, txPpu } from './texture.js';

// A mark's opacity from its time envelope, for the mark being drawn (read by withLook).
let TIME_ALPHA = 1;

/**
 * Milliseconds until a mark with a time envelope next changes: 0 while any mark is fading or drawing itself (the view must keep
 * redrawing), the wait until the next mark starts to fade out or is gone, Infinity when nothing will change.
 */
export function nextTimed(doc, now) {
  let wait = Infinity;
  for (const e of doc.elements) {
    if (!e.time) continue;
    const w = nextChange(e.time, (now - (e.born ?? now)) / 1000);
    if (w === 0) return 0;
    if (w < wait) wait = w;
  }
  return wait * 1000;
}
/** Does any mark still move (fade, draw on, loop) at `now` (epoch ms)? */
export const timedActive = (doc, now) => nextTimed(doc, now) === 0;

export function renderDocument(ctx, doc, {
  mode = 'process', upTo = Infinity, transform = { x: 0, y: 0, scale: 1 },
  selected = new Set(), hovered = null, ground = true, showNotes = true, screenNotes = false, selectColor = '#8a8a8a', frozen = false, now = null, view = null, hideTravelers = false
} = {}) {
  const { width, height } = doc.artboard;
  txBeginFrame();
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
  const env = { scale: transform.scale, rng: null, frozen, now, age: 0, hideTravelers };
  const boardRects = new Map(boardsOf(doc).map(b => [b.id, { x: b.x, y: b.y, width: b.width, height: b.height, mask: Boolean(b.mask) }]));
  env.boards = boardRects;
  const overlay = [];
  for (const e0 of ordered) {
    let e = e0;
    const s = stageOf.get(e.stage);
    if (!s || !s.visible || e.hidden) continue;
    if ((rank.get(e.stage) ?? 0) > upTo) continue;
    // Time: a mark with an envelope fades (and draws itself on) by its age; gone when its life is over.
    TIME_ALPHA = 1; env.age = 0;
    let share = 1;
    if (now != null && e.time) {
      const age = (now - (e.born ?? now)) / 1000;
      if (expired(e.time, age)) continue;
      TIME_ALPHA = envelope(e.time, age);
      if (TIME_ALPHA <= 0.003) continue;
      env.age = age;
      share = reveal(e.time, age);
    }
    const brush = BRUSHES[e.realize?.brush] || BRUSHES.ink;
    // A textured mark is painted once (its layer is kept): fading is a change of opacity, drawing on a clip, and a
    // mark whose layer is known is put on the picture without asking its brush.
    // A masked board crops its marks to its rectangle (only the marks that reach over the edge pay for a clip).
    const br = boardRects.get(e.board || MAIN), rect = br?.mask ? br : null;
    if (brush.texture && !e.fill && e.color !== 'none' && e.role !== 'guide' && e.role !== 'gesture' && e.role !== 'note') {
      drawTextured(ctx, e, brush, env, share, view, rect);
      continue;
    }
    if (share < 1) e = { ...e, points: cutPath(e.points, share) };
    const construction = brush.construction || e.role === 'guide' || e.role === 'gesture' || e.role === 'note';
    if (construction) { overlay.push(e); continue; }
    env.rng = mulberry32(e.seed || 1);
    env.straight = e.path === 'straight';
    env.board = boardRects.get(e.board || MAIN) || boardRects.get(MAIN);
    const cropped = rect && spills(e.points, (Number(e.realize?.params?.width) || 20) * 1.5, rect);
    if (cropped) cropTo(ctx, rect);
    drawGeneric(ctx, e, brush, env);
    if (cropped) ctx.restore();
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
  drawOutlines(ctx, doc.elements, selected, hovered, selectColor, transform.scale);
  ctx.restore();
}

/** Selection and hover outlines, in the units of the current transform (scale: screen pixels per unit). */
export function drawOutlines(ctx, elements, selected, hovered, selectColor, scale) {
  for (const e of elements) {
    if (!selected.has(e.id) && hovered !== e.id) continue;
    ctx.save();
    ctx.strokeStyle = selectColor; ctx.globalAlpha = selected.has(e.id) ? 1 : 0.5;
    ctx.lineWidth = 1.5 / scale;
    ctx.setLineDash([4 / scale, 3 / scale]);
    const pts = e.role === 'note' ? noteCorners(e) : e.points;
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    const pad = 6 / scale;
    if (xs.length) ctx.strokeRect(Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) - Math.min(...xs) + pad * 2, Math.max(...ys) - Math.min(...ys) + pad * 2);
    ctx.restore();
  }
}

/** A mark that is not textured: its fill, its stroke, its brush (see the loop above). */
function drawGeneric(ctx, e, brush, env) {
  if (e.color === 'none') {
    // No stroke: only the fill (a plane's brush paints it).
    if (e.fill && e.role === 'plane') withLook(ctx, e, () => brush.draw(ctx, { ...e, color: e.fill }, resolveParams(e.realize.brush, e.realize.params), env));
    else if (e.fill && e.points.length > 2 && e.closed) withLook(ctx, e, () => fillShape(ctx, e));
    return;
  }
  if (e.role === 'plane' && !e.fill) {
    // No fill: a plane is its outline alone (closed, straight or smooth), in the stroke color.
    withLook(ctx, e, () => strokeShape(ctx, { ...e, color: e.color || '#1d1b19' }));
    return;
  }
  if (e.fill && e.role === 'plane') {
    // A plane's brush is its fill; the stroke outlines it.
    withLook(ctx, e, () => { brush.draw(ctx, { ...e, color: e.fill }, resolveParams(e.realize.brush, e.realize.params), env); if (e.color) strokeShape(ctx, e, env.scale); });
    return;
  }
  if (e.fill && e.points.length > 2 && e.closed) withLook(ctx, e, () => fillShape(ctx, e));
  withLook(ctx, e, () => brush.draw(ctx, e, resolveParams(e.realize.brush, e.realize.params), env));
}

/** Does a mark (its points grown by `pad`) reach over the edge of a board rect { x, y, width, height }? */
function spills(points, pad, r) {
  for (const q of points) if (q[0] - pad < r.x || q[0] + pad > r.x + r.width || q[1] - pad < r.y || q[1] + pad > r.y + r.height) return true;
  return false;
}
/** Draw what follows only inside the rect (the caller restores). */
function cropTo(ctx, r) { ctx.save(); ctx.beginPath(); ctx.rect(r.x, r.y, r.width, r.height); ctx.clip(); }

/** Can the mark reach into the view (world units, [x0, y0, x1, y1])? Its points, grown by its brush's width. */
function reaches(points, pad, view) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const q of points) { if (q[0] < x0) x0 = q[0]; if (q[0] > x1) x1 = q[0]; if (q[1] < y0) y0 = q[1]; if (q[1] > y1) y1 = q[1]; }
  return x1 + pad >= view[0] && x0 - pad <= view[2] && y1 + pad >= view[1] && y0 - pad <= view[3];
}

/** A clip that shows the first `share` of a stroke: a strip along its path, as wide as the brush can be. */
function revealClip(ctx, points, share, half) {
  const cut = cutPath(points, share), n = cut.length;
  ctx.beginPath();
  if (n < 2) { ctx.rect(0, 0, 0, 0); ctx.clip(); return; }
  const left = [], right = [];
  for (let i = 0; i < n; i++) {
    const a = cut[Math.max(0, i - 1)], b = cut[Math.min(n - 1, i + 1)];
    let dx = b[0] - a[0], dy = b[1] - a[1];
    const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
    let x = cut[i][0], y = cut[i][1];
    if (i === n - 1) { x += dx * half * 0.4; y += dy * half * 0.4; }   // the tip runs a little ahead
    left.push([x - dy * half, y + dx * half]); right.push([x + dy * half, y - dx * half]);
  }
  ctx.moveTo(left[0][0], left[0][1]);
  for (let i = 1; i < n; i++) ctx.lineTo(left[i][0], left[i][1]);
  for (let i = n - 1; i >= 0; i--) ctx.lineTo(right[i][0], right[i][1]);
  ctx.closePath();
  ctx.clip();
}

/** A mark of a textured brush (see texture.js): known layers are blitted, the first time the brush paints it. */
function drawTextured(ctx, e, brush, env, share, view, rect) {
  const id = e.realize.brush, p = resolveParams(id, e.realize.params);
  const alpha = (e.opacity ?? 1) * TIME_ALPHA, blend = e.blend && e.blend !== 'normal' ? e.blend : null;
  const clipped = share < 1 && p.width > 0 && e.role === 'line';
  const fk = `${txHash(id, e.points, p, e.seed)}|${e.color}|${txPpu(env.scale)}`;
  const known = txKnown(fk);
  if (known) {
    const l = known.layer;
    if (view && (l.x > view[2] || l.y > view[3] || l.x + l.w < view[0] || l.y + l.h < view[1])) return;
    const cropped = rect && (l.x < rect.x || l.y < rect.y || l.x + l.w > rect.x + rect.width || l.y + l.h > rect.y + rect.height);
    if (!clipped && !blend && !cropped) { txBlit(ctx, known, alpha); return; }
    ctx.save();
    if (cropped) { ctx.beginPath(); ctx.rect(rect.x, rect.y, rect.width, rect.height); ctx.clip(); }
    if (blend) ctx.globalCompositeOperation = blend;
    if (clipped) revealClip(ctx, e.points, share, p.width * 0.8);
    txBlit(ctx, known, alpha);
    ctx.restore();
    return;
  }
  if (view && !reaches(e.points, (p.width || 30) * 1.2, view)) return;
  env.rng = mulberry32(e.seed || 1);
  env.straight = e.path === 'straight';
  env.board = env.boards?.get(e.board || MAIN) || env.boards?.get(MAIN);
  ctx.save();
  ctx.globalAlpha *= alpha;
  if (rect && spills(e.points, (p.width || 30) * 1.2, rect)) { ctx.beginPath(); ctx.rect(rect.x, rect.y, rect.width, rect.height); ctx.clip(); }
  if (blend) ctx.globalCompositeOperation = blend;
  if (clipped) revealClip(ctx, e.points, share, p.width * 0.8);
  if (known === null) txArm(fk);
  try { brush.draw(ctx, e, p, env); } finally { if (known === null) txDisarm(); }
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

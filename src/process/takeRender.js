/**
 * One frame of a take: the document at t (under the camera), the pen at work, and the captions
 * and title cards burned in. Used by the in-app player, the standalone HTML player and video export.
 */
import { renderDocument } from './render.js';
import { docAt, cameraAt, activeAt } from './take.js';

/** Where the artboard sits in a W×H frame for the camera at t (z = 1 fits the artboard). */
export function frameTransform(take, t, W, H, doc) {
  const ab = doc.artboard;
  const fit = Math.min(W / ab.width, H / ab.height);
  const cam = cameraAt(take, t) || { cx: 0.5, cy: 0.5, z: 1 };
  const scale = fit * cam.z;
  return { x: W / 2 - cam.cx * ab.width * scale, y: H / 2 - cam.cy * ab.height * scale, scale };
}

export function renderFrame(ctx, take, t, { width, height, mode = 'process', captions = true, background = '#1b1b1b', pen = true } = {}) {
  const doc = docAt(take, t);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);
  const tf = frameTransform(take, t, width, height, doc);
  renderDocument(ctx, doc, { mode, transform: tf, ground: true });
  if (pen) drawPen(ctx, doc, tf);
  ctx.restore();
  if (captions) drawCaptions(ctx, take, t, width, height);
}

/** A small pen tip at the end of every stroke still being drawn. */
export function drawPen(ctx, doc, tf) {
  ctx.save();
  for (const e of doc.elements) {
    if (!(e.partial < 1) || !e.points.length) continue;
    const [x, y] = e.points[e.points.length - 1];
    const sx = tf.x + x * tf.scale, sy = tf.y + y * tf.scale;
    ctx.fillStyle = 'rgba(20,18,16,0.85)';
    ctx.beginPath(); ctx.arc(sx, sy, 3.2, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(sx, sy, 5.5, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
}

const fadeOf = (c, t) => { const f = c.fx?.fade ?? 250; if (!f) return 1; return Math.max(0, Math.min(1, (t - c.start) / f, (c.start + c.dur - t) / f)); };

function wrapLines(ctx, text, maxW) {
  const out = [];
  for (const para of String(text || '').split('\n')) {
    let line = '';
    for (const w of para.split(' ')) { const tt = line ? `${line} ${w}` : w; if (ctx.measureText(tt).width > maxW && line) { out.push(line); line = w; } else line = tt; }
    out.push(line);
  }
  return out;
}

/** Narration as a caption at the bottom; title cards over the whole frame. */
export function drawCaptions(ctx, take, t, W, H) {
  const unit = Math.min(W, H);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  for (const c of activeAt(take, 'title', t)) {
    const a = fadeOf(c, t);
    ctx.globalAlpha = a * 0.82; ctx.fillStyle = '#141312'; ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = a; ctx.fillStyle = '#f3efe6'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `600 ${Math.round(unit * 0.055)}px Inter, system-ui, sans-serif`;
    const lines = wrapLines(ctx, c.text, W * 0.8);
    lines.forEach((l, i) => ctx.fillText(l, W / 2, H / 2 + (i - (lines.length - 1) / 2) * unit * 0.07 - (c.sub ? unit * 0.03 : 0)));
    if (c.sub) { ctx.globalAlpha = a * 0.7; ctx.font = `${Math.round(unit * 0.03)}px Inter, system-ui, sans-serif`; ctx.fillText(c.sub, W / 2, H / 2 + lines.length * unit * 0.04 + unit * 0.02); }
  }
  const says = activeAt(take, 'say', t);
  if (says.length) {
    const c = says[says.length - 1], a = fadeOf(c, t);
    const fs = Math.round(unit * 0.03), pad = fs * 0.8, maxW = W * 0.84;
    ctx.font = `${fs}px Inter, system-ui, sans-serif`;
    const lines = wrapLines(ctx, c.text, maxW - pad * 2);
    const w = Math.min(maxW, Math.max(...lines.map(l => ctx.measureText(l).width)) + pad * 2), h = lines.length * fs * 1.35 + pad * 1.4;
    const x = (W - w) / 2, y = H - h - unit * 0.04;
    ctx.globalAlpha = a * 0.78; ctx.fillStyle = '#141312';
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, fs * 0.5) : ctx.rect(x, y, w, h); ctx.fill();
    ctx.globalAlpha = a; ctx.fillStyle = '#f3efe6'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    lines.forEach((l, i) => ctx.fillText(l, x + pad, y + pad * 0.7 + i * fs * 1.35));
  }
  ctx.restore();
}

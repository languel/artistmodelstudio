/**
 * The laser pointer's trail as one shape: a ribbon along the smoothed path, as wide at the head as the dot and
 * tapering to nothing at the tail. It is filled once with full opacity, so the trail is continuous (no joints,
 * no overlapping alpha) and the fade is the taper.
 */
import { smoothPath } from '../process/walk.js';

/** Head width (screen px) and how fast it thins with age (a: 0 at the head, 1 at the tail). */
const HEAD = 12;
export const laserWidth = a => 1 + (HEAD - 1) * Math.pow(1 - Math.min(1, Math.max(0, a)), 1.5);

/**
 * The outline of one trail in screen px, as two sides (left, right) from the tail to the head, plus the head's
 * position. pts: [{ x, y, t }] in screen px, oldest first; now: the time (ms) the trail is drawn at; life: ms.
 * Returns null when there is nothing to draw.
 */
export function laserOutline(pts, now, life, { head = null } = {}) {
  const src = pts.map(p => [p.x, p.y, p.t, 0.5]);
  if (head) src.push([head.x, head.y, now, 0.5]);
  // Only the head (the trail has aged out, but the pointer is still down): just the dot.
  if (src.length < 2) return head ? { left: [], right: [], head: [head.x, head.y, laserWidth(0) / 2] } : null;
  const path = src.length >= 3 ? smoothPath(src, false) : src;
  const n = path.length, left = [], right = [];
  for (let i = 0; i < n; i++) {
    const a = path[Math.max(0, i - 1)], b = path[Math.min(n - 1, i + 1)];
    let tx = b[0] - a[0], ty = b[1] - a[1];
    const len = Math.hypot(tx, ty) || 1;
    tx /= len; ty /= len;
    const w = laserWidth((now - path[i][2]) / life) / 2;
    left.push([path[i][0] - ty * w, path[i][1] + tx * w]);
    right.push([path[i][0] + ty * w, path[i][1] - tx * w]);
  }
  const last = path[n - 1];
  return { left, right, head: [last[0], last[1], laserWidth(0) / 2] };
}

/** Fill a trail's outline on a 2d context (one path, one fill: no overlapping alpha). */
export function fillLaserOutline(ctx, outline, color) {
  if (!outline) return;
  const { left, right, head } = outline;
  ctx.fillStyle = color;
  ctx.beginPath();
  left.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i][0], right[i][1]);
  ctx.closePath();
  ctx.fill('nonzero');
  if (head) { ctx.beginPath(); ctx.arc(head[0], head[1], head[2], 0, Math.PI * 2); ctx.fill(); }
}

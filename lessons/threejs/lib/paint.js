// Paint marks in space, after Bill T. Jones and OpenEndedGroup's Ghostcatching: points on a moving body leave strokes that stay
// where they were made. No three.js here (plain {x,y,z}), so it can be tested alone.
//
// A Painter follows named points. Each point that moves draws a STROKE: a list of samples (position, time, speed). The pen lifts when a
// point has been still for a while, when it is lost by the tracker, or when it jumps; it comes down again when the point moves.

export class Painter {
  constructor({ minStep = 0.012, liftSpeed = 0.15, liftTime = 0.35, maxJump = 0.6, maxPoints = 24000 } = {}) {
    Object.assign(this, { minStep, liftSpeed, liftTime, maxJump, maxPoints });
    this.strokes = []; this.state = new Map(); this.count = 0;
  }
  clear() { this.strokes = []; this.state.clear(); this.count = 0; }

  // @key When the pen is down | A new sample is added only when the point has moved a minimum step, so strokes have even detail. The pen lifts when the point is lost, jumps, or stays slower than liftSpeed for liftTime; it comes down again when the point moves.
  update(id, p, t) {
    let s = this.state.get(id);
    if (!s) this.state.set(id, s = { last: null, speed: 0, cur: null, stillSince: null });
    if (!p) { s.cur = null; s.last = null; return; }                                    // a lost point: lift the pen
    if (!s.last) { s.last = { ...p, t }; return; }
    const dt = Math.max(1e-3, t - s.last.t), d = Math.hypot(p.x - s.last.x, p.y - s.last.y, p.z - s.last.z);
    if (d > this.maxJump) { s.cur = null; s.last = { ...p, t }; return; }              // a jump (a tracking glitch, a loop in a recording): do not draw across it
    s.speed += (d / dt - s.speed) * 0.5;                                               // steadied speed, m/s
    if (s.speed < this.liftSpeed) { s.stillSince ??= t; if (s.cur && t - s.stillSince > this.liftTime) s.cur = null; }
    else s.stillSince = null;
    if (d < this.minStep) return;                                                      // not far enough for a new sample
    if (!s.cur && s.speed >= this.liftSpeed) { s.cur = { id, pts: [] }; this.strokes.push(s.cur); }
    if (s.cur) { s.cur.pts.push({ x: p.x, y: p.y, z: p.z, t, s: s.speed }); this.count++; }
    s.last = { ...p, t };
    if (this.count > this.maxPoints) this.prune();
  }
  // @/key

  prune() {   // forget the oldest marks first
    while (this.count > this.maxPoints && this.strokes.length) {
      const first = this.strokes[0], over = this.count - this.maxPoints;
      if (first.pts.length <= over || this.strokes.length > 1) { this.count -= first.pts.length; this.strokes.shift(); if (this.state) for (const s of this.state.values()) if (s.cur === first) s.cur = null; }
      else { first.pts.splice(0, over); this.count -= over; }
    }
  }
}

// how visible a mark is: 1 when new, fading to 0 over `fade` seconds (0 = never fades)
export const alpha = (age, fade) => fade <= 0 ? 1 : Math.max(0, 1 - age / fade) ** 1.5;

// a Wavefront OBJ of all the strokes as polylines, to open in Blender and other tools
export function toOBJ(strokes) {
  const lines = ['# Ghostcatching-style strokes: one polyline per stroke, metres'], idx = [];
  let n = 0;
  for (const s of strokes) { if (s.pts.length < 2) continue; const start = n + 1; for (const p of s.pts) { lines.push(`v ${p.x.toFixed(4)} ${p.y.toFixed(4)} ${p.z.toFixed(4)}`); n++; } idx.push('l ' + Array.from({ length: s.pts.length }, (_, i) => start + i).join(' ')); }
  return [...lines, ...idx].join('\n') + '\n';
}

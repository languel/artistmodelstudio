// Laser harp logic, no three.js and no audio. Beams rise from emitters on the floor and fan out a little.
// A hand that reaches the plane of the beams and covers one INTERRUPTS it: the beam is dark above the hand, and
// the hand's height along the beam is a control. All numbers are metres in camera space
// (x right, y up, camera at the origin looking down -z; z closer to 0 = nearer the camera).
export class Harp {
  constructor({ beams = 9, span = 1.2, bottom = -0.9, top = 0.55, fan = 0.18, enter = 0.05, leave = 0.09, grab = 0.06, grace = 0.06 } = {}) {
    Object.assign(this, { beams, span, bottom, top, fan, enter, leave, grab, grace });
    this.centre = { x: 0, y: 0, z: -2 };   // the middle of the plane
    this.held = new Map();                  // tip id -> beam it is holding, so the hold can have hysteresis
    this.active = new Map();                // beam -> { tip, y, h, seen }
  }
  place(c) { Object.assign(this.centre, c); this.held.clear(); this.active.clear(); }
  get spacing() { return this.beams > 1 ? this.span / (this.beams - 1) : this.span; }
  get yMin() { return this.centre.y + this.bottom; }
  get yMax() { return this.centre.y + this.top; }
  // a beam leaves its emitter near the middle and reaches its full spread at the top. fan = the share of the top spread kept at the
  // emitters: 1 is straight vertical beams, 0 is all beams from one point
  baseX(i) { return this.centre.x + (i - (this.beams - 1) / 2) * this.spacing * this.fan; }
  topX(i) { return this.centre.x + (i - (this.beams - 1) / 2) * this.spacing; }
  beamXAt(i, y) { const t = Math.min(1, Math.max(0, (y - this.yMin) / (this.yMax - this.yMin))); return this.baseX(i) + (this.topX(i) - this.baseX(i)) * t; }

  // tips: [{ id, p: {x,y,z}, ok }], t in seconds.
  // Returns { holds: [{ beam, tip, y, h, dz }], on: [beam], off: [beam] }. h is the height up the beam, 0..1.
  update(tips, t) {
    const pz = this.centre.z, cand = new Map();
    // @key Which beam does a fingertip interrupt | The fingertip has to be at the plane (within 5 cm in depth, 9 cm once it holds) and on a beam (within the grab width). Depth is what tells "touching" from "in front of".
    for (const tip of tips) {
      const cur = this.held.get(tip.id); this.held.delete(tip.id);
      if (!tip.ok) continue;
      const dz = tip.p.z - pz, y = tip.p.y;
      if (Math.abs(dz) > (cur != null ? this.leave : this.enter) || y < this.yMin || y > this.yMax) continue;
      let best = -1, bd = Infinity;
      for (let i = 0; i < this.beams; i++) { const d = Math.abs(tip.p.x - this.beamXAt(i, y)); if (d < bd) { bd = d; best = i; } }
      const lim = Math.min(this.spacing / 2, cur === best ? this.grab * 1.4 : this.grab);   // already holding: a little forgiving
      if (bd > lim) continue;
      const prev = cand.get(best);
      if (!prev || bd < prev.dx) cand.set(best, { beam: best, tip: tip.id, y, dz, dx: bd });   // two fingers on one beam: the nearer wins
    }
    // @/key
    const on = [], off = [];
    for (const [beam, c] of cand) {
      this.held.set(c.tip, beam);
      const h = (c.y - this.yMin) / (this.yMax - this.yMin);
      if (!this.active.has(beam)) on.push(beam);
      this.active.set(beam, { tip: c.tip, y: c.y, h, dz: c.dz, seen: t });
    }
    // a dropped pose frame should not end a note: a beam is released only after it has been free for `grace`
    for (const [beam, a] of this.active) if (!cand.has(beam) && t - a.seen > this.grace) { this.active.delete(beam); off.push(beam); }
    return { holds: [...this.active].map(([beam, a]) => ({ beam, ...a })), on, off };
  }
  distance(tipId) { return null; }   // (kept for the display: set by the page from the tip itself)
}

// Laser harp logic, no three.js and no audio: vertical beams standing in a plane in front of the player.
// A fingertip that passes through the plane at a beam plucks it. All numbers are metres in camera space
// (x right, y up, camera at the origin looking down -z; z closer to 0 = nearer the camera).
export class Harp {
  constructor({ beams = 8, span = 1.2, bottom = -0.9, top = 0.5, hysteresis = 0.03, refractory = 0.09 } = {}) {
    Object.assign(this, { beams, span, bottom, top, hysteresis, refractory });
    this.centre = { x: 0, y: 0, z: -2 };   // the middle of the plane
    this.tipState = new Map();             // per fingertip: which side of the plane it is on, where it last crossed
    this.lastPluck = new Array(64).fill(-Infinity);
  }
  place(c) { Object.assign(this.centre, c); this.tipState.clear(); }
  get spacing() { return this.beams > 1 ? this.span / (this.beams - 1) : this.span; }
  beamX(i) { return this.centre.x + (i - (this.beams - 1) / 2) * this.spacing; }
  get yMin() { return this.centre.y + this.bottom; }
  get yMax() { return this.centre.y + this.top; }

  // tips: [{ id, p: {x,y,z}, ok }], t in seconds. Returns plucks: [{ beam, tip, speed, point }]
  update(tips, t) {
    const plucks = [], pz = this.centre.z, h = this.hysteresis;
    for (const tip of tips) {
      let st = this.tipState.get(tip.id);
      if (!tip.ok) { this.tipState.delete(tip.id); continue; }       // an untracked hand has no side: it cannot pluck on reappearing
      const d = tip.p.z - pz;                                         // > 0: in front of the plane (nearer the camera)
      if (!st) { this.tipState.set(tip.id, { side: Math.abs(d) < h ? 0 : Math.sign(d), prev: { ...tip.p }, t, d, speed: 0, flip: null }); continue; }
      const dt = Math.max(1e-3, t - st.t);
      // @key Where the finger met the plane | Between two frames the finger may jump through the plane, so the crossing point is interpolated from the last frame.
      // the exact point where the path met the plane, found between this frame and the last by linear interpolation
      if (Math.sign(d) !== Math.sign(st.d) && st.d !== 0) {
        const f = st.d / (st.d - d);
        st.flip = { x: st.prev.x + (tip.p.x - st.prev.x) * f, y: st.prev.y + (tip.p.y - st.prev.y) * f };
      }
      // @/key
      st.speed += (Math.abs(tip.p.z - st.prev.z) / dt - st.speed) * 0.5;   // m/s through the plane, steadied
      // @key Cross the plane, with a dead zone | Depth from a camera is only good to a few centimetres, so a pluck needs the fingertip to get clearly (3 cm) to the other side; jitter on the plane does nothing.
      // the hysteresis band: jitter within +-h of the plane is not a crossing; the tip must clearly reach the other side
      const side = d > h ? 1 : d < -h ? -1 : st.side;
      if (st.side !== 0 && side !== st.side) {
        const at = st.flip || tip.p;
        const i = Math.round((at.x - this.beamX(0)) / this.spacing);
        if (i >= 0 && i < this.beams && Math.abs(at.x - this.beamX(i)) <= this.spacing / 2 && at.y >= this.yMin && at.y <= this.yMax && t - this.lastPluck[i] >= this.refractory) {
          this.lastPluck[i] = t; plucks.push({ beam: i, tip: tip.id, speed: st.speed, point: { x: at.x, y: at.y, z: pz } });
        }
      }
      // @/key
      st.side = side; st.prev = { ...tip.p }; st.t = t; st.d = d;
    }
    return plucks;
  }
  distance(tipId, z) { const st = this.tipState.get(tipId); return st ? st.d : null; }   // signed metres to the plane, for display
}

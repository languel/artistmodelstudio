// Motion cleaning for performance: turn a jittery, hip-centred pose into stable stage motion without much lag.
// No three.js here (plain {x,y,z} objects), so it can be tested on its own. The stages, in order:
//   1. One Euro filter per joint   - removes jitter when still, lets fast moves through (little lag)
//   2. second-order spring         - inertia: smooth, slightly weighty motion, run every render frame so 30 fps tracking looks like 60
//   3. bone-length lock            - limbs keep their length (the main source of costume wobble)
//   4. root travel                 - the pose is hip-centred, so the dancer's position on stage comes from the picture
//   5. foot locking + two-bone IK  - a planted foot stays put on the floor and the knee follows
// J indices are MediaPipe BlazePose: shoulders 11/12, elbows 13/14, wrists 15/16, index 19/20, hips 23/24, knees 25/26, ankles 27/28, heels 29/30, toes 31/32.

const TAU = 2 * Math.PI;
const lerp = (a, b, t) => a + (b - a) * t;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

// @key One Euro filter | A low-pass filter whose cutoff rises with speed: hard smoothing while a joint is still (no jitter), light smoothing while it moves fast (no lag). minCutoff sets the stillness smoothing, beta how quickly it opens up.
export class OneEuro {
  constructor() { this.x = null; this.dx = [0, 0, 0]; }
  reset(v) { this.x = [v.x, v.y, v.z]; this.dx = [0, 0, 0]; }
  filter(v, dt, minCutoff, beta, dCutoff = 1.5) {
    if (!this.x) { this.reset(v); return this.x; }
    const a = (cutoff) => 1 / (1 + 1 / (TAU * cutoff) / dt), ad = a(dCutoff), cur = [v.x, v.y, v.z];
    for (let i = 0; i < 3; i++) this.dx[i] += ((cur[i] - this.x[i]) / dt - this.dx[i]) * ad;      // smoothed velocity
    const speed = Math.hypot(...this.dx), af = a(minCutoff + beta * speed);                         // faster -> higher cutoff
    for (let i = 0; i < 3; i++) this.x[i] += (cur[i] - this.x[i]) * af;
    return this.x;
  }
}
// @/key

// @key A spring with inertia | Second-order dynamics: the output is pulled toward the input like a mass on a spring. frequency = how tightly it follows, damping = overshoot (1 is none), response = anticipation (above 1 it leans into the motion, which cancels lag).
export class Spring {
  constructor() { this.y = null; this.yd = [0, 0, 0]; this.xp = null; }
  reset(x) { this.y = [...x]; this.yd = [0, 0, 0]; this.xp = [...x]; }
  update(x, dt, f, z, r) {
    if (!this.y) this.reset(x);
    const k1 = z / (Math.PI * f), k2 = 1 / (TAU * f) ** 2, k3 = r * z / (TAU * f);
    const n = Math.max(1, Math.ceil(dt * 90)), T = dt / n;                                           // substeps keep it stable at high frequencies
    const k2s = Math.max(k2, T * T / 2 + T * k1 / 2, T * k1);
    for (let s = 1; s <= n; s++) for (let i = 0; i < 3; i++) {
      const xd = (x[i] - this.xp[i]) / dt, xi = this.xp[i] + (x[i] - this.xp[i]) * (s / n);        // the input's velocity, and where it is this substep
      this.y[i] += T * this.yd[i]; this.yd[i] += T * (xi + k3 * xd - this.y[i] - k1 * this.yd[i]) / k2s;
    }
    this.xp = [...x]; return this.y;
  }
}
// @/key

// parent -> child bones whose length is locked, in order from the trunk outward
const BONES = [[11, 13], [13, 15], [15, 19], [12, 14], [14, 16], [16, 20], [23, 25], [25, 27], [27, 29], [27, 31], [24, 26], [26, 28], [28, 30], [28, 32]];
const LEGS = [{ hip: 23, knee: 25, ankle: 27, heel: 29, toe: 31 }, { hip: 24, knee: 26, ankle: 28, heel: 30, toe: 32 }];

export const PRESETS = {
  raw: { noise: 0, response: 1, inertia: 0, damping: 1, lead: 1, rigid: 0, feet: 0, hold: 0.3 },
  gentle: { noise: 0.4, response: 0.6, inertia: 0.15, damping: 1, lead: 1.1, rigid: 0.5, feet: 0.5, hold: 0.4 },
  performance: { noise: 0.6, response: 0.6, inertia: 0.25, damping: 0.9, lead: 1.6, rigid: 0.8, feet: 0.9, hold: 0.5 },
  dreamy: { noise: 0.85, response: 0.25, inertia: 0.8, damping: 0.6, lead: 0.8, rigid: 0.9, feet: 0.9, hold: 0.8 },
};

export class MotionCleaner {
  constructor(params = {}) {
    this.params = { ...PRESETS.performance, travel: 1, travelZ: 0, z0: 3, plantSpeed: 0.3, floorOffset: 0.07, ...params };
    this.reset();
  }
  reset() {
    this.euro = Array.from({ length: 33 }, () => new OneEuro()); this.spring = Array.from({ length: 33 }, () => new Spring());
    this.target = Array.from({ length: 33 }, () => [0, 0, 0]); this.input = Array.from({ length: 33 }, () => null);
    this.lastSeen = new Array(33).fill(-Infinity); this.ok = new Array(33).fill(false); this.len = new Map();
    this.rootEuro = new OneEuro(); this.rootSpring = new Spring(); this.rootTarget = [0, 0, 0]; this.origin = null; this.k = null;
    this.feet = [{ planted: false, count: 0, pos: [0, 0, 0], prev: null }, { planted: false, count: 0, pos: [0, 0, 0], prev: null }];
    this.floorY = null; this.t = null; this.ti = null; this.lastPose = null; this.offset = 0;
  }
  recentre() { this.origin = null; this.rootEuro = new OneEuro(); this.rootSpring = new Spring(); }

  // raw: { w: 33 joints hip-centred metres, p: image-space joints (only 11,12,23,24 used), vis: 33 numbers }
  // out: { w: 33 {x,y,z} (stage metres), vis: 33 (0 or 1), root: {x,y,z}, planted: [bool, bool], floorY, offset }; fresh = a new tracking frame arrived
  process(raw, t, out, fresh = true) {
    const P = this.params, dt = this.t == null ? 1 / 60 : Math.min(0.1, Math.max(1e-3, t - this.t)); this.t = t;
    if (fresh) this._ingest(raw, t, dt);
    this._follow(dt, P);
    this._write(out, P, dt);
    return out;
  }

  // 1. new tracking frame: hold lost joints, filter the rest, update root target
  _ingest(raw, t, dt0) {
    const P = this.params, minCut = lerp(8, 0.25, P.noise ** 0.8), beta = 0.005 + P.response * 2;
    const dt = this.ti == null ? 1 / 30 : Math.min(0.2, Math.max(1e-3, t - this.ti)); this.ti = t;       // the filter's time step is the time between TRACKING frames
    for (let i = 0; i < 33; i++) {
      const seen = raw.vis[i] >= 0.5;
      if (seen) { if (t - this.lastSeen[i] > P.hold + 0.3) { this.euro[i].reset(raw.w[i]); this.spring[i].reset([raw.w[i].x, raw.w[i].y, raw.w[i].z]); } this.lastSeen[i] = t; this.input[i] = raw.w[i]; }
      this.ok[i] = t - this.lastSeen[i] <= P.hold;                                                  // a joint lost for a moment is held, then dropped
      if (this.input[i] && this.ok[i]) this.target[i] = P.noise > 0 ? [...this.euro[i].filter(this.input[i], dt, minCut, beta)] : [this.input[i].x, this.input[i].y, this.input[i].z];
    }
    // @key Root travel from the picture | The pose is always centred on the hips, so where the dancer is on stage comes from the image: hip position times (metres per image unit), measured from the shoulder width. Distance comes from how big the shoulders look.
    const sh = Math.hypot(raw.p[11].x - raw.p[12].x, raw.p[11].y - raw.p[12].y), real = dist(raw.w[11], raw.w[12]);
    if (sh > 1e-3 && real > 0.05 && raw.vis[11] >= 0.5 && raw.vis[12] >= 0.5 && raw.vis[23] >= 0.5 && raw.vis[24] >= 0.5) {
      const k = real / sh; this.k = this.k == null ? k : this.k + (k - this.k) * 0.05;
      const hx = (raw.p[23].x + raw.p[24].x) / 2, hy = (raw.p[23].y + raw.p[24].y) / 2;
      if (!this.origin) this.origin = { x: hx, y: hy, sh };
      const P_ = this.params, z = P_.z0 * (1 - this.origin.sh / sh) * P_.travelZ;
      const tgt = { x: (hx - this.origin.x) * this.k * P_.travel, y: (hy - this.origin.y) * this.k * P_.travel, z };
      this.rootTarget = P_.noise > 0 ? [...this.rootEuro.filter(tgt, dt, lerp(3, 0.4, P_.noise), 0.05 + P_.response)] : [tgt.x, tgt.y, tgt.z];
    }
    // @/key
    this.lastPose = raw;
  }

  // 2.-5. every render frame
  _follow(dt, P) {
    const f = lerp(18, 2.5, P.inertia), z = P.damping, r = P.lead;
    this.cur = this.target.map((tg, i) => P.inertia > 0 ? [...this.spring[i].update(tg, dt, f, z, r)] : [...tg]);
    this.root = P.inertia > 0 ? [...this.rootSpring.update(this.rootTarget, dt, Math.max(2, f * 0.5), 1, 1)] : [...this.rootTarget];
    // @key Bones keep their length | Each limb bone has a length estimated slowly over time (ignoring sudden jumps). The child joint is pulled back onto a sphere of that radius around its parent, so thighs and forearms stop breathing.
    const c = this.cur;
    for (const [a, b] of BONES) {
      const d = [c[b][0] - c[a][0], c[b][1] - c[a][1], c[b][2] - c[a][2]], L = Math.hypot(...d) || 1e-6, key = a * 40 + b, est = this.len.get(key);
      if (!this.ok[a] || !this.ok[b]) continue;
      const e = est == null ? L : Math.abs(L - est) < 0.3 * est ? est + (L - est) * Math.min(1, 0.03 * dt * 30) : est;
      this.len.set(key, e);
      const w = P.rigid, nl = lerp(L, e, w);
      for (let i = 0; i < 3; i++) c[b][i] = c[a][i] + d[i] / L * nl;
    }
    // @/key
    this._feet(dt, P);
  }

  // @key Feet that stay where they are put | A foot is planted when it is low and nearly still. While planted its position is held, and two-bone IK bends the knee to keep the leg's length: the hips can wobble without the foot skating.
  _feet(dt, P) {
    const c = this.cur, g = i => [c[i][0] + this.root[0], c[i][1] + this.root[1], c[i][2] + this.root[2]];
    const low = Math.min(...LEGS.map(l => g(l.ankle)[1]));
    this.floorY = this.floorY == null ? low : Math.min(this.floorY + 0.01 * dt, low) ;          // the floor: the lowest ankle seen, creeping up slowly so a jump does not teach it a false floor
    LEGS.forEach((leg, li) => {
      const s = this.feet[li], A = g(leg.ankle), prev = s.prev; s.prev = A;
      if (!this.ok[leg.hip] || !this.ok[leg.knee] || !this.ok[leg.ankle] || P.feet <= 0) { s.planted = false; s.count = 0; return; }
      const speed = prev ? Math.hypot(A[0] - prev[0], A[1] - prev[1], A[2] - prev[2]) / dt : 0, h = A[1] - this.floorY;
      if (!s.planted) {
        s.count = speed < P.plantSpeed && h < 0.09 ? s.count + 1 : 0;
        if (s.count >= 3) { s.planted = true; s.pos = [A[0], this.floorY, A[2]]; }
      } else if (speed > P.plantSpeed * 2.2 || h > 0.16 || Math.hypot(A[0] - s.pos[0], A[2] - s.pos[2]) > 0.22) { s.planted = false; s.count = 0; }
      if (!s.planted) return;
      // two-bone IK: put the ankle on the planted spot, find the knee that keeps both leg bones their length
      const H = g(leg.hip), K = g(leg.knee), T = [lerp(A[0], s.pos[0], P.feet), lerp(A[1], s.pos[1], P.feet), lerp(A[2], s.pos[2], P.feet)];
      const L1 = this.len.get(leg.hip * 40 + leg.knee) ?? dist({ x: H[0], y: H[1], z: H[2] }, { x: K[0], y: K[1], z: K[2] }), L2 = this.len.get(leg.knee * 40 + leg.ankle) ?? dist({ x: K[0], y: K[1], z: K[2] }, { x: A[0], y: A[1], z: A[2] });
      let d = [T[0] - H[0], T[1] - H[1], T[2] - H[2]], D = Math.hypot(...d); const reach = L1 + L2 - 1e-3;
      if (D > reach) { for (let i = 0; i < 3; i++) T[i] = H[i] + d[i] / D * reach; D = reach; d = [T[0] - H[0], T[1] - H[1], T[2] - H[2]]; }
      if (D < Math.abs(L1 - L2) + 1e-3 || D < 1e-4) return;
      const u = d.map(v => v / D), a = (L1 * L1 - L2 * L2 + D * D) / (2 * D), hgt = Math.sqrt(Math.max(0, L1 * L1 - a * a));
      const base = H.map((v, i) => v + u[i] * a); let pole = K.map((v, i) => v - base[i]); const pd = pole[0] * u[0] + pole[1] * u[1] + pole[2] * u[2];
      pole = pole.map((v, i) => v - u[i] * pd); const pl = Math.hypot(...pole) || 1; pole = pole.map(v => v / pl);       // the bend direction: where the knee already points
      const knee = base.map((v, i) => v + pole[i] * hgt), shift = [T[0] - A[0], T[1] - A[1], T[2] - A[2]];
      for (let i = 0; i < 3; i++) { c[leg.knee][i] = knee[i] - this.root[i]; c[leg.ankle][i] = T[i] - this.root[i]; c[leg.heel][i] += shift[i]; c[leg.toe][i] += shift[i]; }
    });
  }
  // @/key

  _write(out, P) {
    for (let i = 0; i < 33; i++) { const o = out.w[i]; o.x = this.cur[i][0] + this.root[0]; o.y = this.cur[i][1] + this.root[1]; o.z = this.cur[i][2] + this.root[2]; out.vis[i] = this.ok[i] ? 1 : 0; }
    out.root = { x: this.root[0], y: this.root[1], z: this.root[2] }; out.planted = this.feet.map(f => f.planted); out.floorY = this.floorY;
    if (this.lastPose) { let s = 0, n = 0; for (let i = 11; i < 33; i++) if (this.ok[i]) { s += Math.hypot(this.lastPose.w[i].x + this.root[0] - out.w[i].x, this.lastPose.w[i].y + this.root[1] - out.w[i].y, this.lastPose.w[i].z + this.root[2] - out.w[i].z); n++; } out.offset = n ? s / n : 0; }   // average distance between raw and cleaned joints: the lag and smoothing, in metres
  }
}

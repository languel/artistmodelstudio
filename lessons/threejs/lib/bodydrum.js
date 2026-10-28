// Body drum logic, no three.js and no audio. Drum pads are invisible spheres attached to the body (chest, belly, thighs...)
// and a hit is a hand arriving at a pad fast enough. Everything is in the body's own world space: metres, y up, hips near the origin,
// so it needs no depth and works at any distance from the camera.
// Joint indices are MediaPipe's BlazePose order.
const JI = { nose: 0, leftShoulder: 11, rightShoulder: 12, leftWrist: 15, rightWrist: 16, leftIndex: 19, rightIndex: 20, leftHip: 23, rightHip: 24, leftKnee: 25, rightKnee: 26, leftAnkle: 27, rightAnkle: 28 };

// @key Pads are places on the body | Each pad is a weighted mix of joints (so it follows the body) with a radius in metres and a drum voice.
export const PADS = [
  { id: 'chest', label: 'chest', voice: 'kick', r: 0.12, at: { leftShoulder: 0.35, rightShoulder: 0.35, leftHip: 0.15, rightHip: 0.15 } },
  { id: 'belly', label: 'belly', voice: 'snare', r: 0.11, at: { leftShoulder: 0.15, rightShoulder: 0.15, leftHip: 0.35, rightHip: 0.35 } },
  { id: 'thighL', label: 'left thigh', voice: 'tomHigh', r: 0.09, at: { leftHip: 0.5, leftKnee: 0.5 } },
  { id: 'thighR', label: 'right thigh', voice: 'tomLow', r: 0.09, at: { rightHip: 0.5, rightKnee: 0.5 } },
  { id: 'shoulderL', label: 'left shoulder', voice: 'hatClosed', r: 0.07, at: { leftShoulder: 1 } },
  { id: 'shoulderR', label: 'right shoulder', voice: 'hatOpen', r: 0.07, at: { rightShoulder: 1 } },
  { id: 'head', label: 'head', voice: 'wood', r: 0.1, at: { nose: 1 } },
  { id: 'kneeL', label: 'left knee', voice: 'conga', r: 0.07, at: { leftKnee: 1 } },
  { id: 'kneeR', label: 'right knee', voice: 'conga', r: 0.07, at: { rightKnee: 1 } },
];
// @/key

const len = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 });

export class BodyDrum {
  constructor({ minSpeed = 0.5, refractory = 0.09, handR = 0.045, size = 1, claps = true, feet = true, pads = PADS } = {}) {
    Object.assign(this, { minSpeed, refractory, handR, size, claps, feet, pads: pads.map(p => ({ ...p })) });
    this.inside = new Map(); this.last = new Map(); this.falling = [false, false]; this.apart = true;
    this.bodyScale = 1;
  }
  // w: joint positions (arrays of {x,y,z} metres), v: joint velocities (m/s), t: seconds.
  // Returns { centres: {padId: {x,y,z,r}}, hands: [{x,y,z}, {x,y,z}], hits: [{ id, voice, level, speed, x }] }
  // visible(handIndex) and jointOk(jointIndex) say what the tracker can really see: a pad or foot built on a joint that is out of frame
  // (and so only guessed) never sounds.
  update(w, v, t, visible = () => true, jointOk = () => true) {
    const hits = [], centres = {}, hand = i => mid(w[i === 0 ? JI.leftWrist : JI.rightWrist], w[i === 0 ? JI.leftIndex : JI.rightIndex]);
    const handV = i => mid(v[i === 0 ? JI.leftWrist : JI.rightWrist], v[i === 0 ? JI.leftIndex : JI.rightIndex]);
    // @key The body sets the scale | Shoulder width in metres (about 0.38 for an adult) scales the pads, so a child and a tall adult get pads that fit them.
    this.bodyScale = Math.min(1.6, Math.max(0.6, len(w[JI.leftShoulder], w[JI.rightShoulder]) / 0.38));
    // @/key
    const padV = {};
    for (const p of this.pads) {      // (a pad with on: false is muted: still placed and drawn, never hit)
      const c = { x: 0, y: 0, z: 0 }, pv = { x: 0, y: 0, z: 0 };
      for (const [name, k] of Object.entries(p.at)) { const j = JI[name]; c.x += w[j].x * k; c.y += w[j].y * k; c.z += w[j].z * k; pv.x += v[j].x * k; pv.y += v[j].y * k; pv.z += v[j].z * k; }
      centres[p.id] = { ...c, r: p.r * this.size * this.bodyScale }; padV[p.id] = pv;
    }
    const hands = [hand(0), hand(1)], R = this.handR * this.bodyScale;
    // @key A hit is a fast arrival | The hand must enter the pad (it was outside, now it is inside) and be closing on it, relative to the pad's own motion, faster than the sensitivity. That speed is the loudness.
    hands.forEach((h, hi) => {
      if (!visible(hi)) return;
      const hv = handV(hi);
      for (const p of this.pads) {
        if (p.on === false || !Object.keys(p.at).every(n => jointOk(JI[n]))) continue;
        const c = centres[p.id], d = len(h, c), key = hi + p.id, was = this.inside.get(key) || false, now = d < c.r + R;
        this.inside.set(key, now);
        if (!now || was) continue;
        const n = { x: (h.x - c.x) / (d || 1e-6), y: (h.y - c.y) / (d || 1e-6), z: (h.z - c.z) / (d || 1e-6) };
        const approach = -((hv.x - padV[p.id].x) * n.x + (hv.y - padV[p.id].y) * n.y + (hv.z - padV[p.id].z) * n.z);
        if (approach < this.minSpeed || t - (this.last.get(p.id) ?? -Infinity) < this.refractory) continue;
        this.last.set(p.id, t);
        hits.push({ id: p.id, voice: p.voice, speed: approach, level: Math.min(1, Math.sqrt(Math.max(0, approach - this.minSpeed) / 2.5) + 0.12), x: c.x });
      }
    });
    // @/key
    if (this.claps && visible(0) && visible(1)) {      // two hands meeting: a clap
      const d = len(hands[0], hands[1]), hv0 = handV(0), hv1 = handV(1), closing = Math.hypot(hv0.x - hv1.x, hv0.y - hv1.y, hv0.z - hv1.z);
      if (d > 0.18) this.apart = true;
      if (this.apart && d < 0.1 && closing >= this.minSpeed + 0.2 && t - (this.last.get('clap') ?? -Infinity) >= this.refractory) {
        this.apart = false; this.last.set('clap', t); const m = mid(hands[0], hands[1]);
        hits.push({ id: 'clap', voice: 'clap', speed: closing, level: Math.min(1, Math.sqrt(Math.max(0, closing - this.minSpeed) / 2.5) + 0.12), x: m.x });
      }
    }
    if (this.feet) [JI.leftAnkle, JI.rightAnkle].forEach((j, i) => {      // a stomp: the foot falls fast, then stops
      if (!jointOk(j)) return;
      const vy = v[j].y;
      if (vy < -1.0) this.falling[i] = Math.min(this.falling[i] || 0, vy) || vy;
      else if (this.falling[i] && vy > -0.25) {
        const sp = -this.falling[i]; this.falling[i] = false;
        if (t - (this.last.get('foot' + i) ?? -Infinity) >= 0.15) { this.last.set('foot' + i, t); hits.push({ id: 'foot' + i, voice: 'stomp', speed: sp, level: Math.min(1, sp / 3.5 + 0.15), x: w[j].x }); }
      }
    });
    return { centres, hands, hits, inside: this.inside };
  }
}

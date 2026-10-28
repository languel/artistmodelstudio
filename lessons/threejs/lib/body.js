// The Body: one object every demo reads. Frames come from a live tracker or a recorded JSON.
//
// Frame format (also the recording format, "body-frames/1"):
//   { t, pose:[[x,y,z,vis]*33]|null, world:[[x,y,z]*33]|null, hands:{left:[[x,y,z]*21]|null,right}, face:[[x,y,z]*478]|null }
//   pose: normalized image coords (x right, y down, z depth ~ x scale). world: metres, origin at the hips.
import * as THREE from 'three';

// @key The 33 joints, by name | BlazePose order; J.leftWrist is the index into every per-joint array.
export const JOINTS = ['nose', 'leftEyeInner', 'leftEye', 'leftEyeOuter', 'rightEyeInner', 'rightEye', 'rightEyeOuter',
  'leftEar', 'rightEar', 'mouthLeft', 'mouthRight', 'leftShoulder', 'rightShoulder', 'leftElbow', 'rightElbow',
  'leftWrist', 'rightWrist', 'leftPinky', 'rightPinky', 'leftIndex', 'rightIndex', 'leftThumb', 'rightThumb',
  'leftHip', 'rightHip', 'leftKnee', 'rightKnee', 'leftAnkle', 'rightAnkle', 'leftHeel', 'rightHeel', 'leftFootIndex', 'rightFootIndex'];
export const J = Object.fromEntries(JOINTS.map((n, i) => [n, i]));
// @/key

export class Body {
  constructor() {
    this.mirror = false;          // selfie view: flip x so the scene reads like a mirror
    this.height = 2;              // scene units spanned by the image height
    this.aspect = 4 / 3;
    this.frame = null; this.present = false;
    // per joint: p = scene position (image-registered), w = world metres (hip origin, y up), v = velocity m/s (smoothed)
    this.p = JOINTS.map(() => new THREE.Vector3());
    this.w = JOINTS.map(() => new THREE.Vector3());
    this.v = JOINTS.map(() => new THREE.Vector3());
    this.c = JOINTS.map(() => new THREE.Vector3());   // camera-space metres, filled by Fusion (lesson 04)
    this.speed = new Float32Array(JOINTS.length);
    this.hands = { left: Array.from({ length: 21 }, () => new THREE.Vector3()), right: Array.from({ length: 21 }, () => new THREE.Vector3()) };
    this.handsPresent = { left: false, right: false };
    this._t = null;
  }
  // image-registered scene coordinates from a normalized landmark
  // @key Landmark to scene coordinates | x, y are normalised image coordinates; z is depth on the same scale. Mirror flips x for a selfie view.
  toScene(l, out) {
    const s = this.height, sx = this.mirror ? -1 : 1;
    return out.set(sx * (l[0] - 0.5) * s * this.aspect, (0.5 - l[1]) * s, -l[2] * s * this.aspect);
  }
  // @/key
  update(frame) {
    // @key Velocity from world landmarks | World landmarks are metres around the hips, so speed is in m/s. It is smoothed, and a loop (t jumps back) gives zero.
    this.frame = frame; this.present = !!frame?.pose;
    if (!this.present) { this.speed.fill(0); return; }
    const raw = this._t == null ? 0 : frame.t - this._t, dt = raw > 0 ? Math.max(1e-3, raw) : 0; this._t = frame.t;  // a loop (t jumps back) gives dt 0
    const sx = this.mirror ? -1 : 1, tmp = new THREE.Vector3();
    for (let i = 0; i < JOINTS.length; i++) {
      this.toScene(frame.pose[i], this.p[i]);
      const w = frame.world[i];
      tmp.set(sx * w[0], -w[1], -w[2]);
      if (dt > 0 && dt < 0.5) { this.v[i].lerp(tmp.clone().sub(this.w[i]).divideScalar(dt), 0.35); }
      else this.v[i].set(0, 0, 0);
      this.w[i].copy(tmp); this.speed[i] = this.v[i].length();
    }
  // @/key
    for (const side of ['left', 'right']) {
      const h = frame.hands[side]; this.handsPresent[side] = !!h;
      if (h) h.forEach((l, i) => this.toScene(l, this.hands[side][i]));
    }
  }
  reset() { this._t = null; this.v.forEach(v => v.set(0, 0, 0)); }
  joint(name) { return this.p[J[name]]; }
  // @key Measurements | The same numbers the drum will compare against a threshold.
  distance(a, b) { return this.w[J[a]].distanceTo(this.w[J[b]]); }   // metres
  // @/key
}

// Plays recorded frames back by time (loops).
// @key Recorded frames play back by time | The same Body reads a recording or a camera without knowing which.
export class Playback {
  constructor(data) { this.frames = data.frames; this.duration = this.frames.at(-1)?.t ?? 0; this.i = 0; this.aspect = data.aspect ?? 4 / 3; }
  at(t) {
    t = this.duration ? t % this.duration : 0;
    while (this.i > 0 && this.frames[this.i].t > t) this.i--;
    while (this.i < this.frames.length - 1 && this.frames[this.i + 1].t <= t) this.i++;
    return this.frames[this.i];
  }
}
// @/key

// Fusion: put the body, and the room behind it, into one space measured in metres from the camera.
//
//  - MediaPipe gives the body's shape in metres (world landmarks) but not how far away it is.
//  - Depth Anything gives a depth for every pixel but only as near/far (disparity), with no scale.
//  - Pinhole geometry gives the distance: a limb of known length that looks this big is this far.
//
// Space: x right, y up, camera at the origin looking down -z (three.js' own convention).
import * as THREE from 'three';
import { J } from './body.js';

// pairs of joints whose 3D length MediaPipe knows; the least foreshortened one gives the distance
const SEGMENTS = [['leftShoulder', 'rightShoulder'], ['leftHip', 'rightHip'], ['leftShoulder', 'leftHip'], ['rightShoulder', 'rightHip'],
  ['leftHip', 'leftKnee'], ['rightHip', 'rightKnee'], ['leftKnee', 'leftAnkle'], ['rightKnee', 'rightAnkle'], ['leftShoulder', 'leftElbow'], ['rightShoulder', 'rightElbow']].map(([a, b]) => [J[a], J[b]]);

const inFrame = l => l[0] > 0.02 && l[0] < 0.98 && l[1] > 0.02 && l[1] < 0.98;

export class Fusion {
  constructor({ fov = 60, trust = 0.5 } = {}) {
    this.fov = fov;          // horizontal field of view of the camera, degrees (an assumption: phones and webcams are ~60-70)
    this.trust = trust;      // 0 = body z from MediaPipe only, 1 = body z from the depth map
    this.Zhip = null;        // distance from the camera to the hips, metres
    this.alpha = null; this.beta = null;   // 1/Z = alpha * disparity + beta
    this.residual = 0;       // RMS error of that fit, metres
    this.poseOnly = Array.from({ length: 33 }, () => new THREE.Vector3());
    this.floorY = null;
  }
  get fx() { return 0.5 / Math.tan(this.fov * Math.PI / 360); }   // focal length in image-width units

  // @key Distance from the body's size | A limb of known length that looks this big is this far away (pinhole camera): Z = focal / (apparent size per metre).
  distanceFromBody(body) {
    const f = body.frame, P = f.pose, W = f.world;
    let best = 0;
    for (const [a, b] of SEGMENTS) {
      if (P[a][3] < 0.5 || P[b][3] < 0.5 || !inFrame(P[a]) || !inFrame(P[b])) continue;   // off-frame joints are guesses
      const L = Math.hypot(W[a][0] - W[b][0], W[a][1] - W[b][1], W[a][2] - W[b][2]);                  // metres, from MediaPipe
      const px = Math.hypot(P[a][0] - P[b][0], (P[a][1] - P[b][1]) / body.aspect);                    // image-width units
      if (L > 0.1) best = Math.max(best, px / L);    // a limb at right angles to the view has the biggest ratio
    }
    return best ? this.fx / best : null;
  }
  // @/key

  // image point + distance -> camera-space metres
  unproject(u, v, Z, sx, out) {
    const k = Z / this.fx;
    return out.set(sx * (u - 0.5) * k, -(v - 0.5) / this._aspect * k, -Z);
  }
  project(p, sx) {     // the inverse: camera-space metres -> image u, v
    const Z = -p.z, k = this.fx / Z;
    return [0.5 + sx * p.x * k, 0.5 - p.y * k * this._aspect];
  }

  // body: a Body with a current frame. depth: { data, width, height } (1 = near) or null.
  update(body, depth) {
    if (!body.present) return;
    this._aspect = body.aspect; this._lastW = body.frame.world;
    const f = body.frame, P = f.pose, W = f.world, sx = body.mirror ? -1 : 1;
    const Z = this.distanceFromBody(body);
    if (Z) this.Zhip = this.Zhip == null ? Z : this.Zhip + (Z - this.Zhip) * 0.2;   // steady it: one noisy frame should not move the body
    if (this.Zhip == null) return;

    // @key Body shape plus distance | World landmarks are metres around the hips (z smaller = nearer the camera), so camera depth = hip distance + world z.
    for (let i = 0; i < 33; i++) {
      const Zi = Math.max(0.3, this.Zhip + W[i][2]);
      this.unproject(P[i][0], P[i][1], Zi, sx, this.poseOnly[i]);
    }
    // @/key

    if (depth) {
      this._sampleDepth(P, depth);
      if (depth !== this._fitted) { this._fitted = depth; this._fit(P); }
    }
    // @key Fused joints | Depth at the joint, converted to metres by the fit, blended with the pose estimate by the trust slider.
    for (let i = 0; i < 33; i++) {
      let Zi = Math.max(0.3, this.Zhip + W[i][2]);
      if (this.alpha != null && this._d[i] != null) Zi += (this.zAt(this._d[i]) - Zi) * this.trust;
      this.unproject(P[i][0], P[i][1], Zi, sx, body.c[i]);
    }
    // @/key
    const fl = Math.min(body.c[J.leftAnkle].y, body.c[J.rightAnkle].y);
    if (P[J.leftAnkle][3] > 0.5 && P[J.rightAnkle][3] > 0.5) this.floorY = this.floorY == null ? fl : this.floorY + (fl - this.floorY) * 0.05;
  }

  _sampleDepth(P, depth) {
    this._d = P.map(l => {     // median of a 3x3 patch: one stray pixel should not decide a joint
      if (l[3] < 0.5 || l[0] < 0 || l[0] > 1 || l[1] < 0 || l[1] > 1) return null;
      const cx = Math.min(depth.width - 2, Math.max(1, l[0] * depth.width | 0)), cy = Math.min(depth.height - 2, Math.max(1, l[1] * depth.height | 0)), v = [];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) v.push(depth.data[(cy + dy) * depth.width + cx + dx]);
      return v.sort((a, b) => a - b)[4];
    });
  }
  // @key Calibrate the depth map | Disparity is roughly 1/distance up to a scale and offset. The joints' known distances give both numbers by least squares.
  _fit(P) {
    let pts = [];
    for (let i = 11; i < 33; i++) if (this._d[i] != null) pts.push([this._d[i], 1 / Math.max(0.3, this.Zhip + this._lastW[i][2])]);
    for (let pass = 0; pass < 2 && pts.length >= 4; pass++) {
      const n = pts.length, mx = pts.reduce((s, p) => s + p[0], 0) / n, my = pts.reduce((s, p) => s + p[1], 0) / n;
      let sxx = 0, sxy = 0; for (const [x, y] of pts) { sxx += (x - mx) ** 2; sxy += (x - mx) * (y - my); }
      if (sxx < 1e-4) return;                          // all joints at the same depth: nothing to calibrate against
      const a = sxy / sxx, b = my - a * mx;
      const res = pts.map(([x, y]) => y - (a * x + b)), sd = Math.sqrt(res.reduce((s, r) => s + r * r, 0) / n);
      if (pass === 0) { pts = pts.filter((_, k) => Math.abs(res[k]) <= 2 * sd + 1e-6); this._cand = [a, b]; }   // drop outliers, fit again
      else this._cand = [a, b];
    }
    if (!this._cand) return;
    const [a, b] = this._cand;
    this.alpha = this.alpha == null ? a : this.alpha + (a - this.alpha) * 0.4;   // smooth: the model's range drifts a little per frame
    this.beta = this.beta == null ? b : this.beta + (b - this.beta) * 0.4;
    let e = 0, c = 0; for (let i = 11; i < 33; i++) if (this._d[i] != null) { e += (this.zAt(this._d[i]) - (this.Zhip + this._lastW[i][2])) ** 2; c++; }
    this.residual = c ? Math.sqrt(e / c) : 0;
  }
  // @/key
  zAt(d) { return Math.min(30, 1 / Math.max(1 / 30, this.alpha * d + this.beta)); }   // disparity -> metres

  // Fill positions (xyz) and keep the pixel's uv for every depth pixel: the room as a point cloud in the same space.
  // @key Depth map to a point cloud | Each pixel becomes a point: its metres from the fit, then back through the pinhole camera. The body and the room now share one space.
  cloud(depth, sx, positions, step = 1) {
    if (this.alpha == null) return 0;
    let n = 0; const v3 = this._v ??= new THREE.Vector3();
    for (let j = 0; j < depth.height; j += step) for (let i = 0; i < depth.width; i += step) {
      const Z = this.zAt(depth.data[j * depth.width + i]);
      this.unproject((i + 0.5) / depth.width, (j + 0.5) / depth.height, Z, sx, v3);
      positions[n * 3] = v3.x; positions[n * 3 + 1] = v3.y; positions[n * 3 + 2] = v3.z; n++;
    }
    return n;
  }
  // @/key

  // Nearest depth surface to a point (the wall behind a hand, the chest in front of it): searches the pixels around where the point lands.
  surfaceDistance(p, depth, sx, win = 14) {
    if (this.alpha == null || p.z >= -0.05) return null;
    const [u, v] = this.project(p, sx), ci = u * depth.width | 0, cj = v * depth.height | 0, q = new THREE.Vector3();
    let best = Infinity;
    for (let j = Math.max(0, cj - win); j <= Math.min(depth.height - 1, cj + win); j++)
      for (let i = Math.max(0, ci - win); i <= Math.min(depth.width - 1, ci + win); i++) {
        this.unproject((i + 0.5) / depth.width, (j + 0.5) / depth.height, this.zAt(depth.data[j * depth.width + i]), sx, q);
        best = Math.min(best, q.distanceTo(p));
      }
    return Number.isFinite(best) ? best : null;
  }
}

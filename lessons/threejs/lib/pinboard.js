// A pin-screen toy: a grid of pins pushed out by a height field. Sources are plain arrays, so
// the same board can show depth, a person mask, or both.
import * as THREE from 'three';

const ramp = (t, c) => c.setHSL(0.72 - 0.72 * t, 0.85, 0.5);   // far = violet ... near = red

export class Pinboard extends THREE.Group {
  constructor({ cols = 80, aspect = 4 / 3, width = 4 } = {}) {
    super(); this.name = 'pinboard'; this.width = width; this.aspect = aspect;
    this.shaftMat = new THREE.MeshStandardMaterial({ color: 0x8a8f9a, metalness: 0.9, roughness: 0.35 });
    this.headMat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.5, roughness: 0.3 });
    this.sample = document.createElement('canvas'); this.sx = this.sample.getContext('2d', { willReadFrequently: true });
    this.build(cols);
  }
  build(cols) {
    this.cols = cols; this.rows = Math.round(cols / this.aspect);
    for (const m of [this.shafts, this.heads]) if (m) { this.remove(m); m.geometry.dispose(); m.dispose?.(); }
    const n = this.cols * this.rows, pitch = this.width / this.cols; this.pitch = pitch; this.len = this.width * 0.5;
    const shaft = new THREE.CylinderGeometry(pitch * 0.12, pitch * 0.12, 1, 6).rotateX(Math.PI / 2);   // unit length along z
    this.shafts = new THREE.InstancedMesh(shaft, this.shaftMat, n);
    this.heads = new THREE.InstancedMesh(new THREE.SphereGeometry(pitch * 0.42, 10, 8), this.headMat, n);
    this.heads.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3).fill(1), 3);
    this.shafts.frustumCulled = this.heads.frustumCulled = false;
    this.h = new Float32Array(n); this.sample.width = this.cols; this.sample.height = this.rows;
    this.add(this.shafts, this.heads);
  }
  setAspect(a) { if (Math.abs(a - this.aspect) > 1e-3) { this.aspect = a; this.build(this.cols); } }
  // opts: { video, mirror, depth, mask, mode, amount, slew, threshold, color, invert }
  update(o) {
    const { cols, rows, pitch } = this, col = this._col ??= new THREE.Color(), sa = this.shafts.instanceMatrix.array, ha = this.heads.instanceMatrix.array, L = this.len;
    let px = null;
    if (o.video && o.color === 'video') { this.sx.drawImage(o.video, 0, 0, cols, rows); px = this.sx.getImageData(0, 0, cols, rows).data; }
    const D = o.depth, M = o.mask, W = cols * pitch, Hh = rows * pitch;
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const k = j * cols + i, u = o.mirror ? 1 - (i + 0.5) / cols : (i + 0.5) / cols, v = (j + 0.5) / rows;
      const d = D ? D.data[Math.min(D.height - 1, v * D.height | 0) * D.width + Math.min(D.width - 1, u * D.width | 0)] : 0.5;
      const mk = M ? M.data[Math.min(M.height - 1, v * M.height | 0) * M.width + Math.min(M.width - 1, u * M.width | 0)] : 1;
      const dd = o.invert ? 1 - d : d, inside = mk > o.threshold;
      let t = o.mode === 'silhouette' ? (inside ? 1 : 0) : o.mode === 'subject' ? (inside ? 0.15 + 0.85 * dd : 0) : dd;
      this.h[k] += (t * o.amount - this.h[k]) * o.slew;
      const z = this.h[k], x = (i + 0.5) * pitch - W / 2, y = Hh / 2 - (j + 0.5) * pitch;
      // column-major 4x4: scale on the diagonal, translation in 12..14 (written directly, no per-pin objects)
      const o16 = k * 16; sa[o16] = sa[o16 + 5] = 1; sa[o16 + 10] = L; sa[o16 + 15] = 1; sa[o16 + 12] = x; sa[o16 + 13] = y; sa[o16 + 14] = z - L / 2;
      ha[o16] = ha[o16 + 5] = ha[o16 + 10] = ha[o16 + 15] = 1; ha[o16 + 12] = x; ha[o16 + 13] = y; ha[o16 + 14] = z;
      if (o.color === 'video' && px) col.setRGB(px[k * 4] / 255, px[k * 4 + 1] / 255, px[k * 4 + 2] / 255, THREE.SRGBColorSpace);
      else if (o.color === 'depth') ramp(Math.min(1, z / o.amount), col);
      else col.setScalar(0.55 + 0.45 * Math.min(1, z / o.amount));
      this.heads.setColorAt(k, col);
    }
    this.shafts.instanceMatrix.needsUpdate = this.heads.instanceMatrix.needsUpdate = this.heads.instanceColor.needsUpdate = true;
  }
}

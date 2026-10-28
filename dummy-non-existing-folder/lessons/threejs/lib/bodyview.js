// Draws a Body in a three.js scene: joints, bones, hands, face. Reads body.p / body.hands, owns no data.
import * as THREE from 'three';
import { PoseLandmarker, HandLandmarker } from './tracker.js';

// Colours: bones amber, left hand blue, right hand red.
const COL = { bone: 0xf2b84b, left: 0x6fc2ff, right: 0xff7a7a, hand: 0xf6f0d8, face: 0x9aa0b0 };

export class BodyView extends THREE.Group {
  constructor(body) {
    super(); this.name = 'body'; this.body = body;
    const pc = PoseLandmarker.POSE_CONNECTIONS, hc = HandLandmarker.HAND_CONNECTIONS;
    this.pc = pc; this.hc = hc;
    // joints (skip the face points of the pose: the face mesh covers them)
    // @key Joints and bones are two draw calls | 33 spheres as one InstancedMesh, all bones as one LineSegments.
    this.joints = new THREE.InstancedMesh(new THREE.SphereGeometry(0.03, 12, 8), new THREE.MeshBasicMaterial(), 33);
    this.joints.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(33 * 3).fill(1), 3);
    this.joints.frustumCulled = false;
    this.bones = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(pc.length * 6), 3)),
      new THREE.LineBasicMaterial({ color: COL.bone }));
    this.bones.frustumCulled = false;
    // @/key
    this.handGroups = {};
    for (const side of ['left', 'right']) {
      const pts = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(21 * 3), 3)),
        new THREE.PointsMaterial({ color: COL.hand, size: 0.025 }));
      const lines = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(hc.length * 6), 3)),
        new THREE.LineBasicMaterial({ color: side === 'left' ? COL.left : COL.right }));
      pts.frustumCulled = lines.frustumCulled = false;
      const g = new THREE.Group(); g.name = side + 'Hand'; g.add(pts, lines); this.handGroups[side] = { g, pts, lines };
      this.add(g);
    }
    // @key 478 face points in one Points object
    this.face = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(478 * 3), 3)),
      new THREE.PointsMaterial({ color: COL.face, size: 0.008 }));
    this.face.frustumCulled = false; this.face.name = 'face';
    // @/key
    this.add(this.joints, this.bones, this.face);
    this.layers_ = { pose: true, hands: true, face: true, heat: true };
    this._m = new THREE.Matrix4(); this._c = new THREE.Color();
  }
  show(layers) { Object.assign(this.layers_, layers); }
  // mode 'image': registered with the picture. 'world': metres around the hips, upright (for measuring).
  // 'camera': metres from the camera, from Fusion (lesson 04)
  update(mode = 'image') {
    // @key Rewrite the buffers each frame | No objects are created per frame: positions are written straight into typed arrays.
    const b = this.body, L = this.layers_, f = b.frame, world = mode !== 'image';   // hands and face are only drawn in image space
    const vis = b.present;
    this.joints.visible = this.bones.visible = vis && L.pose;
    this.face.visible = !!f?.face && L.face && !world;
    for (const s of ['left', 'right']) this.handGroups[s].g.visible = b.handsPresent[s] && L.hands && !world;
    if (!vis) return;
    const P = i => mode === 'world' ? b.w[i] : mode === 'camera' ? b.c[i] : b.p[i];
    const pos = this.bones.geometry.attributes.position.array;
    this.pc.forEach((c, k) => { const a = P(c.start), d = P(c.end); pos.set([a.x, a.y, a.z, d.x, d.y, d.z], k * 6); });
    this.bones.geometry.attributes.position.needsUpdate = true;
    for (let i = 0; i < 33; i++) {
      const p = P(i), hot = L.heat ? Math.min(1, b.speed[i] / 3) : 0, s = i < 11 ? 0.6 : 1 + hot * 1.6;
      this._m.makeScale(s, s, s).setPosition(p); this.joints.setMatrixAt(i, this._m);
      this._c.setHSL(0.12 - hot * 0.12, 0.9, 0.5 + hot * 0.15); this.joints.setColorAt(i, this._c);
    }
    this.joints.instanceMatrix.needsUpdate = this.joints.instanceColor.needsUpdate = true;
    // @/key
    if (!world) {
      for (const s of ['left', 'right']) if (b.handsPresent[s]) {
        const h = b.hands[s], { pts, lines } = this.handGroups[s], pp = pts.geometry.attributes.position.array, lp = lines.geometry.attributes.position.array;
        h.forEach((v, i) => pp.set([v.x, v.y, v.z], i * 3));
        this.hc.forEach((c, k) => { const a = h[c.start], d = h[c.end]; lp.set([a.x, a.y, a.z, d.x, d.y, d.z], k * 6); });
        pts.geometry.attributes.position.needsUpdate = lines.geometry.attributes.position.needsUpdate = true;
      }
      if (f?.face) { const fp = this.face.geometry.attributes.position.array, v = new THREE.Vector3();
        f.face.forEach((l, i) => { b.toScene(l, v); fp.set([v.x, v.y, v.z], i * 3); }); this.face.geometry.attributes.position.needsUpdate = true; }
    }
  }
}

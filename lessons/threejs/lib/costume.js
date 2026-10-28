// Costumes made of geometric parts, after Oskar Schlemmer's Triadic Ballet: spheres, cones, cylinders, discs, hoops and wire spirals
// hung on the body. A costume does not know about video or pose: it reads a Body (joint positions in metres, hips near the origin)
// and puts each part on a body SEGMENT (the shoulder-to-elbow bone, the torso, the head...), sized by the body's own measurements.
import * as THREE from 'three';
import { J } from './body.js';

// ---- segments: the bones and masses of a body ---------------------------------------------------------------------------
const PAIRS = {
  upperArmL: ['leftShoulder', 'leftElbow'], forearmL: ['leftElbow', 'leftWrist'], handL: ['leftWrist', 'leftIndex'],
  upperArmR: ['rightShoulder', 'rightElbow'], forearmR: ['rightElbow', 'rightWrist'], handR: ['rightWrist', 'rightIndex'],
  thighL: ['leftHip', 'leftKnee'], shinL: ['leftKnee', 'leftAnkle'], footL: ['leftAnkle', 'leftFootIndex'],
  thighR: ['rightHip', 'rightKnee'], shinR: ['rightKnee', 'rightAnkle'], footR: ['rightAnkle', 'rightFootIndex'],
};
const GROUP = s => /^(upperArm|forearm|hand|j:.*(Elbow|Wrist|Shoulder))/.test(s) ? 'arms' : /^(thigh|shin|foot|skirt|j:.*(Knee|Ankle|Hip))/.test(s) ? 'legs' : s === 'head' ? 'head' : 'torso';
const V = () => new THREE.Vector3();

// @key Segments from the body | Every part is hung on a segment: two end points, a length, a direction. Torso, pelvis and head are built from several joints; the limbs are just joint pairs.
export function segments(body) {
  const w = body.w, vis = body.frame?.pose, ok = (...names) => !vis || names.every(n => vis[J[n]][3] > 0.5);
  const P = n => w[J[n]], mid = (a, b) => V().addVectors(P(a), P(b)).multiplyScalar(0.5);
  const S = {}, seg = (name, a, b, good, extra = {}) => { const d = V().subVectors(b, a), len = d.length(); S[name] = { a, b, mid: V().addVectors(a, b).multiplyScalar(0.5), len, dir: len ? d.divideScalar(len) : V().set(0, 1, 0), ok: good, ...extra }; };
  for (const [name, [a, b]] of Object.entries(PAIRS)) seg(name, P(a).clone(), P(b).clone(), ok(a, b));
  const hips = mid('leftHip', 'rightHip'), sh = mid('leftShoulder', 'rightShoulder'), ears = mid('leftEar', 'rightEar'), knees = mid('leftKnee', 'rightKnee');
  const goodTorso = ok('leftShoulder', 'rightShoulder', 'leftHip', 'rightHip');
  seg('torso', hips, sh, goodTorso);
  seg('pelvis', hips, hips.clone().addScaledVector(S.torso.dir, 0.02), ok('leftHip', 'rightHip'));
  seg('skirt', hips, knees, ok('leftHip', 'rightHip', 'leftKnee', 'rightKnee'));            // from the hips down to the knees
  // the head: a ball whose size comes from the distance between the ears
  const headR = Math.max(0.07, P('leftEar').distanceTo(P('rightEar')) * 0.62), up = V().subVectors(ears, sh).normalize();
  seg('head', ears.clone().addScaledVector(up, -headR), ears.clone().addScaledVector(up, headR), ok('leftEar', 'rightEar', 'leftShoulder', 'rightShoulder'), { headR });
  for (const n of Object.keys(J)) seg('j:' + n, P(n).clone(), P(n).clone(), ok(n));
  // the body's own measurements, in metres
  S.measure = {
    shoulders: P('leftShoulder').distanceTo(P('rightShoulder')), hips: P('leftHip').distanceTo(P('rightHip')), torso: S.torso.len,
    arm: S.upperArmL.len + S.forearmL.len, leg: S.thighL.len + S.shinL.len, headR,
    scale: Math.min(1.7, Math.max(0.55, P('leftShoulder').distanceTo(P('rightShoulder')) / 0.38)),      // 1 for an adult of 0.38 m shoulders
    right: V().subVectors(P('rightShoulder'), P('leftShoulder')).normalize(),                       // which way the body's right hand points
  };
  return S;
}
// @/key

// ---- shapes: unit geometry, scaled on the body -------------------------------------------------------------------------
const WIRE = 0.007;   // thickness of wire hoops, in metres
function makeShape(p) {
  const rM = Math.max(p.r0 ?? p.r, p.r1 ?? p.r);
  switch (p.shape) {
    case 'sphere': return new THREE.SphereGeometry(1, 28, 18);
    case 'cyl': return new THREE.CylinderGeometry((p.r1 ?? p.r) / rM, (p.r0 ?? p.r) / rM, 1, 28);     // a is the bottom, b the top
    case 'disc': return new THREE.CylinderGeometry(1, 1, 1, 48);
    case 'ring': return new THREE.TorusGeometry(1, WIRE / p.r, 8, 64).rotateX(Math.PI / 2);
    case 'box': return new THREE.BoxGeometry(1, 1, 1);
    default: return null;
  }
}
const helix = (turns, n = 160) => { const g = new THREE.BufferGeometry(), a = []; for (let i = 0; i <= n; i++) { const t = i / n, ang = t * turns * 2 * Math.PI; a.push(Math.cos(ang), t - 0.5, Math.sin(ang)); } return g.setAttribute('position', new THREE.Float32BufferAttribute(a, 3)); };

export const PALETTES = {   // the Triadic Ballet's three moods: cheerful yellow, festive pink, serious black
  yellow: { primary: 0xf2c230, accent: 0x1c1b1a, mask: 0xf4efe4 }, pink: { primary: 0xf08ab0, accent: 0xfaf4ec, mask: 0xf4efe4 }, black: { primary: 0x1a1a1c, accent: 0xe9e4d8, mask: 0xf4efe4 },
};

export class Costume extends THREE.Group {
  constructor(parts) {
    super(); this.name = 'costume';
    const std = (rough, metal) => new THREE.MeshStandardMaterial({ roughness: rough, metalness: metal, side: THREE.DoubleSide });
    this.mats = { primary: std(0.5, 0.05), accent: std(0.3, 0.6), mask: std(0.4, 0.0) };
    this.wireMat = new THREE.LineBasicMaterial({ color: 0xffffff });
    this.parts = parts.map(p => {
      const g = new THREE.Group(); g.matrixAutoUpdate = false; g.visible = false;
      const part = { ...p, group: g, meshes: [], hoops: [] };
      if (p.shape === 'spiral') { const l = new THREE.Line(helix(p.turns ?? 6), this.wireMat); l.frustumCulled = false; l.matrixAutoUpdate = true; g.add(l); part.meshes.push(l); }
      else if (p.shape === 'hoops') { for (let i = 0; i < (p.n ?? 6); i++) { const m = new THREE.Mesh(new THREE.TorusGeometry(1, WIRE / (p.r1 ?? 0.3), 6, 64).rotateX(Math.PI / 2), this.mats[p.mat ?? 'accent']); m.castShadow = true; g.add(m); part.hoops.push(m); } }
      else if (p.shape === 'cone') { const m = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 28), this.mats[p.mat ?? 'primary']); m.castShadow = true; g.add(m); part.meshes.push(m); }
      else { const m = new THREE.Mesh(makeShape(p), this.mats[p.mat ?? 'primary']); m.castShadow = m.receiveShadow = true; g.add(m); part.meshes.push(m); }
      this.add(g); return part;
    });
    this.setPalette('yellow'); this.volume = 1; this.show = { head: true, torso: true, arms: true, legs: true };
  }
  setPalette(name) { const p = PALETTES[name]; for (const k of Object.keys(this.mats)) this.mats[k].color.setHex(p[k]); this.wireMat.color.setHex(p.accent === 0x1c1b1a ? 0x1c1b1a : p.accent); }
  set wireframe(v) { for (const m of Object.values(this.mats)) m.wireframe = v; }

  // @key A part follows its segment | Each frame a part gets a basis (right, up, forward) from its segment and is scaled by the body's measurements: length from the bone, thickness from the shoulder width. No part knows what the others are.
  update(body, S = segments(body)) {
    const sc = S.measure.scale * this.volume, m = new THREE.Matrix4(), up = new THREE.Vector3(), r = new THREE.Vector3(), f = new THREE.Vector3(), c = new THREE.Vector3();
    for (const p of this.parts) {
      const s = S[p.seg], g = p.group;
      g.visible = !!s && s.ok && this.show[GROUP(p.seg)] !== false;
      if (!g.visible) continue;
      up.copy(s.dir); r.copy(S.measure.right).addScaledVector(up, -S.measure.right.dot(up)); if (r.lengthSq() < 1e-4) r.set(1, 0, 0); r.normalize(); f.crossVectors(r, up).normalize();
      const shift = (p.shift ?? 0) * s.len, at = p.at ?? 0.5, rad = (p.r ?? p.r0 ?? 0.1) * sc, depth = p.depth ?? 1, lenMul = p.len ?? 1;
      c.copy(s.a).addScaledVector(up, s.len * at + shift);                       // where on the segment the part sits (0 = a end, 1 = b end)
      if (p.shape === 'sphere') { const R = (p.seg === 'head' ? s.headR : 1) * (p.seg === 'head' ? p.r : p.r * sc); m.makeBasis(r.clone().multiplyScalar(R), up.clone().multiplyScalar(R), f.clone().multiplyScalar(R)); }
      else if (p.shape === 'cyl' || p.shape === 'cone' || p.shape === 'spiral') { const w = Math.max(p.r0 ?? p.r, p.r1 ?? p.r) * sc; m.makeBasis(r.clone().multiplyScalar(w), up.clone().multiplyScalar(s.len * lenMul), f.clone().multiplyScalar(w * depth)); }
      else if (p.shape === 'disc') m.makeBasis(r.clone().multiplyScalar(rad), up.clone().multiplyScalar(p.thick ?? 0.02), f.clone().multiplyScalar(rad));
      else if (p.shape === 'ring') m.makeBasis(r.clone().multiplyScalar(rad), up.clone().multiplyScalar(rad), f.clone().multiplyScalar(rad));
      else if (p.shape === 'hoops') {
        m.identity(); g.matrix.identity();
        p.hoops.forEach((h, i) => { const t = (i + 0.5) / p.hoops.length, R = (p.r0 + (p.r1 - p.r0) * t) * sc, hc = new THREE.Vector3().copy(s.a).addScaledVector(up, s.len * t * (p.len ?? 1)); h.matrixAutoUpdate = false; h.matrix.makeBasis(r.clone().multiplyScalar(R), up.clone().multiplyScalar(R), f.clone().multiplyScalar(R)).setPosition(hc); });
        g.matrixWorldNeedsUpdate = true;
        continue;
      } else m.makeBasis(r.clone().multiplyScalar(rad), up.clone().multiplyScalar(s.len), f.clone().multiplyScalar(rad));
      g.matrix.copy(m).setPosition(c);
      g.matrixWorldNeedsUpdate = true;
    }
  }
  // @/key
}

// ---- the costumes ---------------------------------------------------------------------------------------------------------
// radii are metres on an adult body and scale with the shoulders; head spheres are a multiple of the head's own radius.
const joints = (names, r, mat = 'accent') => names.map(n => ({ seg: 'j:' + n, shape: 'sphere', r, mat }));
const limb = (shape, r0, r1, o = {}) => ['upperArmL', 'upperArmR', 'forearmL', 'forearmR', 'thighL', 'thighR', 'shinL', 'shinR'].map(seg => ({ seg, shape, r0: r0, r1: r1, r: r0, ...o }));
export const COSTUMES = {
  // @key The costumes are lists of parts | A part is a shape, a segment to hang it on, a size and a material. Three costumes after Schlemmer's: wire spirals, a disc and cones, wire hoops.
  spiral: { label: 'Spiral', parts: [
    { seg: 'head', shape: 'sphere', r: 1.05, mat: 'mask' }, { seg: 'torso', shape: 'cyl', r0: 0.15, r1: 0.19, depth: 0.62, mat: 'primary' },
    ...['upperArmL', 'upperArmR', 'forearmL', 'forearmR'].map(seg => ({ seg, shape: 'spiral', r: 0.06, turns: 7 })),
    ...['thighL', 'thighR'].map(seg => ({ seg, shape: 'spiral', r: 0.085, turns: 8 })), ...['shinL', 'shinR'].map(seg => ({ seg, shape: 'spiral', r: 0.062, turns: 8 })),
    ...joints(['leftElbow', 'rightElbow', 'leftKnee', 'rightKnee', 'leftWrist', 'rightWrist'], 0.045), { seg: 'pelvis', shape: 'disc', r: 0.15, thick: 0.05, mat: 'primary' },
  ] },
  disc: { label: 'Disc and cone', parts: [
    { seg: 'head', shape: 'sphere', r: 1, mat: 'mask' }, { seg: 'head', shape: 'cone', r: 0.075, at: 1, len: 0.9, shift: 0.45, mat: 'accent' },
    { seg: 'torso', shape: 'cyl', r0: 0.1, r1: 0.22, depth: 0.55, mat: 'primary' }, { seg: 'pelvis', shape: 'disc', r: 0.42, thick: 0.03, mat: 'accent' },
    ...limb('cyl', 0.06, 0.045, { mat: 'primary' }).filter(p => /Arm/.test(p.seg)), ...['forearmL', 'forearmR'].map(seg => ({ seg, shape: 'cyl', r0: 0.05, r1: 0.04, mat: 'primary' })),
    ...['thighL', 'thighR'].map(seg => ({ seg, shape: 'cyl', r0: 0.1, r1: 0.06, mat: 'primary' })), ...['shinL', 'shinR'].map(seg => ({ seg, shape: 'cyl', r0: 0.06, r1: 0.04, mat: 'primary' })),
    ...joints(['leftWrist', 'rightWrist'], 0.05, 'mask'), ...['footL', 'footR'].map(seg => ({ seg, shape: 'cone', r: 0.055, len: 1.2, mat: 'accent' })),
  ] },
  hoops: { label: 'Hoops', parts: [
    { seg: 'head', shape: 'sphere', r: 1, mat: 'mask' }, { seg: 'head', shape: 'cone', r: 0.09, at: 1, len: 1.1, shift: 0.55, mat: 'primary' },
    { seg: 'torso', shape: 'cyl', r0: 0.13, r1: 0.17, depth: 0.6, mat: 'primary' }, ...[0.25, 0.55, 0.85].map(at => ({ seg: 'torso', shape: 'ring', r: 0.17, at, mat: 'accent' })),
    { seg: 'skirt', shape: 'hoops', n: 7, r0: 0.16, r1: 0.42, len: 1.15, mat: 'accent' },
    ...['upperArmL', 'upperArmR', 'forearmL', 'forearmR'].map(seg => ({ seg, shape: 'spiral', r: 0.04, turns: 5 })),
    ...['thighL', 'thighR', 'shinL', 'shinR'].map(seg => ({ seg, shape: 'cyl', r0: 0.06, r1: 0.045, mat: 'primary' })), ...joints(['leftWrist', 'rightWrist'], 0.045, 'mask'),
  ] },
  // @/key
  figure: { label: 'Figurine', parts: [
    { seg: 'head', shape: 'sphere', r: 1, mat: 'mask' }, { seg: 'torso', shape: 'cyl', r0: 0.1, r1: 0.14, depth: 0.5, mat: 'primary' },
    ...limb('cyl', 0.022, 0.022, { mat: 'accent' }), ...joints(['leftShoulder', 'rightShoulder', 'leftElbow', 'rightElbow', 'leftWrist', 'rightWrist', 'leftHip', 'rightHip', 'leftKnee', 'rightKnee', 'leftAnkle', 'rightAnkle'], 0.04, 'primary'),
  ] },
};

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
  // which way is front? the nose is in front of the neck. Decide with a little hysteresis so a noisy frame does not flip the costume.
  const front = V().crossVectors(S.measure.right, S.torso.dir), nose = V().subVectors(P('nose'), sh), d = front.dot(nose);
  if (vis && vis[J.nose][3] > 0.5 && Math.abs(d) > 0.02) body._flip = d < 0;
  if (body._flip) S.measure.right.negate();
  return S;
}
// @/key

// ---- shapes: unit geometry, scaled on the body -------------------------------------------------------------------------
const WIRE = 0.007;   // default thickness of wire hoops, in metres

function makeShape(p) {
  const rM = Math.max(p.r0 ?? p.r, p.r1 ?? p.r);
  switch (p.shape) {
    case 'sphere': return new THREE.SphereGeometry(1, 28, 18);
    case 'ellipsoid': return new THREE.SphereGeometry(1, 36, 24);
    case 'bowl': return new THREE.SphereGeometry(1, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI);   // a dish, open upward
    case 'cyl': return new THREE.CylinderGeometry((p.r1 ?? p.r) / rM, (p.r0 ?? p.r) / rM, 1, 28);     // a is the bottom, b the top
    case 'disc': return new THREE.CylinderGeometry(1, 1, 1, 48);
    case 'ring': return new THREE.TorusGeometry(1, WIRE / p.r, 8, 64).rotateX(Math.PI / 2);
    case 'box': return new THREE.BoxGeometry(1, 1, 1);
    default: return null;
  }
}
const helix = (turns, n = 160) => { const g = new THREE.BufferGeometry(), a = []; for (let i = 0; i <= n; i++) { const t = i / n, ang = t * turns * 2 * Math.PI; a.push(Math.cos(ang), t - 0.5, Math.sin(ang)); } return g.setAttribute('position', new THREE.Float32BufferAttribute(a, 3)); };

// a pleated disc like a parasol: a raised centre, a rim that zigzags up and down, and a rib along every ridge (unit radius, in the XZ plane)
function fanGeometry(pleats) {
  const N = pleats * 2, pos = [0, 0.09, 0], idx = [], ribs = [0, 0.09, 0];
  for (let i = 0; i < N; i++) { const a = i / N * 2 * Math.PI, y = i % 2 ? -0.03 : 0.03; pos.push(Math.cos(a), y, Math.sin(a)); if (i % 2 === 0) ribs.push(Math.cos(a), y, Math.sin(a)); }
  for (let i = 0; i < N; i++) idx.push(0, 1 + i, 1 + (i + 1) % N);
  const g = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)).setIndex(idx); g.computeVertexNormals();
  const l = []; for (let i = 3; i < ribs.length; i += 3) l.push(0, 0.09, 0, ribs[i], ribs[i + 1], ribs[i + 2]);
  return { surface: g, ribs: new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(l, 3)) };
}

// ---- organic limbs: a radius profile along the bone, smoothed with a spline and turned into a surface ------------------------------
// @key A profile is a curve of radius against length | [t along the bone (0 = near end), radius in metres]. A spline smooths the points and LatheGeometry spins the curve around the bone, so a thigh can swell, a calf taper and a sleeve balloon.
export const PROFILES = {
  thigh: [[0, 0.085], [0.3, 0.12], [0.7, 0.095], [1, 0.06]], calf: [[0, 0.06], [0.28, 0.078], [0.6, 0.05], [1, 0.032]],
  balloon: [[0, 0.07], [0.3, 0.16], [0.65, 0.15], [1, 0.06]],                                          // baggy pantaloons
  uparm: [[0, 0.045], [0.4, 0.062], [1, 0.045]], forearm: [[0, 0.045], [0.3, 0.055], [1, 0.03]], puff: [[0, 0.045], [0.25, 0.09], [0.6, 0.105], [0.9, 0.075], [1, 0.05]],
  pear: [[0, 0.09], [0.35, 0.19], [0.75, 0.14], [1, 0.09]], waist: [[0, 0.06], [0.5, 0.1], [1, 0.19]], slim: [[0, 0.04], [0.5, 0.05], [1, 0.035]],
};
function latheGeometry(profile, caps) {
  const rMax = Math.max(...profile.map(p => p[1])), pts = new THREE.SplineCurve(profile.map(([t, r]) => new THREE.Vector2(r / rMax, t - 0.5))).getPoints(40);
  if (caps) { pts.unshift(new THREE.Vector2(0, -0.5)); pts.push(new THREE.Vector2(0, 0.5)); }
  return new THREE.LatheGeometry(pts, 40);
}
// @/key

// each palette: primary and accent (the main two colours), mask (for faces and pale limbs) and multi (six colours for stripes, balls, rings, fringes)
const BAUHAUS_SET = [0xd9392c, 0x2447a8, 0xf0b429, 0x3f9a55, 0xe8873a, 0x7d4fa8];
export const PALETTES = {
  yellow: { primary: 0xf2c230, accent: 0x1c1b1a, mask: 0xf4efe4, multi: BAUHAUS_SET },   // the Triadic Ballet's three moods: cheerful yellow, festive pink, serious black
  pink: { primary: 0xf08ab0, accent: 0xfaf4ec, mask: 0xf4efe4, multi: [0xf08ab0, 0xfaf4ec, 0xd9392c, 0xf2c230, 0x8a5fb0, 0x2f5fb4] },
  black: { primary: 0x1a1a1c, accent: 0xe9e4d8, mask: 0xf4efe4, multi: [0x1a1a1c, 0xe9e4d8, 0x555a63, 0xc9ced6, 0x8a8e96, 0x2d3036] },
  bauhaus: { primary: 0xd9392c, accent: 0x1f3f9e, mask: 0xf3ecd8, multi: BAUHAUS_SET },
  sunset: { primary: 0xf27a35, accent: 0x5b1a4a, mask: 0xf9efe0, multi: [0xff6b35, 0xf7c548, 0xd7263d, 0x7a1f5c, 0xff9f1c, 0x2e294e] },
  ocean: { primary: 0x1f77b4, accent: 0xe8f4f8, mask: 0xf0f4f2, multi: [0x0b3d91, 0x1e88e5, 0x4fc3f7, 0xb2ebf2, 0x00897b, 0xe0f7fa] },
  candy: { primary: 0xff7eb6, accent: 0x3ec5c0, mask: 0xfff7ef, multi: [0xff7eb6, 0x3ec5c0, 0xffd166, 0x9b5de5, 0xff9770, 0x06d6a0] },
  acid: { primary: 0xc6f432, accent: 0x2b1055, mask: 0xf4f6e6, multi: [0xc6f432, 0xff2e93, 0x2b1055, 0x00e5ff, 0xffb400, 0x7a3cff] },
};
// materials that do not change with the palette: gold, ink and the Bauhaus colours
const FIXED = { ink: [0x17171a, 0.5, 0.1], steel: [0xc4ccd6, 0.35, 0.45], gold: [0xd9a93a, 0.25, 0.85], bone: [0xe8e4d6, 0.4, 0.2], warm: [0xd9483b, 0.5, 0], sun: [0xf0b429, 0.5, 0], sky: [0x6fb7c4, 0.45, 0.1], blue: [0x2f5fb4, 0.5, 0], green: [0x4d9a58, 0.5, 0], orange: [0xe8873a, 0.5, 0], violet: [0x8a5fb0, 0.5, 0] };

export class Costume extends THREE.Group {
  constructor(parts) {
    super(); this.name = 'costume';
    const std = (rough, metal, o = {}) => new THREE.MeshStandardMaterial({ roughness: rough, metalness: metal, side: THREE.DoubleSide, ...o });
    this.mats = { primary: std(0.5, 0.05), accent: std(0.3, 0.6), mask: std(0.4, 0.0), fan: std(0.65, 0, { flatShading: true }) };   // these follow the palette
    for (const [k, [c, r, m]] of Object.entries(FIXED)) this.mats[k] = std(r, m, { color: c });
    this.wireMat = new THREE.LineBasicMaterial({ color: 0xffffff });
    this.multiMats = Array.from({ length: 6 }, () => std(0.5, 0.05)); this.recolor = [];
    const mat = n => /^m[0-5]$/.test(n) ? this.multiMats[+n[1]] : (this.mats[n] ?? this.mats.primary);
    const mesh = (geo, m, g, kids) => { const o = new THREE.Mesh(geo, mat(m)); o.castShadow = true; o.receiveShadow = true; o.matrixAutoUpdate = false; g.add(o); kids.push(o); return o; };
    const unitCyl = new THREE.CylinderGeometry(1, 1, 1, 20), unitSph = new THREE.SphereGeometry(1, 16, 12);
    this.parts = parts.map(p => {
      const g = new THREE.Group(); g.matrixAutoUpdate = false; g.visible = false;
      const part = { ...p, group: g, kids: [] }, k = part.kids;
      switch (p.shape) {
        case 'spiral': { const l = new THREE.Line(helix(p.turns ?? 6), this.wireMat); l.frustumCulled = false; g.add(l); break; }
        case 'cone': mesh(new THREE.ConeGeometry(1, 1, 28), p.mat ?? 'primary', g, k); break;
        case 'hoops': for (let i = 0; i < (p.n ?? 6); i++) mesh(new THREE.TorusGeometry(1, (p.wire ?? WIRE) / (p.r1 ?? 0.3), 6, 64).rotateX(Math.PI / 2), p.mat ?? 'accent', g, k); break;
        case 'fan': { const f = fanGeometry(p.pleats ?? 24); mesh(f.surface, p.mat ?? 'fan', g, k); const ribs = new THREE.LineSegments(f.ribs, this.wireMat); ribs.matrixAutoUpdate = false; g.add(ribs); k.push(ribs); break; }
        case 'bolsters': for (let i = 0; i < (p.n ?? 5); i++) { const c = p.colors?.[i] ?? p.mat ?? 'sun'; mesh(unitCyl, c, g, k); mesh(unitSph, c, g, k); mesh(unitSph, c, g, k); } break;   // a stick and two round ends, per bolster
        case 'stripes': for (let i = 0; i < (p.n ?? 6); i++) mesh(unitCyl, p.multi ? 'm' + ((i + (p.offset ?? 0)) % 6) : i % 2 ? (p.mat2 ?? 'accent') : (p.mat ?? 'primary'), g, k); break;
        case 'lathe': {
          const geo = latheGeometry(p.profile, p.caps ?? true), colors = new Float32Array(geo.attributes.position.count * 3).fill(1); geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
          const m = new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.05, vertexColors: true, side: THREE.DoubleSide }), o = new THREE.Mesh(geo, m); o.castShadow = o.receiveShadow = true; o.matrixAutoUpdate = false; g.add(o); k.push(o);
          const colorOf = (n, pal) => typeof pal[n] === 'number' ? pal[n] : /^m[0-5]$/.test(n) ? pal.multi[+n[1]] : FIXED[n]?.[0] ?? pal.primary;
          this.recolor.push(pal => {
            if (!p.stripes) { m.color.setHex(colorOf(p.mat ?? 'primary', pal)); return; }
            m.color.setHex(0xffffff);   // banded: colour lives in the vertices, one band per stripe along the bone
            const list = p.stripes.colors ?? ['m0', 'm1', 'm2', 'm3', 'm4', 'm5'], pos = geo.attributes.position, col = geo.attributes.color;
            for (let i = 0; i < pos.count; i++) { const band = Math.min(p.stripes.n - 1, Math.floor((pos.getY(i) + 0.5) * p.stripes.n)), c = new THREE.Color(colorOf(list[(band + (p.stripes.offset ?? 0)) % list.length], pal)); col.setXYZ(i, c.r, c.g, c.b); }
            col.needsUpdate = true;
          });
          break;
        }
        case 'tube': mesh(new THREE.TorusGeometry(1, p.tube ?? 0.4, 18, 56).rotateX(Math.PI / 2), p.mat ?? 'primary', g, k); break;     // a fat ring, like an inner tube
        case 'annuli': for (let i = 0; i < (p.n ?? 6); i++) mesh(new THREE.RingGeometry(p.inner ?? 0.6, 1, 72, 1).rotateX(-Math.PI / 2), i % 2 ? (p.mat2 ?? 'mask') : (p.mat ?? 'primary'), g, k); break;   // flat wide rings
        case 'target': {   // a round board painted with rings of colour, worn facing forward
          const cv = document.createElement('canvas'); cv.width = cv.height = 512; const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
          const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, side: THREE.DoubleSide, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.55 }); /* glows a little so the colours survive the light */ const o = new THREE.Mesh(new THREE.CircleGeometry(1, 72).rotateX(-Math.PI / 2), m); o.castShadow = o.receiveShadow = true; o.matrixAutoUpdate = false; g.add(o); k.push(o);
          this.recolor.push(pal => { const x = cv.getContext('2d'), n = p.rings ?? 7; for (let i = 0; i < n; i++) { x.fillStyle = '#' + pal.multi[(i + (p.offset ?? 0)) % 6].toString(16).padStart(6, '0'); x.beginPath(); x.arc(256, 256, 256 * (1 - i / n), 0, 7); x.fill(); } x.strokeStyle = 'rgba(0,0,0,0.5)'; x.lineWidth = 4; x.beginPath(); x.arc(256, 256, 253, 0, 7); x.stroke(); tex.needsUpdate = true; });
          break;
        }
        case 'fringe': {   // strips hanging from a ring, like the fringe of a lampshade
          const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.5 }), p.n ?? 40); im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array((p.n ?? 40) * 3), 3); im.castShadow = true; im.frustumCulled = false; g.add(im); k.push(im);
          this.recolor.push(pal => { for (let i = 0; i < im.count; i++) im.setColorAt(i, new THREE.Color(pal.multi[(p.offset ?? 0) + (i % 2)])); im.instanceColor.needsUpdate = true; });
          break;
        }
        case 'rods': { const im = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 5), mat(p.mat ?? 'accent'), p.n ?? 24); im.castShadow = true; im.frustumCulled = false; g.add(im); k.push(im); break; }
        case 'ballcone': {   // rows of balls, each row wider than the last: a cone built of spheres, in Bauhaus colours
          const rows = p.rows ?? 5, counts = Array.from({ length: rows }, (_, r) => { const R = p.r0 + (p.r1 - p.r0) * (r / (rows - 1)); return Math.max(5, Math.round(2 * Math.PI * R / (p.br * 2.15))); });
          const im = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.05 }), counts.reduce((a, b) => a + b, 0));
          im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(im.count * 3), 3); im.castShadow = true; im.frustumCulled = false;
          part.counts = counts; g.add(im); k.push(im);
          this.recolor.push(pal => { let n = 0; counts.forEach((c, r) => { for (let i = 0; i < c; i++) im.setColorAt(n++, new THREE.Color(pal.multi[(r * 2 + i) % 6])); }); im.instanceColor.needsUpdate = true; }); break;
        }
        case 'cage': { const R = [[0, 0, 0], [Math.PI / 2, 0, 0], [0, 0, Math.PI / 2], [Math.PI / 4, 0, Math.PI / 4], [-Math.PI / 4, 0, Math.PI / 4]]; for (const e of R) mesh(new THREE.TorusGeometry(1, 0.03, 6, 48).rotateX(e[0]).rotateZ(e[2]), p.mat ?? 'bone', g, k); break; }
        default: mesh(makeShape(p), p.mat ?? 'primary', g, k);
      }
      this.add(g); return part;
    });
    this.setPalette('yellow'); this.volume = 1; this.show = { head: true, torso: true, arms: true, legs: true };
  }
  setPalette(name) {
    const p = PALETTES[name]; for (const k of ['primary', 'accent', 'mask']) this.mats[k].color.setHex(p[k]); this.mats.fan.color.setHex(p.primary);
    this.wireMat.color.setHex(p.accent); p.multi.forEach((c, i) => this.multiMats[i].color.setHex(c)); for (const f of this.recolor) f(p);
  }
  set wireframe(v) { for (const m of Object.values(this.mats)) m.wireframe = v; }

  // @key A part follows its segment | Each frame a part gets a basis (right, up, forward) from its segment and is scaled by the body's measurements: length from the bone, thickness from the shoulder width. No part knows what the others are.
  update(body, S = segments(body)) {
    const sc = S.measure.scale * this.volume, M = new THREE.Matrix4(), up = new THREE.Vector3(), r = new THREE.Vector3(), f = new THREE.Vector3(), c = new THREE.Vector3(), T = new THREE.Matrix4(), tmp = new THREE.Vector3();
    const basis = (out, rx, ry, rz) => out.makeBasis(tmp.copy(r).multiplyScalar(rx).clone(), new THREE.Vector3().copy(up).multiplyScalar(ry), new THREE.Vector3().copy(f).multiplyScalar(rz));
    for (const p of this.parts) {
      const s = S[p.seg], g = p.group;
      g.visible = !!s && s.ok && this.show[GROUP(p.seg)] !== false;
      if (!g.visible) continue;
      up.copy(s.dir); r.copy(S.measure.right).addScaledVector(up, -S.measure.right.dot(up)); if (r.lengthSq() < 1e-4) r.set(1, 0, 0); r.normalize(); f.crossVectors(r, up).normalize();
      const at = p.at ?? 0.5, rad = (p.r ?? p.r0 ?? 0.1) * sc, depth = p.depth ?? 1, lenMul = p.len ?? 1;
      c.copy(s.a).addScaledVector(up, s.len * (at + (p.shift ?? 0)));            // where on the segment the part sits (0 = a end, 1 = b end)
      if (p.fwd) c.addScaledVector(f, p.fwd * sc); if (p.side) c.addScaledVector(r, p.side * sc);   // nudged toward the front, or sideways
      g.matrix.identity(); g.matrixWorldNeedsUpdate = true;
      const place = (mesh, m) => { mesh.matrix.copy(m); mesh.matrixWorldNeedsUpdate = true; };
      switch (p.shape) {
        case 'sphere': { const R = p.seg === 'head' ? s.headR * p.r : p.r * sc; g.matrix.copy(basis(M, R, R, R)).setPosition(c); break; }
        case 'ellipsoid': g.matrix.copy(basis(M, (p.rx ?? p.r) * sc, p.ryLen ? p.ryLen * s.len : (p.ry ?? p.r) * sc, (p.rz ?? p.rx ?? p.r) * sc)).setPosition(c); break;
        case 'bowl': { const R = p.seg === 'head' ? s.headR * p.r : rad; g.matrix.copy(basis(M, R, R * (p.h ?? 0.35), R)).setPosition(c); break; }
        case 'cyl': case 'cone': case 'spiral': case 'lathe': { const w = (p.shape === 'lathe' ? Math.max(...p.profile.map(q => q[1])) : Math.max(p.r0 ?? p.r, p.r1 ?? p.r)) * sc; g.matrix.copy(basis(M, w, s.len * lenMul, w * depth)).setPosition(c); break; }
        case 'disc': g.matrix.copy(basis(M, rad, p.thick ?? 0.02, rad)).setPosition(c); break;
        case 'ring': g.matrix.copy(basis(M, rad, rad, rad)).setPosition(c); break;
        case 'fan': g.matrix.copy(new THREE.Matrix4().makeBasis(r.clone().multiplyScalar(rad), f.clone().multiplyScalar(rad), up.clone().multiplyScalar(rad))).setPosition(c); break;   // the pleated disc faces forward, like a parasol worn on the body
        case 'hoops': p.kids.forEach((h, i) => { const t = (i + 0.5) / p.kids.length, R = (p.r0 + (p.r1 - p.r0) * t ** (p.curve ?? 1)) * sc; place(h, basis(M, R, R, R).setPosition(tmp.copy(s.a).addScaledVector(up, s.len * t * lenMul))); }); break;
        case 'bolsters': {   // upright round sticks side by side across the chest, like the ribs of a corset
          const n = p.n ?? 5, br = p.br * sc, L = s.len * lenMul, gap = (p.width ?? 0.2) * sc / Math.max(1, n - 1);
          for (let i = 0; i < n; i++) {
            const ctr = new THREE.Vector3().copy(c).addScaledVector(r, (i - (n - 1) / 2) * gap).addScaledVector(f, (p.d ?? 0.1) * sc), k = p.kids.slice(i * 3, i * 3 + 3);
            place(k[0], basis(M, br, L, br).setPosition(ctr));
            place(k[1], basis(M, br, br, br).setPosition(tmp.copy(ctr).addScaledVector(up, L / 2))); place(k[2], basis(M, br, br, br).setPosition(tmp.copy(ctr).addScaledVector(up, -L / 2)));
          } break;
        }
        case 'stripes': {   // bands of two colours along the bone, tapering from r0 to r1
          const n = p.kids.length;
          p.kids.forEach((b, i) => { const t = (i + 0.5) / n, R = (p.r0 + (p.r1 - p.r0) * t) * sc; place(b, basis(M, R, s.len / n * 1.002, R * depth).setPosition(tmp.copy(s.a).addScaledVector(up, s.len * t))); });
          break;
        }
        case 'rods': {   // thin rods from a ring (a plate's rim) down to one point: an open cone of sticks
          const im = p.kids[0], apex = new THREE.Vector3().copy(s.a).addScaledVector(up, s.len * (p.apexAt ?? 1)), q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0), th = (p.thick ?? 0.004) * sc, R = (p.r ?? 0.3) * sc;
          for (let i = 0; i < im.count; i++) {
            const a = i / im.count * 2 * Math.PI, p0 = new THREE.Vector3().copy(s.a).addScaledVector(r, Math.cos(a) * R).addScaledVector(f, Math.sin(a) * R), d = new THREE.Vector3().subVectors(apex, p0), L = d.length();
            q.setFromUnitVectors(Y, d.divideScalar(L)); im.setMatrixAt(i, M.compose(tmp.copy(p0).addScaledVector(d, L / 2), q, new THREE.Vector3(th, L, th)));
          }
          im.instanceMatrix.needsUpdate = true; break;
        }
        case 'ballcone': {
          const im = p.kids[0], rows = p.counts.length, br = p.br * sc; let n = 0;
          p.counts.forEach((cnt, row) => { const t = row / (rows - 1), R = (p.r0 + (p.r1 - p.r0) * t) * sc, base = new THREE.Vector3().copy(s.a).addScaledVector(up, s.len * lenMul * t);
            for (let i = 0; i < cnt; i++) { const a = i / cnt * 2 * Math.PI + row * 0.4; im.setMatrixAt(n++, M.compose(tmp.copy(base).addScaledVector(r, Math.cos(a) * R).addScaledVector(f, Math.sin(a) * R), new THREE.Quaternion(), new THREE.Vector3(br, br, br))); } });
          im.instanceMatrix.needsUpdate = true; break;
        }
        case 'tube': g.matrix.copy(basis(M, rad, rad, rad)).setPosition(c); break;
        case 'target': g.matrix.copy(new THREE.Matrix4().makeBasis(r.clone().multiplyScalar(rad), f.clone().multiplyScalar(rad), up.clone().multiplyScalar(rad))).setPosition(c); break;
        case 'annuli': {   // wide rings, each tilted about a different horizontal axis: the swirl of a spinning skirt
          const n = p.kids.length, q = new THREE.Quaternion(), axis = new THREE.Vector3();
          p.kids.forEach((k, i) => { const t = (i + 0.5) / n, R = (p.r0 + (p.r1 - p.r0) * t) * sc, phi = i * (p.twist ?? 1.1);
            axis.copy(r).multiplyScalar(Math.cos(phi)).addScaledVector(f, Math.sin(phi)).normalize(); q.setFromAxisAngle(axis, (p.tilt ?? 0.3) * (i % 2 ? -1 : 1));
            place(k, new THREE.Matrix4().makeRotationFromQuaternion(q).multiply(basis(M, R, R, R)).setPosition(tmp.copy(s.a).addScaledVector(up, s.len * lenMul * t))); }); break;
        }
        case 'fringe': {
          const im = p.kids[0], R = (p.r ?? 0.25) * sc, drop = s.len * lenMul, w = (p.w ?? 0.018) * sc, q = new THREE.Quaternion();
          for (let i = 0; i < im.count; i++) { const a = i / im.count * 2 * Math.PI, pos = new THREE.Vector3().copy(c).addScaledVector(r, Math.cos(a) * R).addScaledVector(f, Math.sin(a) * R * (p.depth ?? 1)).addScaledVector(up, -drop / 2);
            im.setMatrixAt(i, basis(M, w, drop, w * 0.5).setPosition(pos)); }
          im.instanceMatrix.needsUpdate = true; break;
        }
        case 'cage': { const R = s.headR * p.r; p.kids.forEach(k => place(k, basis(M, R, R, R).setPosition(c))); break; }
        default: g.matrix.copy(basis(M, rad, s.len, rad)).setPosition(c);
      }
    }
  }
  // @/key
}

// ---- the costumes ---------------------------------------------------------------------------------------------------------
// radii are metres on an adult body and scale with the shoulders; head spheres are a multiple of the head's own radius.
const joints = (names, r, mat = 'accent') => names.map(n => ({ seg: 'j:' + n, shape: 'sphere', r, mat }));
const bones = (segs, shape, o) => segs.map(seg => ({ seg, shape, ...o }));
const ARMS = ['upperArmL', 'upperArmR', 'forearmL', 'forearmR'], LEGS = ['thighL', 'thighR', 'shinL', 'shinR'];
export const COSTUMES = {
  // @key The costumes are lists of parts | A part is a shape, a segment to hang it on, a size and a material. Costumes after Schlemmer's: wire spirals, a disc and cones, a parasol, a gold egg on a plate of rods, a pyramid of balls, a wire bell.
  spiral: { label: 'Spiral', parts: [
    { seg: 'head', shape: 'sphere', r: 1.05, mat: 'mask' }, { seg: 'torso', shape: 'cyl', r0: 0.15, r1: 0.19, depth: 0.62, mat: 'primary' },
    ...bones(['upperArmL', 'upperArmR', 'forearmL', 'forearmR'], 'spiral', { r: 0.06, turns: 7 }),
    ...bones(['thighL', 'thighR'], 'spiral', { r: 0.085, turns: 8 }), ...bones(['shinL', 'shinR'], 'spiral', { r: 0.062, turns: 8 }),
    ...joints(['leftElbow', 'rightElbow', 'leftKnee', 'rightKnee', 'leftWrist', 'rightWrist'], 0.045), { seg: 'pelvis', shape: 'disc', r: 0.15, thick: 0.05, mat: 'primary' },
  ] },
  disc: { label: 'Disc and cone', parts: [
    { seg: 'head', shape: 'sphere', r: 1, mat: 'mask' }, { seg: 'head', shape: 'cone', r: 0.075, at: 1, len: 0.9, shift: 0.45, mat: 'accent' },
    { seg: 'torso', shape: 'cyl', r0: 0.1, r1: 0.22, depth: 0.55, mat: 'primary' }, { seg: 'pelvis', shape: 'disc', r: 0.42, thick: 0.03, mat: 'accent' },
    ...bones(['upperArmL', 'upperArmR'], 'cyl', { r0: 0.06, r1: 0.045, mat: 'primary' }), ...bones(['forearmL', 'forearmR'], 'cyl', { r0: 0.05, r1: 0.04, mat: 'primary' }),
    ...bones(['thighL', 'thighR'], 'cyl', { r0: 0.1, r1: 0.06, mat: 'primary' }), ...bones(['shinL', 'shinR'], 'cyl', { r0: 0.06, r1: 0.04, mat: 'primary' }),
    ...joints(['leftWrist', 'rightWrist'], 0.05, 'mask'), ...bones(['footL', 'footR'], 'cone', { r: 0.055, len: 1.2, mat: 'accent' }),
  ] },
  // the parasol: a big pleated fan worn facing forward, a corset of upright bolsters, a headband of rings, pale limbs on pointe
  fan: { label: 'Parasol', parts: [
    { seg: 'head', shape: 'sphere', r: 1, mat: 'mask' }, { seg: 'head', shape: 'ring', r: 0.1, at: 0.8, mat: 'warm' }, { seg: 'head', shape: 'ring', r: 0.105, at: 0.9, mat: 'sun' },
    { seg: 'torso', shape: 'cyl', r0: 0.11, r1: 0.14, depth: 0.5, mat: 'mask' },
    { seg: 'torso', shape: 'bolsters', n: 5, br: 0.024, width: 0.13, d: 0.07, len: 0.55, at: 0.45, colors: ['sun', 'sun', 'warm', 'sun', 'sun'] },
    { seg: 'torso', shape: 'fan', r: 0.58, at: 0.32, pleats: 28, mat: 'fan' },
    ...bones(ARMS, 'cyl', { r0: 0.035, r1: 0.03, mat: 'mask' }), ...bones(['thighL', 'thighR'], 'cyl', { r0: 0.07, r1: 0.05, mat: 'mask' }), ...bones(['shinL', 'shinR'], 'cyl', { r0: 0.05, r1: 0.035, mat: 'mask' }),
    ...bones(['footL', 'footR'], 'cone', { r: 0.04, len: 1.5, mat: 'mask' }),
  ] },
  // the gold egg: a small gold head in a saucer, a big gold ovoid for a body, a plate, and a cone of rods down to the knees
  ovoid: { label: 'Gold egg', parts: [
    { seg: 'head', shape: 'sphere', r: 0.95, mat: 'gold' }, { seg: 'head', shape: 'bowl', r: 2.0, h: 0.5, at: 0.02, mat: 'sky' },
    { seg: 'torso', shape: 'ellipsoid', rx: 0.24, ryLen: 0.66, rz: 0.21, at: 0.4, mat: 'gold' },
    { seg: 'pelvis', shape: 'disc', r: 0.36, thick: 0.02, mat: 'sky' }, { seg: 'skirt', shape: 'rods', n: 32, r: 0.36, apexAt: 1.55, thick: 0.004, mat: 'bone' },
    ...bones(ARMS, 'cyl', { r0: 0.035, r1: 0.03, mat: 'ink' }), ...bones(['thighL', 'thighR', 'shinL', 'shinR'], 'cyl', { r0: 0.05, r1: 0.04, mat: 'ink' }), ...bones(['footL', 'footR'], 'cone', { r: 0.04, len: 1.3, mat: 'ink' }),
  ] },
  // the ball pyramid: a cone of coloured balls for a skirt, striped body and limbs
  balls: { label: 'Ball pyramid', parts: [
    { seg: 'head', shape: 'sphere', r: 1, mat: 'mask' }, { seg: 'head', shape: 'cone', r: 0.07, at: 1, len: 1, shift: 0.5, mat: 'warm' },
    { seg: 'torso', shape: 'stripes', n: 7, r0: 0.12, r1: 0.16, depth: 0.6, mat: 'primary', mat2: 'accent' },
    { seg: 'skirt', shape: 'ballcone', rows: 5, r0: 0.12, r1: 0.4, br: 0.048, len: 1.0 },
    ...bones(ARMS, 'stripes', { n: 5, r0: 0.055, r1: 0.045, mat: 'primary', mat2: 'accent' }), ...bones(LEGS, 'stripes', { n: 6, r0: 0.06, r1: 0.045, mat: 'primary', mat2: 'accent' }),
    ...joints(['leftWrist', 'rightWrist'], 0.05, 'mask'),
  ] },
  // the wire bell: a dark suit, a cage of wire rings around the head, a bell of hoops from the hips
  wire: { label: 'Wire bell', parts: [
    { seg: 'head', shape: 'sphere', r: 0.8, mat: 'ink' }, { seg: 'head', shape: 'cage', r: 1.9, mat: 'bone' },
    { seg: 'torso', shape: 'cyl', r0: 0.12, r1: 0.15, depth: 0.55, mat: 'ink' }, { seg: 'skirt', shape: 'hoops', n: 11, r0: 0.14, r1: 0.5, curve: 0.55, len: 1.1, wire: 0.008, mat: 'bone' },
    ...bones(ARMS, 'cyl', { r0: 0.04, r1: 0.03, mat: 'ink' }), ...bones(LEGS, 'cyl', { r0: 0.06, r1: 0.04, mat: 'ink' }), ...joints(['leftWrist', 'rightWrist'], 0.045, 'bone'),
  ] },
  // @/key
  // ---- costumes with fuller bodies, after the plate of Schlemmer's costumes: no more stick limbs --------------------------------
  // the lampshade: a round mask with big eyes, a shelf at the shoulders hung with fringe, fat ringed legs
  shade: { label: 'Lampshade', parts: [
    { seg: 'head', shape: 'sphere', r: 1.05, mat: 'mask' }, { seg: 'head', shape: 'sphere', r: 0.2, at: 0.58, fwd: 0.09, side: 0.04, mat: 'ink' }, { seg: 'head', shape: 'sphere', r: 0.2, at: 0.58, fwd: 0.09, side: -0.04, mat: 'ink' },
    { seg: 'torso', shape: 'lathe', profile: [[0, 0.1], [0.5, 0.12], [1, 0.13]], mat: 'ink', depth: 0.8 }, { seg: 'torso', shape: 'disc', r: 0.31, at: 0.96, thick: 0.03, mat: 'ink' },
    { seg: 'torso', shape: 'fringe', n: 36, r: 0.29, at: 0.95, len: 0.8, w: 0.011, offset: 1, depth: 0.8 },
    ...bones(['thighL', 'thighR'], 'lathe', { profile: PROFILES.balloon, stripes: { n: 9, colors: ['mask', 'ink'] } }), ...bones(['shinL', 'shinR'], 'lathe', { profile: PROFILES.calf.map(([t, r]) => [t, r * 1.45]), stripes: { n: 8, colors: ['mask', 'ink'] } }),
    ...bones(['upperArmL', 'upperArmR'], 'lathe', { profile: PROFILES.uparm, mat: 'ink' }), ...bones(['forearmL', 'forearmR'], 'lathe', { profile: PROFILES.forearm, mat: 'ink' }),
  ] },
  // the rainbow: puffed striped sleeves and trousers, a black cone for a body, a white inner tube at the hips and a white cone hat
  rainbow: { label: 'Rainbow', parts: [
    { seg: 'head', shape: 'sphere', r: 0.95, mat: 'mask' }, { seg: 'head', shape: 'cone', r: 0.1, at: 1, len: 1.5, shift: 0.75, mat: 'mask' },
    { seg: 'torso', shape: 'lathe', profile: PROFILES.waist, mat: 'ink', depth: 0.8 }, { seg: 'pelvis', shape: 'tube', r: 0.21, tube: 0.42, mat: 'mask' },
    ...bones(['upperArmL', 'upperArmR'], 'lathe', { profile: PROFILES.puff, stripes: { n: 9 } }), ...bones(['forearmL', 'forearmR'], 'lathe', { profile: PROFILES.puff.map(([t, r]) => [t, r * 0.8]), stripes: { n: 8, offset: 3 } }),
    ...bones(['thighL', 'thighR'], 'lathe', { profile: PROFILES.balloon, stripes: { n: 10 } }), ...bones(['shinL', 'shinR'], 'lathe', { profile: PROFILES.calf.map(([t, r]) => [t, r * 1.3]), stripes: { n: 9, offset: 2 } }),
    ...joints(['leftWrist', 'rightWrist'], 0.05, 'mask'),
  ] },
  // the target: a round board painted in rings of colour worn on the front; slim organic limbs around it
  target: { label: 'Target', parts: [
    { seg: 'head', shape: 'sphere', r: 1, mat: 'mask' }, { seg: 'head', shape: 'cyl', r0: 0.085, r1: 0.07, at: 1, len: 0.35, shift: 0.17, mat: 'primary' }, { seg: 'head', shape: 'sphere', r: 0.2, at: 1, shift: 0.38, mat: 'accent' },
    { seg: 'torso', shape: 'target', r: 0.64, rings: 8, at: 0.38 },
    ...bones(['upperArmL', 'upperArmR'], 'lathe', { profile: PROFILES.uparm, mat: 'ink' }), ...bones(['forearmL', 'forearmR'], 'lathe', { profile: PROFILES.forearm, mat: 'ink' }),
    ...bones(['thighL', 'thighR'], 'lathe', { profile: PROFILES.thigh, mat: 'ink' }), ...bones(['shinL', 'shinR'], 'lathe', { profile: PROFILES.calf, mat: 'ink' }),
    ...joints(['leftWrist', 'rightWrist'], 0.04, 'steel'),
  ] },
  // tilted rings: wide flat rings stacked from the hips, each leaning a different way, like a skirt caught in a spin
  rings: { label: 'Spin rings', parts: [
    { seg: 'head', shape: 'sphere', r: 0.9, mat: 'ink' }, { seg: 'head', shape: 'annuli', n: 2, r0: 0.17, r1: 0.2, inner: 0.5, tilt: 0.4, at: 0.85, mat: 'primary', mat2: 'mask' },
    { seg: 'torso', shape: 'lathe', profile: PROFILES.slim.map(([t, r]) => [t, r * 2.6]), mat: 'ink', depth: 0.7 },
    { seg: 'skirt', shape: 'annuli', n: 6, r0: 0.2, r1: 0.62, inner: 0.62, tilt: 0.34, twist: 1.15, len: 1.15, mat: 'primary', mat2: 'mask' },
    ...bones(['upperArmL', 'upperArmR'], 'lathe', { profile: PROFILES.uparm, mat: 'ink' }), ...bones(['forearmL', 'forearmR'], 'lathe', { profile: PROFILES.forearm, mat: 'ink' }),
    ...bones(['thighL', 'thighR'], 'lathe', { profile: PROFILES.thigh, mat: 'ink' }), ...bones(['shinL', 'shinR'], 'lathe', { profile: PROFILES.calf, mat: 'ink' }),
  ] },
  // harlequin: flat oval plates of colour on every limb and the chest, overlapping like cut paper
  harlequin: { label: 'Harlequin', parts: [
    { seg: 'head', shape: 'sphere', r: 1, mat: 'mask' }, { seg: 'head', shape: 'ellipsoid', rx: 0.11, ry: 0.05, rz: 0.1, at: 0.95, mat: 'm0' },
    { seg: 'torso', shape: 'ellipsoid', rx: 0.2, ryLen: 0.6, rz: 0.06, at: 0.5, mat: 'm2' }, { seg: 'torso', shape: 'ellipsoid', rx: 0.12, ryLen: 0.42, rz: 0.05, at: 0.42, side: 0.06, fwd: 0.06, mat: 'm1' },
    { seg: 'torso', shape: 'ellipsoid', rx: 0.08, ryLen: 0.3, rz: 0.05, at: 0.6, side: -0.1, fwd: 0.08, mat: 'm5' },
    ...['upperArmL', 'upperArmR'].map((seg, i) => ({ seg, shape: 'ellipsoid', rx: 0.07, ryLen: 0.66, rz: 0.02, mat: i ? 'm3' : 'm0' })), ...['forearmL', 'forearmR'].map((seg, i) => ({ seg, shape: 'ellipsoid', rx: 0.055, ryLen: 0.7, rz: 0.02, mat: i ? 'm4' : 'm1' })),
    ...['thighL', 'thighR'].map((seg, i) => ({ seg, shape: 'ellipsoid', rx: 0.1, ryLen: 0.62, rz: 0.035, mat: i ? 'm0' : 'm5' })), ...['shinL', 'shinR'].map((seg, i) => ({ seg, shape: 'ellipsoid', rx: 0.07, ryLen: 0.66, rz: 0.03, mat: i ? 'm2' : 'm3' })),
    ...joints(['leftWrist', 'rightWrist'], 0.045, 'mask'),
  ] },
  // silver tiers: stacked metal frustums like a lampshade for a body and baggy trousers
  tiers: { label: 'Silver tiers', parts: [
    { seg: 'head', shape: 'sphere', r: 0.85, mat: 'mask' }, { seg: 'head', shape: 'cyl', r0: 0.055, r1: 0.035, at: 1, len: 0.6, shift: 0.3, mat: 'steel' },
    { seg: 'torso', shape: 'cyl', r0: 0.18, r1: 0.14, at: 0.8, len: 0.38, depth: 0.85, mat: 'steel' }, { seg: 'torso', shape: 'disc', r: 0.19, at: 0.98, thick: 0.025, mat: 'steel' },
    { seg: 'torso', shape: 'cyl', r0: 0.34, r1: 0.19, at: 0.32, len: 0.55, depth: 0.85, mat: 'steel' }, { seg: 'torso', shape: 'disc', r: 0.44, at: 0.04, thick: 0.03, mat: 'steel' },
    ...bones(['thighL', 'thighR'], 'lathe', { profile: PROFILES.balloon.map(([t, r]) => [t, r * 1.05]), mat: 'primary' }), ...bones(['shinL', 'shinR'], 'lathe', { profile: PROFILES.calf.map(([t, r]) => [t, r * 1.5]), mat: 'primary' }),
    ...bones(['upperArmL', 'upperArmR'], 'lathe', { profile: PROFILES.uparm, mat: 'mask' }), ...bones(['forearmL', 'forearmR'], 'lathe', { profile: PROFILES.forearm, mat: 'mask' }),
  ] },
  // the big ball: a huge pale sphere for a skirt under a bowler hat; slim white organic legs, red shoes
  bigball: { label: 'Big ball', parts: [
    { seg: 'head', shape: 'sphere', r: 1, mat: 'mask' }, { seg: 'head', shape: 'cyl', r0: 0.085, r1: 0.075, at: 1, len: 0.55, shift: 0.27, mat: 'ink' }, { seg: 'head', shape: 'disc', r: 0.14, at: 0.98, thick: 0.015, mat: 'ink' },
    { seg: 'torso', shape: 'sphere', r: 0.34, at: 0.04, mat: 'mask' },
    ...bones(['upperArmL', 'upperArmR'], 'lathe', { profile: PROFILES.puff.map(([t, r]) => [t, r * 0.75]), mat: 'mask' }), ...bones(['forearmL', 'forearmR'], 'lathe', { profile: PROFILES.forearm, mat: 'mask' }),
    ...bones(['thighL', 'thighR'], 'lathe', { profile: PROFILES.thigh.map(([t, r]) => [t, r * 0.7]), mat: 'mask' }), ...bones(['shinL', 'shinR'], 'lathe', { profile: PROFILES.calf, mat: 'mask' }),
    ...bones(['footL', 'footR'], 'cone', { r: 0.045, len: 1.4, mat: 'm0' }),
  ] },
  // pear and bulb: nothing but swelling curves, to show what the profile does
  organic: { label: 'Pear and bulb', parts: [
    { seg: 'head', shape: 'sphere', r: 1.2, mat: 'mask' }, { seg: 'torso', shape: 'lathe', profile: PROFILES.pear, mat: 'primary', depth: 0.85 },
    ...bones(['upperArmL', 'upperArmR'], 'lathe', { profile: PROFILES.puff, mat: 'accent' }), ...bones(['forearmL', 'forearmR'], 'lathe', { profile: PROFILES.forearm.map(([t, r]) => [t, r * 1.2]), mat: 'primary' }),
    ...bones(['thighL', 'thighR'], 'lathe', { profile: PROFILES.balloon, mat: 'accent' }), ...bones(['shinL', 'shinR'], 'lathe', { profile: PROFILES.calf.map(([t, r]) => [t, r * 1.4]), mat: 'primary' }),
    ...joints(['leftWrist', 'rightWrist', 'leftAnkle', 'rightAnkle'], 0.05, 'mask'),
  ] },
  figure: { label: 'Figurine', parts: [
    { seg: 'head', shape: 'sphere', r: 1, mat: 'mask' }, { seg: 'torso', shape: 'cyl', r0: 0.1, r1: 0.14, depth: 0.5, mat: 'primary' },
    ...bones(['upperArmL', 'upperArmR', 'forearmL', 'forearmR', 'thighL', 'thighR', 'shinL', 'shinR'], 'cyl', { r0: 0.022, r1: 0.022, mat: 'accent' }), ...joints(['leftShoulder', 'rightShoulder', 'leftElbow', 'rightElbow', 'leftWrist', 'rightWrist', 'leftHip', 'rightHip', 'leftKnee', 'rightKnee', 'leftAnkle', 'rightAnkle'], 0.04, 'primary'),
  ] },
};

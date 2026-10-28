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
const WIRE = 0.007;   // default thickness of wire hoops, in metres
const BAUHAUS = ['warm', 'blue', 'sun', 'green', 'orange', 'violet'];   // the ball pyramid's colours

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

export const PALETTES = {   // the Triadic Ballet's three moods: cheerful yellow, festive pink, serious black
  yellow: { primary: 0xf2c230, accent: 0x1c1b1a, mask: 0xf4efe4 }, pink: { primary: 0xf08ab0, accent: 0xfaf4ec, mask: 0xf4efe4 }, black: { primary: 0x1a1a1c, accent: 0xe9e4d8, mask: 0xf4efe4 },
};
// materials that do not change with the palette: gold, ink and the Bauhaus colours
const FIXED = { ink: [0x17171a, 0.5, 0.1], gold: [0xd9a93a, 0.25, 0.85], bone: [0xe8e4d6, 0.4, 0.2], warm: [0xd9483b, 0.5, 0], sun: [0xf0b429, 0.5, 0], sky: [0x6fb7c4, 0.45, 0.1], blue: [0x2f5fb4, 0.5, 0], green: [0x4d9a58, 0.5, 0], orange: [0xe8873a, 0.5, 0], violet: [0x8a5fb0, 0.5, 0] };

export class Costume extends THREE.Group {
  constructor(parts) {
    super(); this.name = 'costume';
    const std = (rough, metal, o = {}) => new THREE.MeshStandardMaterial({ roughness: rough, metalness: metal, side: THREE.DoubleSide, ...o });
    this.mats = { primary: std(0.5, 0.05), accent: std(0.3, 0.6), mask: std(0.4, 0.0), fan: std(0.65, 0, { flatShading: true }) };   // these follow the palette
    for (const [k, [c, r, m]] of Object.entries(FIXED)) this.mats[k] = std(r, m, { color: c });
    this.wireMat = new THREE.LineBasicMaterial({ color: 0xffffff });
    const mat = n => this.mats[n] ?? this.mats.primary;
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
        case 'stripes': for (let i = 0; i < (p.n ?? 6); i++) mesh(unitCyl, i % 2 ? (p.mat2 ?? 'accent') : (p.mat ?? 'primary'), g, k); break;
        case 'rods': { const im = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 5), mat(p.mat ?? 'accent'), p.n ?? 24); im.castShadow = true; im.frustumCulled = false; g.add(im); k.push(im); break; }
        case 'ballcone': {   // rows of balls, each row wider than the last: a cone built of spheres, in Bauhaus colours
          const rows = p.rows ?? 5, counts = Array.from({ length: rows }, (_, r) => { const R = p.r0 + (p.r1 - p.r0) * (r / (rows - 1)); return Math.max(5, Math.round(2 * Math.PI * R / (p.br * 2.15))); });
          const im = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.05 }), counts.reduce((a, b) => a + b, 0));
          im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(im.count * 3), 3); im.castShadow = true; im.frustumCulled = false;
          let n = 0; counts.forEach((c, r) => { for (let i = 0; i < c; i++) im.setColorAt(n++, new THREE.Color(FIXED[BAUHAUS[(r * 2 + i) % BAUHAUS.length]][0])); });
          part.counts = counts; g.add(im); k.push(im); break;
        }
        case 'cage': { const R = [[0, 0, 0], [Math.PI / 2, 0, 0], [0, 0, Math.PI / 2], [Math.PI / 4, 0, Math.PI / 4], [-Math.PI / 4, 0, Math.PI / 4]]; for (const e of R) mesh(new THREE.TorusGeometry(1, 0.03, 6, 48).rotateX(e[0]).rotateZ(e[2]), p.mat ?? 'bone', g, k); break; }
        default: mesh(makeShape(p), p.mat ?? 'primary', g, k);
      }
      this.add(g); return part;
    });
    this.setPalette('yellow'); this.volume = 1; this.show = { head: true, torso: true, arms: true, legs: true };
  }
  setPalette(name) { const p = PALETTES[name]; for (const k of ['primary', 'accent', 'mask']) this.mats[k].color.setHex(p[k]); this.mats.fan.color.setHex(p.primary); this.wireMat.color.setHex(name === 'yellow' ? 0x1c1b1a : p.accent); }
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
      g.matrix.identity(); g.matrixWorldNeedsUpdate = true;
      const place = (mesh, m) => { mesh.matrix.copy(m); mesh.matrixWorldNeedsUpdate = true; };
      switch (p.shape) {
        case 'sphere': { const R = p.seg === 'head' ? s.headR * p.r : p.r * sc; g.matrix.copy(basis(M, R, R, R)).setPosition(c); break; }
        case 'ellipsoid': g.matrix.copy(basis(M, (p.rx ?? p.r) * sc, p.ryLen ? p.ryLen * s.len : (p.ry ?? p.r) * sc, (p.rz ?? p.rx ?? p.r) * sc)).setPosition(c); break;
        case 'bowl': { const R = p.seg === 'head' ? s.headR * p.r : rad; g.matrix.copy(basis(M, R, R * (p.h ?? 0.35), R)).setPosition(c); break; }
        case 'cyl': case 'cone': case 'spiral': { const w = Math.max(p.r0 ?? p.r, p.r1 ?? p.r) * sc; g.matrix.copy(basis(M, w, s.len * lenMul, w * depth)).setPosition(c); break; }
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
  figure: { label: 'Figurine', parts: [
    { seg: 'head', shape: 'sphere', r: 1, mat: 'mask' }, { seg: 'torso', shape: 'cyl', r0: 0.1, r1: 0.14, depth: 0.5, mat: 'primary' },
    ...bones(['upperArmL', 'upperArmR', 'forearmL', 'forearmR', 'thighL', 'thighR', 'shinL', 'shinR'], 'cyl', { r0: 0.022, r1: 0.022, mat: 'accent' }), ...joints(['leftShoulder', 'rightShoulder', 'leftElbow', 'rightElbow', 'leftWrist', 'rightWrist', 'leftHip', 'rightHip', 'leftKnee', 'rightKnee', 'leftAnkle', 'rightAnkle'], 0.04, 'primary'),
  ] },
};

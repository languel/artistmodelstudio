// Lesson 08: one continuous line, after Picasso. Video -> face and pose landmarks -> filtered -> strokes -> ONE path (lib/oneline.js)
// -> a pen ribbon in 3D. The line is rebuilt every frame from the body, so it draws you as you move.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createTracker } from './lib/tracker.js';
import { Body } from './lib/body.js';
import { OneEuro } from './lib/motion.js';
import { FACE, unicursal, copies, pen } from './lib/oneline.js';
import { bindSources } from './lib/sources.js';

const $ = id => document.getElementById(id), num = id => +$(id).value, status = t => $('status').textContent = t;
const stage = $('stage'), video = $('video');

// ---- the paper: the picture's rectangle in scene units (the image is 2 high), seen from the front ---------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setPixelRatio(devicePixelRatio); stage.prepend(renderer.domElement);
const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(35, 1, 0.05, 50); camera.position.set(0, 0, 5);
const orbit = new OrbitControls(camera, renderer.domElement);
const paper = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xf1ead9 })); paper.position.z = -0.3; scene.add(paper);
const screen = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide })); screen.position.z = -0.25; screen.visible = false; scene.add(screen);
const resize = () => { const w = stage.clientWidth, h = stage.clientHeight; renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); fit(); };
let aspect = 4 / 3;
function fit() { const h = 2.2, w = h * aspect, ca = camera.aspect, dist = Math.max(h / 2 / Math.tan(camera.fov * Math.PI / 360), w / 2 / Math.tan(camera.fov * Math.PI / 360) / ca); if (!fit.done) { camera.position.set(0, 0, dist * 1.05); orbit.target.set(0, 0, 0); fit.done = true; } paper.scale.set(w * 3, h * 3, 1); }
new ResizeObserver(resize).observe(stage); resize();

// ---- the pen ribbon: a strip of triangles that always faces the camera, with a width at every point ------------------------------------
// @key A line with a width | Browsers draw 1-pixel lines, so the pen is a ribbon: at each point two vertices either side of the line, along (tangent x direction to the camera), half a width away. It is rebuilt every frame, so it faces you as you orbit.
class Ribbon {
  constructor(material, max = 9000) {
    this.max = max; this.geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 2 * 3); this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    const idx = new Uint32Array((max - 1) * 6); for (let i = 0; i < max - 1; i++) idx.set([2 * i, 2 * i + 1, 2 * i + 2, 2 * i + 1, 2 * i + 3, 2 * i + 2], i * 6); this.geo.setIndex(new THREE.BufferAttribute(idx, 1));
    this.mesh = new THREE.Mesh(this.geo, material); this.mesh.frustumCulled = false; this.mesh.renderOrder = 2;
  }
  set(points, widths, count = points.length, eye = null, mul = 1) {
    const n = Math.min(count, this.max), a = new THREE.Vector3(), t = new THREE.Vector3(), v = new THREE.Vector3(), s = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const p = points[i], q = points[Math.min(n - 1, i + 1)], o = points[Math.max(0, i - 1)];
      t.set(q.x - o.x, q.y - o.y, q.z - o.z); if (t.lengthSq() < 1e-12) t.set(1, 0, 0);
      v.set(0, 0, 1); if (eye) v.set(eye.x - p.x, eye.y - p.y, eye.z - p.z); s.crossVectors(t, v).normalize().multiplyScalar(widths[i] * mul / 2);
      a.set(p.x, p.y, p.z); this.pos.set([a.x + s.x, a.y + s.y, a.z + s.z, a.x - s.x, a.y - s.y, a.z - s.z], i * 6);
    }
    this.geo.setDrawRange(0, Math.max(0, (n - 1) * 6)); this.geo.attributes.position.needsUpdate = true;
  }
}
// @/key
const inkMat = new THREE.MeshBasicMaterial({ color: 0x161513, side: THREE.DoubleSide }), glowMat = new THREE.MeshBasicMaterial({ color: 0x6dffc0, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
const live = new Ribbon(inkMat), halo = new Ribbon(glowMat); scene.add(live.mesh, halo.mesh);
const penTip = new THREE.Mesh(new THREE.SphereGeometry(0.02, 12, 8), new THREE.MeshBasicMaterial({ color: 0xd9392c })); penTip.visible = false; scene.add(penTip);
const kept = [];
const LOOKS = { ink: { paper: 0xf1ead9, ink: 0x161513, halo: false }, blue: { paper: 0x1b3a6b, ink: 0xe9f1ff, halo: false }, neon: { paper: 0x07080b, ink: 0xc8ffe6, halo: true } };
function setLook() { const l = LOOKS[$('look').value]; paper.material.color.setHex(l.paper); inkMat.color.setHex(l.ink); glowMat.color.setHex(l.ink); glowMat.color.multiplyScalar(0.6); halo.mesh.visible = l.halo; kept.forEach(k => k.mesh.material.color.setHex(l.ink)); }
$('look').onchange = setLook; setLook();

// ---- landmarks, steadied ----------------------------------------------------------------------------------------------------------------
const body = new Body(); body.height = 2;
// @key Steady the points first | The tracker's points jitter, and a jittery point makes a jittery line. Every landmark gets its own One Euro filter (the same as lesson 07): still points are held firmly, moving ones follow with little lag.
class PointFilter {
  constructor() { this.f = []; }
  update(pts, dt, minCut, beta) { return pts.map((p, i) => { const e = (this.f[i] ??= new OneEuro()), v = e.filter(p, dt, minCut, beta); return { x: v[0], y: v[1], z: v[2] }; }); }
  reset() { this.f = []; }
}
// @/key
const poseF = new PointFilter(), faceF = new PointFilter();
let facePts = null, facePtsT = -Infinity, posePts = null, poseVis = null, lastT = null;
function ingest(frame, t) {
  const dt = lastT == null ? 1 / 30 : Math.min(0.2, Math.max(1e-3, t - lastT)); lastT = t;
  const minCut = 8 - 7.7 * num('noise') ** 0.8, beta = 0.02 + 0.6 * (1 - num('noise') * 0.5), v = new THREE.Vector3();
  const map = l => { body.toScene(l, v); return { x: v.x, y: v.y, z: v.z }; };
  if (frame.pose) { posePts = poseF.update(frame.pose.map(map), dt, minCut, beta); poseVis = frame.pose.map(l => l[3]); } else posePts = null;
  if (frame.face) { facePts = faceF.update(frame.face.map(map), dt, minCut, beta); facePtsT = t; } else if (t - facePtsT > 0.5) facePts = null;     // a face lost for a moment is held, then dropped
}

// ---- controls --------------------------------------------------------------------------------------------------------------------------------
const PARTS = { face: ['oval', 'brows', 'eyes', 'nose', 'mouth'], figure: ['torso', 'arms', 'legs', 'head'] }, on = {};
for (const [grp, list] of Object.entries(PARTS)) for (const k of list) { on[k] = true; const l = document.createElement('label'); l.className = 'chk'; l.title = grp; const c = Object.assign(document.createElement('input'), { type: 'checkbox', checked: true, onchange: () => on[k] = c.checked }); l.append(c, k); $('parts').append(l); }
const fmt = { curl: 2, tension: 2, copies: 0, scale: 2, shift: 2, turn: 2, width: 3, wobble: 4, pressure: 2, taper: 2, noise: 2, dur: 1 };
for (const [id, d] of Object.entries(fmt)) { $(id).oninput = () => $(id + 'o').textContent = num(id).toFixed(d); $(id).oninput(); }

// @key Strokes: runs of landmarks | A stroke is a list of points and whether it closes. Face strokes come from the mesh index lists in lib/oneline.js; figure strokes are chains of pose joints, used only when the tracker can see all of them.
function strokes(subject) {
  const out = [], P = (pts, idx) => idx.map(i => pts[i]);
  if ((subject === 'face' || subject === 'both') && facePts) {
    const add = (k, f) => { if (on[k]) out.push({ pts: P(facePts, f.idx), closed: f.closed }); };
    add('oval', FACE.oval); add('eyes', FACE.eyeL); add('eyes', FACE.eyeR); add('brows', FACE.browL); add('brows', FACE.browR); add('nose', FACE.nose); add('mouth', FACE.lips);
  }
  if ((subject === 'figure' || subject === 'both') && posePts) {
    const seen = idx => idx.every(i => poseVis[i] > 0.5), add = (k, idx, closed = false) => { if (on[k] && seen(idx)) out.push({ pts: P(posePts, idx), closed }); };
    add('torso', [11, 12, 24, 23], true); add('arms', [11, 13, 15, 19]); add('arms', [12, 14, 16, 20]); add('legs', [23, 25, 27, 31]); add('legs', [24, 26, 28, 32]); add('head', [7, 0, 8]);
  }
  return out;
}
// @/key

// ---- sources -------------------------------------------------------------------------------------------------------------------------------------
let tracker = null, running = false, t0 = 0, lastVT = -1, progress = 0, hold = 0, frames = 0, fps = 0, fpsT = performance.now();
async function load() { if (tracker) return; status('loading the pose and face models…'); tracker = await createTracker({ pose: true, hands: false, face: true }); }
bindSources({ video, camBtn: $('cam'), clipSel: $('clip'), load, status, onStart(mirror, name) {
  body.mirror = mirror; body.aspect = video.videoWidth / video.videoHeight || 4 / 3; aspect = body.aspect; fit.done = false; fit(); running = true; t0 = performance.now(); poseF.reset(); faceF.reset(); facePts = posePts = null; lastT = null;
  screen.scale.set(2 * aspect * (mirror ? -1 : 1), 2, 1); screen.material.map?.dispose(); const tex = new THREE.VideoTexture(video); tex.colorSpace = THREE.SRGBColorSpace; screen.material.map = tex; screen.material.needsUpdate = true; status(name);
} });
$('picture').onchange = () => screen.visible = $('picture').checked && !!screen.material.map; $('pic').oninput = () => screen.material.opacity = num('pic');
$('keep').onclick = () => { if (!lastDrawn) return; const r = new Ribbon(new THREE.MeshBasicMaterial({ color: inkMat.color.getHex(), transparent: true, opacity: 0.55, side: THREE.DoubleSide })); r.set(lastDrawn.pos, lastDrawn.w); r.mesh.position.z = -0.01 * (kept.length + 1); kept.push(r); scene.add(r.mesh); };
$('clear').onclick = () => { kept.splice(0).forEach(k => { scene.remove(k.mesh); k.geo.dispose(); }); };

// ---- each frame -------------------------------------------------------------------------------------------------------------------------------------
let lastDrawn = null, readT = 0;
renderer.setAnimationLoop(now => {
  if (running && video.readyState >= 2) {
    const vt = video.srcObject ? (now - t0) / 1000 : video.currentTime;
    if (video.srcObject || vt !== lastVT) { lastVT = vt; ingest(tracker.detect(video, vt), now / 1000); frames++; }
  }
  const subject = $('subject').value, S = strokes(subject);
  if (S.length) {
    // @key Build the one line | Strokes in, one path out: ordered, joined by smooth connectors, optionally repeated as scaled copies, then run through the pen.
    const step = 0.012, { points, joins } = unicursal(S, { order: $('order').value, step, tension: num('tension'), curl: num('curl') });
    const path = copies(points, num('copies'), { scale: num('scale'), dx: num('shift'), dy: num('shift') * 0.3, turn: num('turn'), step, tension: num('tension'), curl: num('curl') });
    const p = pen(path, { time: now / 1000, wobble: num('wobble'), width: num('width'), pressure: num('pressure'), taper: num('taper'), freq: 6 });
    // @/key
    // the pen drawing it on: only the first part of the line is shown, growing, then it rests and starts again
    let n = path.length;
    if ($('draw').value === 'pen') { progress += 1 / 60 / num('dur'); if (progress >= 1) { hold += 1 / 60; if (hold > 1.2) { progress = 0; hold = 0; } } n = Math.max(2, Math.floor(Math.min(1, progress) * path.length)); } else progress = 0;
    live.set(p.pos, p.w, n, camera.position); halo.set(p.pos, p.w, n, camera.position, 3.5);
    penTip.visible = $('draw').value === 'pen'; if (penTip.visible) penTip.position.set(p.pos[n - 1].x, p.pos[n - 1].y, p.pos[n - 1].z);
    lastDrawn = p;
    if ($('frame').checked) {   // fit the camera to the drawing: its bounding box, eased, keeping the viewing direction you chose
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; for (const q of p.pos) { if (q.x < x0) x0 = q.x; if (q.x > x1) x1 = q.x; if (q.y < y0) y0 = q.y; if (q.y > y1) y1 = q.y; }
      const c = new THREE.Vector3((x0 + x1) / 2, (y0 + y1) / 2, 0), tf = Math.tan(camera.fov * Math.PI / 360), need = Math.max((y1 - y0) / 2 * 1.3 / tf, (x1 - x0) / 2 * 1.3 / (tf * camera.aspect), 0.8);
      const dir = camera.position.clone().sub(orbit.target).normalize(), dist = camera.position.distanceTo(orbit.target);
      orbit.target.lerp(c, 0.08); camera.position.copy(orbit.target).addScaledVector(dir, dist + (need - dist) * 0.08);
    }
    if (now - readT > 250) { readT = now; $('read').textContent = `${S.length} strokes · ${joins.length * num('copies')} joins\n${path.length} points · line ${(p.total * 50).toFixed(0)} cm if the picture were 1 m high`; }
  } else { live.set([], [], 0); halo.set([], [], 0); penTip.visible = false; $('read').textContent = running ? (subject === 'figure' ? 'no body found' : 'no face found: come closer, or try the figure') : 'choose a source'; }
  orbit.update(); renderer.render(scene, camera);
  if (now - fpsT > 1000) { fps = frames; frames = 0; fpsT = now; }
  $('hud').textContent = running ? `${fps} frames/s` : 'choose a source';
});
globalThis.__lesson = { scene, kept };   // for debugging in the console

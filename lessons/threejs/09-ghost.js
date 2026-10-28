// Lesson 09: paint marks in space. Pose -> Body -> cleaned stage joints (lesson 07) -> Painter (strokes from moving points, lib/paint.js)
// -> one big ribbon mesh that faces the camera. The strokes stay where they were made, so you can pause and orbit them.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createTracker } from './lib/tracker.js';
import { Body, Playback, J } from './lib/body.js';
import { BodyView } from './lib/bodyview.js';
import { createClean } from './lib/cleanbody.js';
import { PRESETS } from './lib/motion.js';
import { Painter, alpha, toOBJ } from './lib/paint.js';
import { noise1 } from './lib/oneline.js';
import { bindSources } from './lib/sources.js';

const $ = id => document.getElementById(id), num = id => +$(id).value, status = t => $('status').textContent = t;
const stage = $('stage'), video = $('video');

// ---- the room ------------------------------------------------------------------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setPixelRatio(devicePixelRatio); stage.prepend(renderer.domElement);
const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(45, 1, 0.05, 80); camera.position.set(3.2, 1.0, 7.5);
const orbit = new OrbitControls(camera, renderer.domElement); orbit.target.set(0, 0.1, 0);
let grid = new THREE.GridHelper(14, 28, 0x888888, 0xcccccc); scene.add(grid);
const resize = () => { const w = stage.clientWidth, h = stage.clientHeight; renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); };
new ResizeObserver(resize).observe(stage); resize();
const LOOKS = {
  ink: { bg: 0xf4f1ea, grid: [0xb5b0a4, 0xd2cec4], light: 0.28, sat: 0.75, blend: THREE.NormalBlending, mono: 0x1a1a1a },
  chalk: { bg: 0x0c0d10, grid: [0x40434c, 0x23252b], light: 0.78, sat: 0.7, blend: THREE.NormalBlending, mono: 0xf2efe6 },
  neon: { bg: 0x05060a, grid: [0x2a2f45, 0x14172a], light: 0.6, sat: 1, blend: THREE.AdditiveBlending, mono: 0x7dffd2 },
};
let look = LOOKS.ink;
function setLook() {
  look = LOOKS[$('look').value]; scene.background = new THREE.Color(look.bg); brushMat.blending = look.blend; brushMat.needsUpdate = true;
  const y = grid.position.y, vis = grid.visible; scene.remove(grid); grid.geometry.dispose(); grid.material.dispose(); grid = new THREE.GridHelper(14, 28, look.grid[0], look.grid[1]); grid.position.y = y; grid.visible = vis; scene.add(grid);
}

// ---- the body, cleaned ------------------------------------------------------------------------------------------------------------------
const body = new Body(), clean = createClean(body);
const figure = new BodyView(clean.view); figure.show({ face: false, hands: false, heat: false }); figure.joints.material = new THREE.MeshBasicMaterial({ color: 0x888888, transparent: true, opacity: 0.55 }); figure.bones.material = new THREE.LineBasicMaterial({ color: 0x888888, transparent: true, opacity: 0.5 }); scene.add(figure);
const setPreset = n => { clean.preset(n); $('inertia').value = clean.params.inertia; $('inertiao').textContent = (+clean.params.inertia).toFixed(2); };
$('mpreset').onchange = () => setPreset($('mpreset').value); setPreset('dreamy');   // painting does not mind lag, and rounder strokes look better
$('inertia').oninput = () => { clean.params.inertia = num('inertia'); $('inertiao').textContent = num('inertia').toFixed(2); };
for (const id of ['travel', 'travelZ']) { $(id).value = clean.params[id]; $(id).oninput = () => { clean.params[id] = num(id); $(id + 'o').textContent = num(id).toFixed(2); }; $(id + 'o').textContent = (+clean.params[id]).toFixed(2); }
$('recentre').onclick = () => clean.recentre();

// ---- which points paint ------------------------------------------------------------------------------------------------------------------
// @key Marks are points on the body | A mark is a joint (or the middle of two). Hands paint from the index fingertip. Each has a colour for the "by joint" mode; the Painter follows them by name.
const MARKS = {
  'right hand': { j: [J.rightIndex], hue: 0.02 }, 'left hand': { j: [J.leftIndex], hue: 0.08 }, 'head': { j: [J.nose], hue: 0.13 },
  'right foot': { j: [J.rightFootIndex], hue: 0.55 }, 'left foot': { j: [J.leftFootIndex], hue: 0.62 },
  'right elbow': { j: [J.rightElbow], hue: 0.78 }, 'left elbow': { j: [J.leftElbow], hue: 0.85 }, 'right knee': { j: [J.rightKnee], hue: 0.33 }, 'left knee': { j: [J.leftKnee], hue: 0.4 },
  'hips': { j: [J.leftHip, J.rightHip], hue: 0.95 }, 'shoulders': { j: [J.leftShoulder, J.rightShoulder], hue: 0.7 },
};
// @/key
const on = Object.fromEntries(Object.keys(MARKS).map(k => [k, ['right hand', 'left hand', 'head', 'right foot', 'left foot'].includes(k)]));
for (const [k, m] of Object.entries(MARKS)) { const l = document.createElement('label'); l.className = 'chk'; const c = Object.assign(document.createElement('input'), { type: 'checkbox', checked: on[k], onchange: () => on[k] = c.checked }); l.append(c, Object.assign(document.createElement('i'), { style: `background:hsl(${m.hue * 360},80%,55%)` }), k); $('marks').append(l); }
const show = { figure: true, floor: true, follow: false, picture: false };
for (const k of Object.keys(show)) { const l = document.createElement('label'); l.className = 'chk'; const c = Object.assign(document.createElement('input'), { type: 'checkbox', checked: show[k], onchange: () => show[k] = c.checked }); l.append(c, k); $('layers').append(l); }
const fmt = { width: 3, swidth: 2, dry: 2, fade: 0, step: 3, lift: 2 };
const painter = new Painter();
for (const [id, d] of Object.entries(fmt)) { $(id).oninput = () => { $(id + 'o').textContent = num(id).toFixed(d); if (id === 'step') painter.minStep = num('step'); if (id === 'lift') painter.liftTime = num('lift'); }; $(id).oninput(); }

// ---- the brush: every stroke as a ribbon facing the camera, in one mesh -----------------------------------------------------------------------
const MAXV = 24000 * 2 + 4000, pos = new Float32Array(MAXV * 3), col = new Float32Array(MAXV * 4), idx = new Uint32Array(MAXV * 3);
const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage)); geo.setAttribute('color', new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage)); geo.setIndex(new THREE.BufferAttribute(idx, 1).setUsage(THREE.DynamicDrawUsage));
const brushMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide });
const brush = new THREE.Mesh(geo, brushMat); brush.frustumCulled = false; scene.add(brush);
const tmp = new THREE.Color();
// @key Strokes to ribbons | For every sample: a width (from its speed and the ends tapering), a colour and a see-through amount (from its age), and two vertices either side of the line, along (direction of travel x direction to the camera). All strokes go into one mesh.
function buildBrush(now) {
  const W = num('width'), sw = num('swidth'), dry = num('dry'), fade = num('fade'), mode = $('colour').value, c = camera.position;
  let v = 0, ni = 0;
  for (const s of painter.strokes) {
    const pts = s.pts, n = pts.length; if (n < 2 || v + n * 2 > MAXV - 2) continue;
    const hue = MARKS[s.mark]?.hue ?? 0.1; let arc = 0;
    for (let i = 0; i < n; i++) {
      const p = pts[i], a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
      let tx = b.x - a.x, ty = b.y - a.y, tz = b.z - a.z; const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
      if (i) arc += Math.hypot(p.x - a.x, p.y - a.y, p.z - a.z);
      const vx = c.x - p.x, vy = c.y - p.y, vz = c.z - p.z;
      let sx = ty * vz - tz * vy, sy = tz * vx - tx * vz, sz = tx * vy - ty * vx; const sl = Math.hypot(sx, sy, sz) || 1;
      const sp = Math.min(1, p.s / 2.5), k = Math.min(1, i / 6, (n - 1 - i) / 6), w = W * Math.max(0.2, 1 + sw * (0.5 - sp) * 2) * (0.25 + 0.75 * Math.sqrt(k)) / 2;
      sx *= w / sl; sy *= w / sl; sz *= w / sl;
      pos.set([p.x + sx, p.y + sy, p.z + sz, p.x - sx, p.y - sy, p.z - sz], (v + 2 * i) * 3);
      const h = mode === 'joint' ? hue : mode === 'speed' ? 0.62 - 0.62 * sp : mode === 'time' ? (p.t * 0.02) % 1 : 0;
      if (mode === 'mono') tmp.setHex(look.mono); else tmp.setHSL(h, look.sat, look.light);
      const al = alpha(now - p.t, fade) * (1 - dry * 0.7 * (0.5 + 0.5 * noise1(arc * 18 + p.t))) * (k < 1 ? 0.4 + 0.6 * k : 1);
      col.set([tmp.r, tmp.g, tmp.b, al, tmp.r, tmp.g, tmp.b, al], (v + 2 * i) * 4);
    }
    for (let i = 0; i < n - 1; i++) { const q = v + 2 * i; idx.set([q, q + 1, q + 2, q + 1, q + 3, q + 2], ni); ni += 6; }
    v += 2 * n;
  }
  geo.setDrawRange(0, ni); for (const a of ['position', 'color']) geo.attributes[a].needsUpdate = true; geo.index.needsUpdate = true;
}
// @/key
$('look').onchange = setLook; setLook();

// ---- sources ----------------------------------------------------------------------------------------------------------------------------------
const screen = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide })); screen.visible = false; scene.add(screen);
let tracker = null, liveSrc = false, playback = null, t0 = 0, lastVT = -1, frames = 0, fps = 0, fpsT = performance.now(), paused = false;
async function load() { if (tracker) return; status('loading the pose model…'); tracker = await createTracker({ pose: true, hands: false, face: false }); }
bindSources({ video, camBtn: $('cam'), clipSel: $('clip'), load, status, onStart(mirror, name) {
  clean.reset(); body.mirror = mirror; body.reset(); body.aspect = video.videoWidth / video.videoHeight || 4 / 3; liveSrc = true; playback = null; t0 = performance.now(); painter.clear(); status(name);
  screen.material.map?.dispose(); const tex = new THREE.VideoTexture(video); tex.colorSpace = THREE.SRGBColorSpace; screen.material.map = tex; screen.material.needsUpdate = true;
} });
$('rec').add(new Option('recorded…', ''));
fetch('data/index.json').then(r => r.json()).then(l => l.forEach(n => $('rec').add(new Option(n.replace('.pose.json', ''), n)))).catch(() => {});
$('rec').onchange = async () => {
  if (!$('rec').value) return; const data = await (await fetch('data/' + $('rec').value)).json();
  video.pause(); liveSrc = false; playback = new Playback(data); t0 = performance.now(); body.mirror = !!data.mirror; body.aspect = data.aspect ?? 4 / 3; body.reset(); clean.reset(); painter.clear(); screen.material.map = null; screen.material.needsUpdate = true; status(`recorded: ${playback.frames.length} frames`);
};
$('freeze').onclick = () => { paused = !paused; $('freeze').textContent = paused ? 'resume painting' : 'pause painting'; };
$('clear').onclick = () => painter.clear();
$('export').onclick = () => { const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([toOBJ(painter.strokes)], { type: 'text/plain' })), download: 'paint-marks.obj' }); a.click(); };

// ---- each frame -----------------------------------------------------------------------------------------------------------------------------------
let readT = 0, lastFloor = -0.95;
renderer.setAnimationLoop(now => {
  let fresh = false;
  if (liveSrc && video.readyState >= 2) {
    const vt = video.srcObject ? (now - t0) / 1000 : video.currentTime;
    if (video.srcObject || vt !== lastVT) { lastVT = vt; body.update(tracker.detect(video, vt)); frames++; fresh = true; }
  } else if (playback) { body.update(playback.at((now - t0) / 1000)); frames++; fresh = true; }
  const c = clean.update(body, now, fresh), live = !!c && body.present;
  figure.visible = live && show.figure; grid.visible = show.floor;
  if (live) {
    // @key Marks to the Painter | Each chosen mark's cleaned position (stage metres) is offered to the Painter once per new pose; a mark the tracker cannot see is offered as nothing, which lifts the pen.
    if (fresh && !paused) {
      const t = now / 1000;
      for (const [name, m] of Object.entries(MARKS)) {
        const ok = on[name] && m.j.every(j => c.vis[j]), p = ok ? m.j.reduce((a, j) => ({ x: a.x + clean.w[j].x / m.j.length, y: a.y + clean.w[j].y / m.j.length, z: a.z + clean.w[j].z / m.j.length }), { x: 0, y: 0, z: 0 }) : null;
        const before = painter.strokes.length; painter.update(name, p, t); if (painter.strokes.length > before) painter.strokes.at(-1).mark = name;
      }
    }
    // @/key
    if (show.figure) figure.update('world');
    if (c.floorY != null) { lastFloor += ((c.floorY - 0.07) - lastFloor) * 0.1; grid.position.y = lastFloor; }
    if (show.follow) orbit.target.lerp(new THREE.Vector3(c.root.x, c.root.y, c.root.z), 0.05);
    // the source picture, kept under the figure: same alignment as lesson 07
    screen.visible = show.picture && liveSrc && !!screen.material.map;
    if (screen.visible) { const P = body.p, hip = new THREE.Vector3().addVectors(P[23], P[24]).multiplyScalar(0.5), img = Math.hypot(P[11].x - P[12].x, P[11].y - P[12].y), real = body.w[11].distanceTo(body.w[12]);
      if (img > 1e-3) { const k = real / img; screen.scale.set(2 * body.aspect * k * (body.mirror ? -1 : 1), 2 * k, 1); screen.position.set(-hip.x * k + c.root.x, -hip.y * k + c.root.y, -0.8 + c.root.z); } }
  } else screen.visible = false;
  buildBrush(now / 1000);
  orbit.update(); renderer.render(scene, camera);
  if (now - readT > 300) { readT = now; $('read').textContent = `${painter.strokes.length} strokes · ${painter.count} samples${paused ? ' · painting paused' : ''}${!live && (liveSrc || playback) ? '\nno body found' : ''}`; }
  if (now - fpsT > 1000) { fps = frames; frames = 0; fpsT = now; }
  $('hud').textContent = liveSrc || playback ? `${fps} body frames/s` : 'choose a source';
});
globalThis.__lesson = { scene, painter, clean };

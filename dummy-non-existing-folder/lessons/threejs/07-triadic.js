// Lesson 07: geometric costumes on a moving body. Source -> pose -> Body (metres, hips at the origin) -> Costume (parts hung on
// body segments, sized by the body's measurements) -> a lit stage with shadows. No depth needed.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createTracker } from './lib/tracker.js';
import { Body, Playback, J } from './lib/body.js';
import { BodyView } from './lib/bodyview.js';
import { Costume, COSTUMES, PALETTES, segments } from './lib/costume.js';
import { bindSources } from './lib/sources.js';
import { MotionCleaner, PRESETS } from './lib/motion.js';

const $ = id => document.getElementById(id), num = id => +$(id).value, status = t => $('status').textContent = t;
const stage = $('stage'), video = $('video');

// ---- the stage: a room, a key light that casts shadows ---------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setPixelRatio(devicePixelRatio); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; stage.prepend(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 60); camera.position.set(1.4, 0.4, 4.2);
const orbit = new OrbitControls(camera, renderer.domElement); orbit.target.set(0, -0.05, 0);
let FLOOR_Y = -0.95;   // moves with the dancer's floor (motion.floorY)
const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshStandardMaterial({ color: 0xe6e1d6, roughness: 0.9 })); floor.rotation.x = -Math.PI / 2; floor.position.y = FLOOR_Y; floor.receiveShadow = true; scene.add(floor);
const grid = new THREE.GridHelper(12, 24, 0x9a958a, 0xbdb8ad); grid.position.y = FLOOR_Y + 0.002; scene.add(grid);
const hemi = new THREE.HemisphereLight(0xffffff, 0x8a857a, 1.1); scene.add(hemi);
const key = new THREE.DirectionalLight(0xffffff, 2.4); key.position.set(-2.5, 4, 3); key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, { left: -2.5, right: 2.5, top: 2.5, bottom: -2.5, near: 0.5, far: 12 }); key.shadow.bias = -0.0004; scene.add(key, key.target);
const resize = () => { const w = stage.clientWidth, h = stage.clientHeight; renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); };
new ResizeObserver(resize).observe(stage); resize();
function setRoom(light) {
  scene.background = new THREE.Color(light ? 0xefebe2 : 0x0d0e11); floor.material.color.setHex(light ? 0xe6e1d6 : 0x1a1b20);
  grid.material.color.setHex(light ? 0x9a958a : 0x444650); hemi.intensity = light ? 1.1 : 0.55; key.intensity = light ? 2.4 : 2.8;
}
$('room').onchange = () => setRoom($('room').value === 'light'); setRoom(true);

// ---- the body and its costume -------------------------------------------------------------------------------------------
// @key A source preview behind the dancer | The video as a texture on a plane, scaled each frame by (shoulder width in metres / shoulder width in the picture) and moved so the picture's hips land on the body's: the costume sits on the person it came from.
const screen = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide })); screen.visible = false; scene.add(screen);
const align = { k: 1, x: 0, y: 0 };
function placePicture() {
  const P = body.p, hip = new THREE.Vector3().addVectors(P[23], P[24]).multiplyScalar(0.5);
  const img = Math.hypot(P[11].x - P[12].x, P[11].y - P[12].y), real = body.w[11].distanceTo(body.w[12]);
  if (img < 1e-3) return;
  const k = real / img, e = 0.25;
  align.k += (k - align.k) * e; align.x += (-hip.x * k - align.x) * e; align.y += (-hip.y * k - align.y) * e;
  const root = show['clean motion'] ? cleanOut.root : { x: 0, y: 0, z: 0 };   // the costume travels, so the picture travels with it
  screen.scale.set(2 * body.aspect * align.k * (body.mirror ? -1 : 1), 2 * align.k, 1); screen.position.set(align.x + root.x, align.y + root.y, -0.7 + root.z);
}
// @/key
const body = new Body(), skeleton = new BodyView(body); skeleton.show({ face: false, hands: false }); scene.add(skeleton);
// ---- motion cleaning: the costume reads CLEAN joints (stage metres), not the tracker's raw ones ------------------------------------------
const motion = new MotionCleaner(), cw = Array.from({ length: 33 }, () => new THREE.Vector3()), rawW = Array.from({ length: 33 }, () => new THREE.Vector3());
const cleanOut = { w: cw, vis: new Array(33).fill(0) };
const cleanBody = Object.create(body); cleanBody.w = cw; cleanBody.frame = { pose: Array.from({ length: 33 }, () => [0, 0, 0, 0]) };        // looks like a Body to the costume and the skeleton view
const rawBody = Object.create(body); rawBody.w = rawW;
const rawView = new BodyView(rawBody); rawView.show({ face: false, hands: false, heat: false }); rawView.name = 'rawGhost';
rawView.joints.material = new THREE.MeshBasicMaterial({ color: 0x8a8f9a, transparent: true, opacity: 0.5 }); rawView.bones.material = new THREE.LineBasicMaterial({ color: 0x8a8f9a, transparent: true, opacity: 0.5 }); scene.add(rawView);
skeleton.body = cleanBody;
for (const id of ['noise', 'response', 'inertia', 'damping', 'lead', 'rigid', 'feet', 'hold', 'travel', 'travelZ']) {
  $(id).oninput = () => { motion.params[id] = num(id); $(id + 'o').textContent = num(id).toFixed(2); };
}
const setPreset = name => { Object.assign(motion.params, PRESETS[name]); for (const id of Object.keys(PRESETS[name])) { if ($(id)) { $(id).value = motion.params[id]; $(id + 'o').textContent = (+motion.params[id]).toFixed(2); } } };
$('mpreset').onchange = () => setPreset($('mpreset').value); setPreset('performance');
for (const id of ['travel', 'travelZ']) { $(id).value = motion.params[id]; $(id + 'o').textContent = (+motion.params[id]).toFixed(2); }
$('recentre').onclick = () => motion.recentre();

let costume = null, palette = 'yellow';
function dress(name) {
  if (costume) { scene.remove(costume); costume.traverse(o => { o.geometry?.dispose(); }); }
  costume = new Costume(COSTUMES[name].parts); costume.setPalette(palette); costume.volume = num('volume'); scene.add(costume);
  costume.frustumCulled = false; for (const g of Object.keys(costume.show)) costume.show[g] = $('g_' + g)?.checked ?? true;
}
for (const [k, c] of Object.entries(COSTUMES)) $('costume').add(new Option(c.label, k));
$('costume').onchange = () => dress($('costume').value);
for (const [k, p] of Object.entries(PALETTES)) {
  const b = document.createElement('button'); const hx = n => '#' + n.toString(16).padStart(6, '0'); b.style.background = `linear-gradient(135deg, ${hx(p.primary)} 50%, ${hx(p.accent)} 50%)`; b.title = k; b.setAttribute('aria-pressed', k === palette);
  b.onclick = () => { palette = k; costume.setPalette(k); [...$('sw').children].forEach(x => x.setAttribute('aria-pressed', x === b)); }; $('sw').append(b);
}
$('volume').oninput = () => { costume.volume = num('volume'); $('volumeo').textContent = num('volume').toFixed(2) + '×'; };
for (const g of ['head', 'torso', 'arms', 'legs']) {
  const l = document.createElement('label'); l.className = 'chk'; const c = Object.assign(document.createElement('input'), { type: 'checkbox', checked: true, id: 'g_' + g, onchange: () => costume.show[g] = c.checked }); l.append(c, g); $('groups').append(l);
}
const show = { picture: false, shadows: true, 'space lines': true, skeleton: false, 'raw ghost': false, 'clean motion': true, follow: true, wire: false };
$('pic').oninput = () => { screen.material.opacity = num('pic'); $('pico').textContent = num('pic').toFixed(2); };
for (const k of Object.keys(show)) {
  const l = document.createElement('label'); l.className = 'chk'; const c = Object.assign(document.createElement('input'), { type: 'checkbox', checked: show[k], title: k === 'picture' ? 'The source video behind the dancer (webcam or film clips; recordings have none)' : '', onchange: () => { show[k] = c.checked; if (k === 'clean motion') motion.reset(); if (k === 'wire') costume.wireframe = c.checked; if (k === 'shadows') { key.castShadow = c.checked; floor.receiveShadow = c.checked; } } }); l.append(c, k); $('layers').append(l);
}
dress('spiral');

// space lines, after Schlemmer's figures in the circle: a ring on the floor around the dancer, and plumb lines from head, hands and feet down to it
const ring = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 96 }, (_, i) => new THREE.Vector3(Math.cos(i / 96 * 6.2832), 0, Math.sin(i / 96 * 6.2832)))), new THREE.LineBasicMaterial({ color: 0x6f6a60 }));
const plumb = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x6f6a60, transparent: true, opacity: 0.55 })); scene.add(ring, plumb);

// ---- sources ------------------------------------------------------------------------------------------------------------------
let tracker = null, live = false, playback = null, t0 = 0, lastVT = -1, frames = 0, fps = 0, fpsT = performance.now();
async function load() { if (tracker) return; status('loading the pose model…'); tracker = await createTracker({ pose: true, hands: false, face: false }); }
bindSources({ video, camBtn: $('cam'), clipSel: $('clip'), load, status, onStart(mirror, name) {
  motion.reset(); body.mirror = mirror; body.reset(); body.aspect = video.videoWidth / video.videoHeight || 4 / 3; live = true; playback = null; t0 = performance.now(); status(name);
  screen.material.map?.dispose(); const tex = new THREE.VideoTexture(video); tex.colorSpace = THREE.SRGBColorSpace; screen.material.map = tex; screen.material.needsUpdate = true;
} });
$('rec').add(new Option('recorded…', ''));
fetch('data/index.json').then(r => r.json()).then(l => l.forEach(n => $('rec').add(new Option(n.replace('.pose.json', ''), n)))).catch(() => {});
$('rec').onchange = async () => {
  if (!$('rec').value) return; const data = await (await fetch('data/' + $('rec').value)).json();
  video.pause(); live = false; playback = new Playback(data); t0 = performance.now(); body.mirror = !!data.mirror; body.aspect = data.aspect ?? 4 / 3; motion.reset(); body.reset(); screen.material.map = null; screen.material.needsUpdate = true; status(`recorded: ${playback.frames.length} frames`);
};

// ---- loop ---------------------------------------------------------------------------------------------------------------------
let readT = 0, lastT = 0;
renderer.setAnimationLoop(now => {
  let fresh = false;
  if (live && video.readyState >= 2) {
    const vt = video.srcObject ? (now - t0) / 1000 : video.currentTime;
    if (video.srcObject || vt !== lastVT) { lastVT = vt; body.update(tracker.detect(video, vt)); frames++; fresh = true; }
  } else if (playback) { body.update(playback.at((now - t0) / 1000)); frames++; fresh = true; }
  const on = body.present;
  screen.visible = show.picture && on && !!screen.material.map && live; if (screen.visible) placePicture();
  costume.visible = on; skeleton.visible = on && show.skeleton; rawView.visible = on && show['raw ghost']; ring.visible = plumb.visible = on && show['space lines'];
  if (on) {
    // @key Clean first, then dress | The tracker's joints go through the MotionCleaner (smoothing, inertia, locked bones, planted feet, root travel); the costume and the skeleton read the cleaned ones. With "clean motion" off it reads the raw joints.
    const pose = body.frame.pose, vis = pose.map(l => l[3]);
    if (body.frame.t < lastT) motion.reset();      // a recording looped: start the cleaner afresh
    lastT = body.frame.t;
    if (show['clean motion']) motion.process({ w: body.w, p: body.p, vis }, now / 1000, cleanOut, fresh);
    else { body.w.forEach((p, i) => cw[i].copy(p)); cleanOut.vis = vis.map(v => v >= 0.5 ? 1 : 0); cleanOut.root = { x: 0, y: 0, z: 0 }; cleanOut.planted = [false, false]; cleanOut.floorY = FLOOR_Y; cleanOut.offset = 0; }
    cleanBody.frame.pose.forEach((l, i) => l[3] = cleanOut.vis[i] ? 1 : 0);
    const root = cleanOut.root; body.w.forEach((p, i) => rawW[i].set(p.x + root.x, p.y + root.y, p.z + root.z));
    // @/key
    if (cleanOut.floorY != null) FLOOR_Y += ((cleanOut.floorY - 0.07) - FLOOR_Y) * 0.2;
    floor.position.y = FLOOR_Y; grid.position.y = FLOOR_Y + 0.002; key.position.set(root.x - 2.5, 4, root.z + 3); key.target.position.set(root.x, FLOOR_Y, root.z); key.target.updateMatrixWorld();
    if (show.follow) orbit.target.lerp(new THREE.Vector3(root.x, root.y - 0.05, root.z), 0.05);
    const S = segments(cleanBody); costume.update(cleanBody, S); if (skeleton.visible) skeleton.update('world'); if (rawView.visible) rawView.update('world');
    // @key Space lines | A ring on the floor as wide as the dancer's reach, and a plumb line from the head, hands and feet straight down to the floor.
    const hips = S.torso.a, R = Math.max(0.45, (S.measure.arm * 2 + S.measure.shoulders) * 0.5);
    ring.position.set(hips.x, FLOOR_Y + 0.004, hips.z); ring.scale.setScalar(R);
    const pts = []; for (const n of ['nose', 'leftWrist', 'rightWrist', 'leftAnkle', 'rightAnkle']) { const p = cleanBody.w[J[n]]; if (cleanOut.vis[J[n]]) pts.push(p.clone(), new THREE.Vector3(p.x, FLOOR_Y + 0.004, p.z)); }
    plumb.geometry.setFromPoints(pts);
    // @/key
    if (now - readT > 200) { readT = now; const m = S.measure; $('read').textContent = `shoulders  ${(m.shoulders * 100).toFixed(0)} cm\ntorso      ${(m.torso * 100).toFixed(0)} cm\narm        ${(m.arm * 100).toFixed(0)} cm\nleg        ${(m.leg * 100).toFixed(0)} cm\nhead radius ${(m.headR * 100).toFixed(1)} cm\nscale      ${m.scale.toFixed(2)}\n\nfeet       ${cleanOut.planted.map((p, i) => (i ? 'R ' : 'L ') + (p ? 'planted' : 'free')).join(' · ')}\nclean vs raw ${(cleanOut.offset * 100).toFixed(1)} cm`; }
  }
  orbit.update(); renderer.render(scene, camera);
  if (now - fpsT > 1000) { fps = frames; frames = 0; fpsT = now; }
  $('hud').textContent = live || playback ? `${fps} body frames/s${on ? '' : ' · no body found'}` : 'choose a source';
});
globalThis.__lesson = { scene, get costume() { return costume; }, motion };   // for debugging in the console

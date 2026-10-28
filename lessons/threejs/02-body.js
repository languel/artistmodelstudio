import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createTracker } from './lib/tracker.js';
import { Body, Playback, JOINTS } from './lib/body.js';
import { BodyView } from './lib/bodyview.js';
import { MT, CLIPS } from './lib/clips.js';

// Lesson 02: MediaPipe landmarks as ordinary three.js objects. Sources -> frame -> Body -> BodyView.
const $ = id => document.getElementById(id);

// ---- scene -----------------------------------------------------------------
const stage = $('stage'), video = $('video');
// @key Scene, orbit camera, one Body | The Body holds the data; BodyView is the only thing that draws it.
const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setPixelRatio(devicePixelRatio); stage.prepend(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(getComputedStyle(document.body).backgroundColor);
const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 50); camera.position.set(0, 0, 3.6);
const orbit = new OrbitControls(camera, renderer.domElement);
const grid = new THREE.GridHelper(8, 16, 0x777777, 0x3a3a3a); grid.position.y = -1; scene.add(grid);
const body = new Body(), view = new BodyView(body); scene.add(view);
// @/key
const screen = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide }));
screen.position.z = -0.7; scene.add(screen);
let vtex = null;
function resize() { const w = stage.clientWidth, h = stage.clientHeight; renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); }
new ResizeObserver(resize).observe(stage); resize();

// Layer checkboxes: pose, hands, face, heat (joint size and colour follow speed).
// ---- layers ----------------------------------------------------------------
for (const k of ['pose', 'hands', 'face', 'heat']) {
  const l = document.createElement('label'); l.style.cssText = 'display:flex;gap:4px;align-items:center;min-width:0';
  const c = Object.assign(document.createElement('input'), { type: 'checkbox', checked: true, onchange: () => view.show({ [k]: c.checked }) });
  l.append(c, k); $('layers').append(l);
}
$('vid').oninput = e => screen.material.opacity = +e.target.value;
screen.visible = false;

// ---- sources ---------------------------------------------------------------
const status = t => $('status').textContent = t;
let tracker = null, src = null, playback = null, t0 = 0, recording = null, lastVT = -1;
// @key Models load on first use | createTracker builds the pose, hand and face landmarkers (GPU first, CPU as fallback).
async function getTracker() {
  if (tracker) return tracker;
  status('loading MediaPipe models…');
  try { tracker = await createTracker(); } catch (e) { status('MediaPipe failed to load: ' + e.message + ' (run fetch-mediapipe.sh)'); throw e; }
  return tracker;
}
// @/key
// the picture sits 0.7 behind the body: scale it up so it registers with the body from the starting camera
function setAspect(a) { body.aspect = a; const k = (3.6 + 0.7) / 3.6; screen.scale.set(a * body.height * k, body.height * k, 1); }
// @key A video becomes a source | A webcam or a film clip is just a <video>; the picture also sits behind the body as a texture.
function useVideo(mirror) {
  body.mirror = mirror; body.reset(); screen.scale.x = Math.abs(screen.scale.x) * (mirror ? -1 : 1);
  vtex?.dispose(); vtex = new THREE.VideoTexture(video); vtex.colorSpace = THREE.SRGBColorSpace; screen.material.map = vtex; screen.material.needsUpdate = true;
  screen.visible = true; playback = null; src = 'live'; t0 = performance.now();
  setAspect(video.videoWidth / video.videoHeight || 4 / 3);
}
// @/key
$('cam').onclick = async () => {
  try {
    await getTracker();
    video.srcObject = await navigator.mediaDevices.getUserMedia({ video: { width: 960, height: 720 } });
    await video.play(); useVideo(true); status('webcam');
  } catch (e) { status('webcam: ' + e.message); }
};
const clipSel = $('clip'); clipSel.add(new Option('clip…', ''));
for (const [n, id] of Object.entries(CLIPS)) clipSel.add(new Option(n, id));
clipSel.onchange = async () => {
  if (!clipSel.value) return;
  try {
    await getTracker();
    video.srcObject = null; video.src = MT + clipSel.value + '/proxy.webm'; await video.play();
    useVideo(false); sourceName = clipSel.value; status('clip: ' + clipSel.selectedOptions[0].text);
  } catch (e) { status('clip: ' + e.message); }
};
let sourceName = 'webcam';
const recSel = $('rec'); recSel.add(new Option('recorded…', ''));
fetch('data/index.json').then(r => r.json()).then(l => l.forEach(n => recSel.add(new Option(n, n)))).catch(() => {});
recSel.onchange = async () => {
  if (!recSel.value) return;
  const data = await (await fetch('data/' + recSel.value)).json();
  video.pause(); screen.visible = false; playback = new Playback(data); src = 'recorded'; t0 = performance.now();
  body.mirror = !!data.mirror; body.reset(); setAspect(data.aspect ?? 4 / 3); status(`recorded: ${playback.frames.length} frames, ${playback.duration.toFixed(1)} s`);
};
// @key Recording is just saving frames | The frame format is plain JSON (body-frames/1), so a recording replaces the camera.
$('recbtn').onclick = async () => {
  if (!recording) { if (src !== 'live') return status('start the webcam or a clip first'); recording = []; $('recbtn').textContent = '■ stop'; return; }
  const t0r = recording[0]?.t ?? 0; recording.forEach(f => f.t = Math.round((f.t - t0r) * 1000) / 1000);  // start at t = 0
  const data = { format: 'body-frames/1', source: sourceName, aspect: body.aspect, mirror: body.mirror, frames: recording }; recording = null;
  $('recbtn').textContent = '● rec'; $('recinfo').textContent = '';
  const name = sourceName.replace(/[^a-z0-9]+/gi, '-').toLowerCase() + '.pose.json', json = JSON.stringify(data);
  try { const r = await fetch('save/' + name, { method: 'POST', body: json }); if (!r.ok) throw 0; status('saved data/' + name + ' (add it to data/index.json)'); }
  catch { const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([json])), download: name }); a.click(); status('downloaded ' + name); }
};
// @/key

// ---- loop ------------------------------------------------------------------
const hud = $('hud'); let frames = 0, fpsT = performance.now(), fps = 0;
renderer.setAnimationLoop(now => {
// @key One tick: detect, update the Body, draw | Live: tracker.detect(video) gives a frame. Recorded: Playback.at(t) gives one. Both go through body.update.
  let frame = null;
  if (src === 'live' && tracker && video.readyState >= 2) {
    const vt = video.srcObject ? (performance.now() - t0) / 1000 : video.currentTime;
    if (video.srcObject || vt !== lastVT) { lastVT = vt; frame = tracker.detect(video, vt); if (recording && frame.pose) { recording.push(frame); $('recinfo').textContent = recording.length + ' frames'; } }
  } else if (src === 'recorded') frame = playback.at((now - t0) / 1000);
  if (frame) { body.update(frame); frames++; }
  const mode = $('mode').value;
  grid.position.y = mode === 'world' ? -0.95 : -1;
  view.update(mode); orbit.update(); renderer.render(scene, camera);
// @/key
  if (now - fpsT > 1000) { fps = frames; frames = 0; fpsT = now; }
  let top = ''; if (body.present) { let k = 0; for (let i = 1; i < 33; i++) if (body.speed[i] > body.speed[k]) k = i; top = ` · fastest ${JOINTS[k]} ${body.speed[k].toFixed(1)} m/s`; }
  hud.textContent = src ? `${fps} body frames/s${body.present ? '' : ' · no body found'}${top}` : 'choose a source';
});

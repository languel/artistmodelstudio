import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createTracker } from './lib/tracker.js';
import { createDepth } from './lib/depth.js';
import { Pinboard } from './lib/pinboard.js';
import { MT, CLIPS } from './lib/clips.js';

// Lesson 03: a pin screen driven by a person mask and a depth map.
const $ = id => document.getElementById(id), status = t => $('status').textContent = t;
const stage = $('stage'), video = $('video');
const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setPixelRatio(devicePixelRatio); stage.prepend(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(getComputedStyle(document.body).backgroundColor);
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100); camera.position.set(3.2, 1.8, 8);
const orbit = new OrbitControls(camera, renderer.domElement); orbit.target.set(0, 0, 0.5);
scene.add(new THREE.AmbientLight(0xffffff, 0.8));
const sun = new THREE.DirectionalLight(0xffffff, 2.4); sun.position.set(-3, 4, 5); scene.add(sun);
// @key The board | Pinboard is a Group like any other; it owns the pins and nothing else.
const board = new Pinboard({ cols: 84 }); scene.add(board);
// @/key
function resize() { const w = stage.clientWidth, h = stage.clientHeight; renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); }
new ResizeObserver(resize).observe(stage); resize();

let tracker = null, depthNet = null, mirror = false, live = false;
let mask = null, depth = null, busy = false, lastVT = -1, depthMs = 0, t0 = 0, depthFrames = 0, depthFps = 0, fpsT = performance.now(), frames = 0, fps = 0;
async function load() {
// @key Two models, one load | The pose model (with its person mask) and the depth model start together.
  if (tracker && depthNet) return;
  status('loading pose and depth models…');
  [tracker, depthNet] = await Promise.all([createTracker({ pose: true, hands: false, face: false, mask: true }), createDepth({ device: new URLSearchParams(location.search).get('device') || undefined })]);
// @/key
}
function start(m) {
  mirror = m; live = true; mask = depth = null; t0 = performance.now();
  board.setAspect(video.videoWidth / video.videoHeight || 4 / 3);
}
$('cam').onclick = async () => {
  try { await load(); video.srcObject = await navigator.mediaDevices.getUserMedia({ video: { width: 960, height: 720 } }); await video.play(); start(true); status('webcam · depth on ' + depthNet.device); }
  catch (e) { status('webcam: ' + e.message); }
};
const clipSel = $('clip'); clipSel.add(new Option('clip…', ''));
for (const [n, id] of Object.entries(CLIPS)) clipSel.add(new Option(n, id));
clipSel.onchange = async () => {
  if (!clipSel.value) return;
  try { await load(); video.srcObject = null; video.src = MT + clipSel.value + '/proxy.webm'; await video.play(); start(false); status(clipSel.selectedOptions[0].text + ' · depth on ' + depthNet.device); }
  catch (e) { status('clip: ' + e.message); console.error(e); }
};
$('cols').oninput = e => { $('colso').textContent = e.target.value; board.build(+e.target.value); };

// Debug thumbnails: the mask and depth arrays the pins are reading.
function thumb(id, w, h, f) {
  const c = $(id); if (c.width !== w) { c.width = w; c.height = h; }
  const cx = c.getContext('2d'), im = cx.createImageData(w, h);
  for (let i = 0; i < w * h; i++) { const v = f(i) * 255; im.data.set([v, v, v, 255], i * 4); }
  cx.putImageData(im, 0, 0);
}
let thumbT = 0;
const hud = $('hud');
renderer.setAnimationLoop(now => {
// @key Mask every frame, depth when ready | Pose and mask run each video frame. Depth is slower, so it runs in the background and the pins ease toward each new result.
  if (live && video.readyState >= 2) {
    const vt = video.srcObject ? (now - t0) / 1000 : video.currentTime;
    if (video.srcObject || vt !== lastVT) { lastVT = vt; tracker.detect(video, vt); mask = tracker.mask; frames++; }
    if (!busy) { busy = true; const s = performance.now();
      depthNet.estimate(video).then(d => { depth = d; depthMs = performance.now() - s; depthFrames++; }).catch(e => status('depth: ' + e.message)).finally(() => busy = false); }
  }
// @/key
  // @key Hand the arrays to the board | The board knows nothing about video or models: it receives a depth array, a mask array and options.
  board.update({ video: live ? video : null, mirror, depth, mask, mode: $('mode').value, amount: +$('amount').value, slew: +$('slew').value,
    threshold: +$('thr').value, color: $('color').value, invert: $('invert').checked });
  // @/key
  if (now - thumbT > 200) { thumbT = now;
    if (mask) thumb('tmask', mask.width, mask.height, i => mask.data[i]);
    if (depth) thumb('tdepth', depth.width, depth.height, i => depth.data[i]); }
  orbit.update(); renderer.render(scene, camera);
  if (now - fpsT > 1000) { fps = frames; depthFps = depthFrames; frames = depthFrames = 0; fpsT = now; }
  hud.textContent = live ? `pose+mask ${fps}/s · depth ${depthFps}/s (${depthMs.toFixed(0)} ms) · ${board.cols * board.rows} pins` : 'choose a source';
});

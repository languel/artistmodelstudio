// Lesson 04: depth + body in one metric space. Source -> pose + mask + depth -> Fusion -> skeleton, cloud, air plane.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createTracker } from './lib/tracker.js';
import { createDepth } from './lib/depth.js';
import { Body, J } from './lib/body.js';
import { BodyView } from './lib/bodyview.js';
import { Fusion } from './lib/fusion.js';
import { bindSources } from './lib/sources.js';

const $ = id => document.getElementById(id), status = t => $('status').textContent = t;
const stage = $('stage'), video = $('video');

// ---- scene: metres, y up, the camera is the origin looking down -z -----------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setPixelRatio(devicePixelRatio); stage.prepend(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(getComputedStyle(document.body).backgroundColor);
const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 100); camera.position.set(2.2, 1, 1.5);
const orbit = new OrbitControls(camera, renderer.domElement); orbit.target.set(0, 0, -3);
const floor = new THREE.GridHelper(12, 24, 0x777777, 0x3a3a3a); scene.add(floor);

// the real camera, drawn as a frustum at the origin
const camGauge = new THREE.PerspectiveCamera(40, 4 / 3, 0.05, 1.2), camHelper = new THREE.CameraHelper(camGauge); scene.add(camHelper);

const body = new Body(), fusion = new Fusion();
const fused = new BodyView(body), ghost = new BodyView(body);   // fused skeleton, and the MediaPipe-only one for comparison
fused.name = 'fused'; ghost.name = 'poseOnly'; scene.add(fused);
// the ghost reuses BodyView's drawing but reads fusion.poseOnly: a tiny stand-in Body that shares the frame
const ghostBody = Object.assign(Object.create(body), { c: fusion.poseOnly }); ghost.body = ghostBody; ghost.joints.material = new THREE.MeshBasicMaterial({ color: 0x8a8f9a, transparent: true, opacity: 0.55 }); ghost.bones.material = new THREE.LineBasicMaterial({ color: 0x8a8f9a, transparent: true, opacity: 0.5 });
ghost.joints.instanceColor = null; ghost.heads = null; scene.add(ghost);

// @key The room as a point cloud | One Points object; its positions are rewritten each time a new depth map arrives, its colours come from the video.
const MAXP = 252 * 196;
const cloud = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ size: 0.035, vertexColors: true, sizeAttenuation: true }));
cloud.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAXP * 3), 3));
cloud.geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(MAXP * 3), 3));
cloud.frustumCulled = false; scene.add(cloud);
// @/key

// the air plane: a vertical sheet in front of the chest that lights when a wrist passes through it
const air = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.1), new THREE.MeshBasicMaterial({ color: 0x6fc2ff, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false }));
const airEdge = new THREE.LineSegments(new THREE.EdgesGeometry(air.geometry), new THREE.LineBasicMaterial({ color: 0x6fc2ff })); air.add(airEdge); scene.add(air);
const tape = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: 0xff7a7a })); scene.add(tape);

function resize() { const w = stage.clientWidth, h = stage.clientHeight; renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); }
new ResizeObserver(resize).observe(stage); resize();

const show = { cloud: true, fused: true, ghost: true, plane: true };
for (const k of Object.keys(show)) {
  const l = document.createElement('label'); l.className = 'chk';
  const c = Object.assign(document.createElement('input'), { type: 'checkbox', checked: true, onchange: () => show[k] = c.checked }); l.append(c, k); $('layers').append(l);
}
$('fov').oninput = e => { fusion.fov = +e.target.value; $('fovo').textContent = e.target.value; };
$('trust').oninput = e => fusion.trust = +e.target.value;
$('reach').oninput = e => $('reacho').textContent = (+e.target.value).toFixed(2) + ' m';

// ---- sources and models ----------------------------------------------------------------------------------------
let tracker = null, depthNet = null, live = false, mirror = false, t0 = 0, lastVT = -1;
let depth = null, busy = false, depthStamp = 0, framed = false, frames = 0, fps = 0, fpsT = performance.now();
const sample = document.createElement('canvas'), sx = sample.getContext('2d', { willReadFrequently: true });

async function load() {
  if (tracker && depthNet) return;
  status('loading pose and depth models…');
  [tracker, depthNet] = await Promise.all([createTracker({ pose: true, hands: false, face: false }), createDepth({ device: new URLSearchParams(location.search).get('device') || undefined })]);
}
bindSources({ video, camBtn: $('cam'), clipSel: $('clip'), load, status, onStart(m, name) {
  mirror = m; body.mirror = m; body.reset(); live = true; depth = null; framed = false; fusion.Zhip = fusion.alpha = fusion.beta = fusion.floorY = null; t0 = performance.now();
  body.aspect = video.videoWidth / video.videoHeight || 4 / 3;
  camGauge.fov = 2 * Math.atan(Math.tan(fusion.fov * Math.PI / 360) / body.aspect) * 180 / Math.PI; camGauge.aspect = body.aspect; camGauge.updateProjectionMatrix(); camHelper.update();
  status(name + ' · depth on ' + depthNet.device);
} });

// rebuild the cloud from the newest depth map (not every frame: depth arrives a few times a second)
function refreshCloud() {
  if (!depth || fusion.alpha == null) return;
  const pos = cloud.geometry.attributes.position.array, col = cloud.geometry.attributes.color.array;
  const n = fusion.cloud(depth, mirror ? -1 : 1, pos, 1);
  if (sample.width !== depth.width) { sample.width = depth.width; sample.height = depth.height; }
  sx.drawImage(video, 0, 0, depth.width, depth.height); const px = sx.getImageData(0, 0, depth.width, depth.height).data;
  for (let i = 0; i < n; i++) { col[i * 3] = px[i * 4] / 255; col[i * 3 + 1] = px[i * 4 + 1] / 255; col[i * 3 + 2] = px[i * 4 + 2] / 255; }
  cloud.geometry.setDrawRange(0, n);
  cloud.geometry.attributes.position.needsUpdate = cloud.geometry.attributes.color.needsUpdate = true;
}

// ---- loop ------------------------------------------------------------------------------------------------------
const v3 = new THREE.Vector3(), readEl = $('read'), hud = $('hud'); let readT = 0;
renderer.setAnimationLoop(now => {
  if (live && video.readyState >= 2) {
    const vt = video.srcObject ? (now - t0) / 1000 : video.currentTime;
    if (video.srcObject || vt !== lastVT) { lastVT = vt; body.update(tracker.detect(video, vt)); fusion.update(body, depth); frames++; }
    if (!busy) { busy = true; depthNet.estimate(video).then(d => { depth = d; depthStamp++; if (body.present) { fusion.update(body, depth); refreshCloud(); } }).catch(e => status('depth: ' + e.message)).finally(() => busy = false); }
  }
  fused.visible = show.fused && body.present && fusion.Zhip != null; ghost.visible = show.ghost && fused.visible; cloud.visible = show.cloud;
  if (fused.visible) {
    fused.update('camera'); ghost.update('camera');
    if (!framed) { orbit.target.copy(body.c[J.leftHip]).lerp(body.c[J.rightHip], 0.5); camera.position.copy(orbit.target).add(v3.set(2.4, 0.9, 2.2)); framed = true; }
    if (fusion.floorY != null) floor.position.y = fusion.floorY;
    // @key The air plane | A plane a fixed distance in front of the chest. A wrist is "through" it when it is nearer the camera than the plane.
    const sh = body.c[J.leftShoulder].clone().lerp(body.c[J.rightShoulder], 0.5), reach = +$('reach').value;
    air.visible = show.plane; air.position.set(sh.x, sh.y - 0.15, sh.z + reach);
    const through = [J.leftWrist, J.rightWrist].filter(i => body.frame.pose[i][3] > 0.5 && body.c[i].z > air.position.z);
    air.material.opacity = through.length ? 0.4 : 0.12; airEdge.material.color.set(through.length ? 0xffffff : 0x6fc2ff);
    // @/key
    // tape measure between the wrists
    const a = body.c[J.leftWrist], b = body.c[J.rightWrist]; tape.geometry.setFromPoints([a, b]);
    if (now - readT > 150 && fusion.alpha != null) { readT = now;
      const surf = depth ? fusion.surfaceDistance(a.z < b.z ? a : b, depth, mirror ? -1 : 1) : null;
      readEl.textContent = [`camera to hips   ${fusion.Zhip.toFixed(2)} m`, `wrists apart     ${(a.distanceTo(b) * 100).toFixed(0)} cm`,
        `left wrist front ${((sh.z - a.z) * 100).toFixed(0)} cm of chest`, `right wrist front ${((sh.z - b.z) * 100).toFixed(0)} cm of chest`,
        `nearest wrist to a surface ${surf == null ? '-' : (surf * 100).toFixed(0) + ' cm'}`, `depth fit error  ${(fusion.residual * 100).toFixed(0)} cm`].join('\n'); }
  } else air.visible = false;
  orbit.update(); renderer.render(scene, camera);
  if (now - fpsT > 1000) { fps = frames; frames = 0; fpsT = now; }
  hud.textContent = live ? `${fps} body frames/s · ${depthStamp} depth maps` : 'choose a source';
});

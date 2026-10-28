// Lesson 06: the body as a drum. Pose -> Body (metres, hip-centred) -> BodyDrum (pads on the body, hits) -> drum voices;
// this page draws the pads, lights them on a hit, and keeps a rolling score of what was played. No depth needed.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createTracker } from './lib/tracker.js';
import { Body } from './lib/body.js';
import { BodyView } from './lib/bodyview.js';
import { BodyDrum } from './lib/bodydrum.js';
import { createDrums, VOICES } from './lib/drums.js';
import { bindSources } from './lib/sources.js';

const $ = id => document.getElementById(id), num = id => +$(id).value, status = t => $('status').textContent = t;
const stage = $('stage'), video = $('video');

// ---- scene: metres, y up, hips at the origin ----------------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setPixelRatio(devicePixelRatio); stage.prepend(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(getComputedStyle(document.body).backgroundColor);
const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 50); camera.position.set(0.8, 0.5, 3.4);
const orbit = new OrbitControls(camera, renderer.domElement); orbit.target.set(0, 0.1, 0);
const floor = new THREE.GridHelper(8, 16, 0x777777, 0x3a3a3a); floor.position.y = -0.95; scene.add(floor);
const body = new Body(), view = new BodyView(body); view.show({ face: false, hands: false }); scene.add(view);
const resize = () => { const w = stage.clientWidth, h = stage.clientHeight; renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); };
new ResizeObserver(resize).observe(stage); resize();

const drum = new BodyDrum(), sound = createDrums();

// @key A picture behind the body | The video as a texture on a plane. The skeleton is in metres around the hips, the picture in pixels, so each frame the plane is scaled by (shoulder width in metres / shoulder width in the picture) and moved so the picture's hips land on the skeleton's.
const screen = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide })); screen.visible = false; scene.add(screen);
const align = { k: 1, x: 0, y: 0 };
function placePicture() {
  const P = body.p, hip = new THREE.Vector3().addVectors(P[23], P[24]).multiplyScalar(0.5);
  const img = Math.hypot(P[11].x - P[12].x, P[11].y - P[12].y), real = body.w[11].distanceTo(body.w[12]);
  if (img < 1e-3) return;
  const k = real / img, e = 0.25;                       // smoothed: the pose jitters a little from frame to frame
  align.k += (k - align.k) * e; align.x += (-hip.x * k - align.x) * e; align.y += (-hip.y * k - align.y) * e;
  screen.scale.set(2 * body.aspect * align.k * (body.mirror ? -1 : 1), 2 * align.k, 1); screen.position.set(align.x, align.y, -0.6);
}
// @/key

// ---- pads: one translucent sphere each, lit on a hit ----------------------------------------------------------------
// @key A pad on screen | A sphere that follows its centre from BodyDrum, with a wire outline. On a hit it flashes and a ring spreads from it.
const pads = drum.pads.map((p, i) => {
  const color = new THREE.Color().setHSL(i / drum.pads.length * 0.85, 0.85, 0.58);
  const fill = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.12, depthWrite: false }));
  const wire = new THREE.Mesh(new THREE.SphereGeometry(1.002, 14, 10), new THREE.MeshBasicMaterial({ color, wireframe: true, transparent: true, opacity: 0.25 }));
  const label = textSprite(p.label, color); label.visible = false;
  const g = new THREE.Group(); g.add(fill, wire); scene.add(g, label);
  return { def: p, color, fill, wire, group: g, label, flash: 0 };
});
// @/key
function textSprite(text, color) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64; const x = c.getContext('2d'); x.font = '600 30px system-ui'; x.fillStyle = '#' + color.getHexString(); x.textAlign = 'center'; x.fillText(text, 128, 42);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthTest: false })); s.scale.set(0.4, 0.1, 1); return s;
}
const hitColor = { clap: new THREE.Color(0xffffff), foot0: new THREE.Color(0xffb84b), foot1: new THREE.Color(0xffb84b) };
const rings = [];
const handDots = [0, 1].map(() => scene.add(new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 8), new THREE.MeshBasicMaterial({ color: 0x6fc2ff }))) && scene.children.at(-1));

// ---- controls ------------------------------------------------------------------------------------------------------
const rowEls = {};
pads.forEach(({ def, color }) => {
  const r = document.createElement('div'); r.className = 'row';
  const sel = document.createElement('select'); VOICES.forEach(v => sel.add(new Option(v, v))); sel.value = def.voice; sel.onchange = () => def.voice = sel.value;
  const on = Object.assign(document.createElement('input'), { type: 'checkbox', checked: true, onchange: () => def.on = on.checked });
  const l = document.createElement('label'); l.innerHTML = `<i style="background:#${color.getHexString()}"></i>`; l.append(on, def.label); r.append(l, sel); $('pads').append(r); rowEls[def.id] = l;
});
for (const k of ['picture', 'pads', 'skeleton', 'labels', 'score']) {
  const l = document.createElement('label'); l.className = 'chk';
  const c = Object.assign(document.createElement('input'), { type: 'checkbox', checked: k !== 'labels' && k !== 'picture', onchange: () => show[k] = c.checked }); l.append(c, k); $('layers').append(l);
}
const show = { picture: false, pads: true, skeleton: true, labels: false, score: true };
$('pic').oninput = () => { screen.material.opacity = num('pic'); $('pico').textContent = num('pic').toFixed(2); };
const fmt = { speed: v => v.toFixed(2) + ' m/s', size: v => v.toFixed(2) + '×', refr: v => v.toFixed(2) + ' s', tune: v => v, decay: v => v.toFixed(2) + '×' };
const knobs = { speed: v => drum.minSpeed = v, size: v => drum.size = v, refr: v => drum.refractory = v, tune: v => sound.set('tune', v), decay: v => sound.set('decay', v), reverb: v => sound.set('reverb', v), volume: v => sound.set('volume', v) };
for (const [id, f] of Object.entries(knobs)) { $(id).oninput = () => { f(num(id)); if ($(id + 'o')) $(id + 'o').textContent = fmt[id](num(id)); }; $(id).oninput(); }
$('claps').onchange = e => drum.claps = e.target.checked; $('feet').onchange = e => drum.feet = e.target.checked;
$('snd').onclick = () => sound.resume().then(() => $('snd').textContent = 'sound on');
document.addEventListener('click', () => sound.resume().then(() => $('snd').textContent = 'sound on'), { once: true });

// ---- sources ---------------------------------------------------------------------------------------------------------
let hitCount = 0, tracker = null, live = false, t0 = 0, lastVT = -1, frames = 0, fps = 0, fpsT = performance.now();
async function load() { if (tracker) return; status('loading the pose model…'); tracker = await createTracker({ pose: true, hands: false, face: false }); }
bindSources({ video, camBtn: $('cam'), clipSel: $('clip'), load, status, onStart(mirror, name) {
  body.mirror = mirror; body.reset(); body.aspect = video.videoWidth / video.videoHeight || 4 / 3; live = true; t0 = performance.now(); status(name);
  screen.material.map?.dispose(); const tex = new THREE.VideoTexture(video); tex.colorSpace = THREE.SRGBColorSpace; screen.material.map = tex; screen.material.needsUpdate = true;
} });

// ---- the score: the last eight seconds, one row per pad ----------------------------------------------------------------
const tl = $('tl'), tx = tl.getContext('2d'), events = [], WINDOW = 8;
const rowIds = [...drum.pads.map(p => p.id), 'clap', 'foot0', 'foot1'];
function drawScore(now) {
  const w = tl.clientWidth, h = tl.clientHeight, dpr = devicePixelRatio; if (tl.width !== w * dpr) { tl.width = w * dpr; tl.height = h * dpr; }
  tx.setTransform(dpr, 0, 0, dpr, 0, 0); tx.clearRect(0, 0, w, h); if (!show.score) return;
  const rh = h / rowIds.length; tx.fillStyle = 'rgba(0,0,0,0.35)'; tx.fillRect(0, 0, w, h);
  rowIds.forEach((id, i) => { tx.fillStyle = i % 2 ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.0)'; tx.fillRect(0, i * rh, w, rh); });
  while (events.length && now - events[0].t > WINDOW) events.shift();
  for (const e of events) {
    const x = w - (now - e.t) / WINDOW * w, y = (rowIds.indexOf(e.id) + 0.5) * rh, c = (pads.find(p => p.def.id === e.id)?.color ?? hitColor[e.id]);
    tx.fillStyle = '#' + c.getHexString(); tx.globalAlpha = 0.35 + 0.65 * e.level; tx.beginPath(); tx.arc(x, y, 2 + 4 * e.level, 0, 7); tx.fill();
  }
  tx.globalAlpha = 1;
}

// ---- loop ----------------------------------------------------------------------------------------------------------------
renderer.setAnimationLoop(now => {
  if (live && video.readyState >= 2) {
    const vt = video.srcObject ? (now - t0) / 1000 : video.currentTime;
    if (video.srcObject || vt !== lastVT) {
      lastVT = vt; body.update(tracker.detect(video, vt)); frames++;
      if (body.present) {
        // @key Hits become sounds | Each new pose frame goes to BodyDrum. Every hit it reports plays its pad's voice, loudness from the arrival speed, stereo position from where on the body it landed.
        const res = drum.update(body.w, body.v, now / 1000, hi => body.frame.pose[hi ? 16 : 15][3] > 0.5, j => body.frame.pose[j][3] > 0.5);
        for (const h of res.hits) {
          hitCount++; sound.hit(h.voice, h.level, h.x / 0.8); events.push({ t: now / 1000, id: h.id, level: h.level });
          const pad = pads.find(p => p.def.id === h.id); if (pad) pad.flash = 1;
          const c = pad ? pad.color : hitColor[h.id], at = res.centres[h.id] || (h.id === 'clap' ? midpoint(res.hands) : res.hands[0]);
          const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 32), new THREE.MeshBasicMaterial({ color: c, transparent: true, side: THREE.DoubleSide })); ring.position.set(at.x, at.y, at.z); rings.push({ ring, life: 1, level: h.level }); scene.add(ring);
          if (rowEls[h.id]) { rowEls[h.id].style.opacity = 1; }
        }
        // @/key
        pads.forEach(p => { const c = res.centres[p.def.id]; p.group.position.set(c.x, c.y, c.z); p.group.scale.setScalar(c.r); p.label.position.set(c.x, c.y + c.r + 0.06, c.z); });
        res.hands.forEach((h, i) => { handDots[i].position.set(h.x, h.y, h.z); handDots[i].visible = body.frame.pose[i ? 16 : 15][3] > 0.5; });
      }
    }
  }
  view.visible = show.skeleton && body.present; if (view.visible) view.update('world');
  screen.visible = show.picture && body.present && !!screen.material.map; if (screen.visible) placePicture();
  for (const p of pads) {
    p.group.visible = show.pads && body.present; p.label.visible = show.labels && p.group.visible;
    p.flash *= 0.88; p.fill.material.opacity = 0.1 + 0.6 * p.flash; p.wire.material.opacity = 0.25 + 0.6 * p.flash; p.group.scale.multiplyScalar(1 + 0.18 * p.flash);
  }
  handDots.forEach(d => d.visible = d.visible && body.present);
  for (let i = rings.length - 1; i >= 0; i--) { const r = rings[i]; r.life -= 0.045; r.ring.scale.setScalar(0.08 + (1 - r.life) * (0.3 + 0.3 * r.level)); r.ring.quaternion.copy(camera.quaternion); r.ring.material.opacity = Math.max(0, r.life); if (r.life <= 0) { scene.remove(r.ring); r.ring.geometry.dispose(); r.ring.material.dispose(); rings.splice(i, 1); } }
  orbit.update(); renderer.render(scene, camera); drawScore(now / 1000);
  if (now - fpsT > 1000) { fps = frames; frames = 0; fpsT = now; }
  $('hud').textContent = live ? `${fps} body frames/s${body.present ? '' : ' · no body found'} · ${hitCount} hits · sound ${sound.running ? 'on' : 'off (click sound)'}` : 'choose a source';
});
function midpoint(h) { return { x: (h[0].x + h[1].x) / 2, y: (h[0].y + h[1].y) / 2, z: (h[0].z + h[1].z) / 2 }; }

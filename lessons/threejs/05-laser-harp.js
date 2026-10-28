// Lesson 05: a laser harp in the style of Jean-Michel Jarre. Fusion (lesson 04) gives the hands in metres; Harp (lib/harp.js)
// decides which beam each hand interrupts; the synth (lib/synth.js) holds a note while a beam is cut and sweeps its filter with
// the hand's height; this page draws the beams, the glow and the haze and wires the controls.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { J } from './lib/body.js';
import { createRig } from './lib/rig.js';
import { Harp } from './lib/harp.js';
import { createSynth, SCALES, noteMidi, noteName } from './lib/synth.js';

const $ = id => document.getElementById(id), num = id => +$(id).value;
const rig = createRig({ stage: $('stage'), video: $('video'), status: t => $('status').textContent = t, camBtn: $('cam'), clipSel: $('clip') });
const { scene, body, fusion, renderer, camera } = rig;
const harp = new Harp(), synth = createSynth();
scene.fog = new THREE.FogExp2(0x05070a, 0.035);

// ---- bloom: the bright cores spill light into the dark --------------------------------------------------------------
// @key Bloom | Draw the scene into a float buffer, keep only what is brighter than a threshold, blur it, and add it back. Beam cores are brighter than white, so they glow.
const composer = new EffectComposer(renderer), bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.9, 0.55, 0.95);   // threshold just under 1: only the over-bright beam cores glow
composer.addPass(new RenderPass(scene, camera)); composer.addPass(bloom); composer.addPass(new OutputPass());
rig.render = () => composer.render();
rig.onResize = (w, h) => composer.setSize(w, h);
composer.setSize($('stage').clientWidth, $('stage').clientHeight);
rig.cloud.material.color.setScalar(0.4); rig.cloud.material.size = 0.03;   // the room recedes so the light is the subject
// @/key

// ---- controls ------------------------------------------------------------------------------------------------------
for (const k of Object.keys(SCALES)) $('scale').add(new Option(k, k));
['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'].forEach((n, i) => $('root').add(new Option(n, 48 + i)));
$('root').value = 50;   // D3: with nine beams of D Dorian the harp spans D3 to E4
for (const k of ['cloud', 'fused', 'ghost']) {
  const l = document.createElement('label'); l.className = 'chk';
  const c = Object.assign(document.createElement('input'), { type: 'checkbox', checked: k === 'cloud', onchange: () => rig.show[k] = c.checked }); l.append(c, k); $('layers').append(l);
  rig.show[k] = k === 'cloud';   // the room stays, the skeleton is hidden by default: the light is the subject
}
const fmt = { attack: v => v.toFixed(2) + ' s', release: v => v.toFixed(2) + ' s', cutLow: v => v, cutHigh: v => v, thick: v => (v * 100).toFixed(0) + ' cm', grab: v => (v * 100).toFixed(0) + ' cm' };
for (const id of ['attack', 'release', 'sustain', 'cutLow', 'cutHigh', 'q', 'reverb', 'volume']) {
  $(id).oninput = () => { synth.set(id, num(id)); if ($(id + 'o')) $(id + 'o').textContent = fmt[id](num(id)); };
  synth.set(id, num(id));
}
$('wave').onchange = () => synth.set('wave', $('wave').value);
$('thick').oninput = () => { harp.enter = num('thick'); harp.leave = num('thick') * 1.8; $('thicko').textContent = fmt.thick(num('thick')); };
$('grab').oninput = () => { harp.grab = num('grab'); $('grabo').textContent = fmt.grab(num('grab')); };
$('bloom').oninput = () => { bloom.strength = num('bloom'); bloom.enabled = num('bloom') > 0; $('bloomo').textContent = num('bloom').toFixed(2); };
$('bloom').oninput();   // start from the slider's value
$('snd').onclick = () => synth.resume().then(() => $('snd').textContent = 'sound on');
document.addEventListener('click', () => synth.resume().then(() => $('snd').textContent = 'sound on'), { once: true });

// ---- the harp, drawn ----------------------------------------------------------------------------------------------
const group = new THREE.Group(); group.name = 'harp'; scene.add(group);
const unitCyl = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true);
// a soft white-hot dot with a cross of streaks: the flare where a hand cuts a beam
function flareTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.15, 'rgba(255,255,255,0.8)'); g.addColorStop(0.45, 'rgba(255,255,255,0.15)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  for (const [w, h] of [[128, 5], [5, 128], [90, 3], [3, 90]]) { const s = x.createLinearGradient(64 - w / 2, 64 - h / 2, 64 + w / 2, 64 + h / 2); s.addColorStop(0, 'rgba(255,255,255,0)'); s.addColorStop(0.5, 'rgba(255,255,255,0.8)'); s.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = s; x.fillRect(64 - w / 2, 64 - h / 2, w, h); }
  return new THREE.CanvasTexture(c);
}
const flareTex = flareTexture();
let color = new THREE.Color(0x38ff6a), beams = [];
const emitterBar = new THREE.Mesh(new THREE.BoxGeometry(1, 0.03, 0.08), new THREE.MeshBasicMaterial({ color: 0x0b0d10 })); group.add(emitterBar);
const source = new THREE.Sprite(new THREE.SpriteMaterial({ map: flareTex, color, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false })); group.add(source);

function seg(mesh, a, b, r) {   // stretch a unit cylinder between two points
  const d = new THREE.Vector3().subVectors(b, a), len = d.length() || 1e-4;
  mesh.position.copy(a).addScaledVector(d, 0.5); mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.divideScalar(len)); mesh.scale.set(r, len, r);
}
function rebuild() {
  harp.beams = num('beams'); harp.span = num('span');
  $('beamso').textContent = harp.beams; $('spano').textContent = harp.span.toFixed(2) + ' m'; $('reacho').textContent = num('reach').toFixed(2) + ' m';
  for (const b of beams) { group.remove(b.core, b.glow, b.flare, b.pool); b.core.material.dispose(); b.glow.material.dispose(); b.flare.material.dispose(); b.pool.material.dispose(); }
  beams = Array.from({ length: harp.beams }, () => {
    const core = new THREE.Mesh(unitCyl, new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(3), fog: false }));
    const glow = new THREE.Mesh(unitCyl, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    const flare = new THREE.Sprite(new THREE.SpriteMaterial({ map: flareTex, color: color.clone().lerp(new THREE.Color(1, 1, 1), 0.6).multiplyScalar(2), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false })); flare.visible = false;
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: flareTex, color, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false })); pool.rotation.x = -Math.PI / 2;
    group.add(core, glow, flare, pool); return { core, glow, flare, pool, top: harp.yMax, act: 0 };
  });
  layout();
}
function layout() {
  const w = harp.span * harp.fan + 0.1; emitterBar.scale.set(w, 1, 1); emitterBar.position.set(harp.centre.x, harp.yMin - 0.015, harp.centre.z);
  source.position.set(harp.centre.x, harp.yMin + 0.02, harp.centre.z);
  beams.forEach((b, i) => b.pool.position.set(harp.baseX(i), harp.yMin + 0.005, harp.centre.z));
}
$('color').onchange = () => { color = new THREE.Color(+$('color').value); rebuild(); source.material.color.copy(color); };
for (const id of ['beams', 'span']) $(id).oninput = rebuild;
$('reach').oninput = () => { $('reacho').textContent = num('reach').toFixed(2) + ' m'; placeHere(); };
$('thick').oninput(); $('grab').oninput(); rebuild();

// the fingertips
const tipDots = Array.from({ length: 4 }, () => new THREE.Mesh(new THREE.SphereGeometry(0.022, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false }))); tipDots.forEach(d => scene.add(d));

// @key Haze | Dust drifting in the air. Each speck brightens when it is near a beam, so the beams seem to light the room.
const DUST = 700, dust = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ size: 0.02, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true, fog: false }));
const dp = new Float32Array(DUST * 3), dc = new Float32Array(DUST * 3), seed = Array.from({ length: DUST }, () => [Math.random(), Math.random(), Math.random(), Math.random() * 6.28]);
dust.geometry.setAttribute('position', new THREE.BufferAttribute(dp, 3)); dust.geometry.setAttribute('color', new THREE.BufferAttribute(dc, 3)); dust.frustumCulled = false; scene.add(dust);
function updateDust(t, amount) {
  const c = harp.centre, W = harp.span * 0.9 + 0.5, H = harp.yMax - harp.yMin;
  for (let i = 0; i < DUST; i++) {
    const s = seed[i], x = c.x + (s[0] - 0.5) * 2 * W + Math.sin(t * 0.00013 + s[3]) * 0.12, y = harp.yMin + ((s[1] + t * 0.000012 * (0.5 + s[2])) % 1) * (H + 0.3), z = c.z + (s[2] - 0.5) * 1.6 + Math.cos(t * 0.00011 + s[3]) * 0.1;
    dp[i * 3] = x; dp[i * 3 + 1] = y; dp[i * 3 + 2] = z;
    let lit = 0.04;   // brightness: near any beam in x (at this height) and near the plane in z
    for (let k = 0; k < beams.length; k++) { const dx = x - harp.beamXAt(k, y), a = y <= beams[k].top ? 1 : 0.15; lit = Math.max(lit, a * Math.exp(-(dx * dx) / 0.004 - ((z - c.z) ** 2) / 0.05) * (0.5 + beams[k].act)); }
    const v = lit * amount; dc[i * 3] = color.r * v; dc[i * 3 + 1] = color.g * v; dc[i * 3 + 2] = color.b * v;
  }
  dust.geometry.attributes.position.needsUpdate = dust.geometry.attributes.color.needsUpdate = true;
}
// @/key

// @key Place the harp in front of the chest | The plane stands a chosen number of metres nearer the camera than the shoulders, centred on the chest. It then stays put in space, unless "follow" is on.
function placeHere() {
  if (!rig.active) return;
  const sh = body.c[J.leftShoulder].clone().lerp(body.c[J.rightShoulder], 0.5);
  harp.place({ x: sh.x, y: sh.y - 0.2, z: sh.z + num('reach') }); layout();
}
// @/key
$('place').onclick = placeHere;
let placed = false; rig.onStart = () => { placed = false; synth.allOff(); };

// ---- each frame ------------------------------------------------------------------------------------------------------
let readT = 0; const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3();
rig.onFrame = (now, fresh) => {
  group.visible = dust.visible = rig.active; tipDots.forEach(d => d.visible = false);
  if (!rig.active) { if (harp.active.size) { synth.allOff(); harp.active.clear(); harp.held.clear(); } $('hud').textContent = rig.live ? 'looking for a body…' : 'choose a source'; return; }
  if (!placed) { placeHere(); placed = true; }
  if ($('follow').checked && fresh) {   // glide toward the chest so the harp follows slowly, not jitterily
    const sh = body.c[J.leftShoulder].clone().lerp(body.c[J.rightShoulder], 0.5), c = harp.centre, k = 0.04;
    const keep = [...harp.active]; harp.place({ x: c.x + (sh.x - c.x) * k, y: c.y + (sh.y - 0.2 - c.y) * k, z: c.z + (sh.z + num('reach') - c.z) * k }); keep.forEach(([b, a]) => harp.active.set(b, a)); layout();
  }
  const dz = {};
  // @key Fingertips in, held notes out | Once per new pose frame the fingertips (in metres) go to the Harp. A newly cut beam starts a note, a held beam moves its filter, a freed beam starts the release.
  if (fresh) {
    const mode = $('tips').value, ids = mode === 'wrist' ? [['lw', J.leftWrist], ['rw', J.rightWrist]] : mode === 'both' ? [['li', J.leftIndex], ['ri', J.rightIndex], ['lw', J.leftWrist], ['rw', J.rightWrist]] : [['li', J.leftIndex], ['ri', J.rightIndex]];
    const tips = ids.map(([id, j]) => ({ id, p: body.c[j], ok: body.frame.pose[j][3] > 0.5 }));
    tips.forEach((t, i) => { dz[t.id] = t.ok ? t.p.z - harp.centre.z : null; tipDots[i].visible = t.ok; tipDots[i].position.copy(t.p); tipDots[i].material.color.set(Math.abs(t.p.z - harp.centre.z) < harp.enter ? 0xffffff : 0x5a6068); });
    const r = harp.update(tips, now / 1000), root = num('root'), scale = $('scale').value;
    for (const b of r.on) { const hold = r.holds.find(h => h.beam === b); synth.voiceOn(b, noteMidi(root, scale, b), hold.h, (harp.topX(b) - harp.centre.x) / (harp.span / 2 + 0.01)); }
    for (const h of r.holds) synth.voiceMove(h.beam, h.h);
    for (const b of r.off) synth.voiceOff(b);
    rig.lastDz = dz;
  }
  // @/key
  // @key The beam stops at the hand | Each beam is drawn from its emitter up to where it is interrupted (or to the top when free), so the hand "cuts" it. A flare sits at the cut.
  beams.forEach((b, i) => {
    const hold = harp.active.get(i), target = hold ? hold.y : harp.yMax;
    b.top += (target - b.top) * (hold ? 0.6 : 0.25);
    b.act += ((hold ? 1 : 0) - b.act) * (hold ? 0.12 : 0.05);          // the glow follows the sound's fade in and out
    tmpA.set(harp.baseX(i), harp.yMin, harp.centre.z); tmpB.set(harp.beamXAt(i, b.top), b.top, harp.centre.z);
    seg(b.core, tmpA, tmpB, 0.004 + 0.002 * b.act); seg(b.glow, tmpA, tmpB, 0.025 + 0.03 * b.act); b.glow.material.opacity = 0.13 + 0.25 * b.act;
    b.flare.visible = !!hold || b.act > 0.05; b.flare.position.copy(tmpB); b.flare.material.opacity = Math.min(1, b.act * 1.4); b.flare.scale.setScalar((0.22 + 0.2 * Math.random() * b.act) * (0.4 + b.act));
    b.pool.scale.setScalar(0.14 + 0.3 * b.act); b.pool.material.opacity = 0.2 + 0.5 * b.act;
  });
  // @/key
  source.scale.setScalar(0.18 + 0.12 * beams.reduce((s, b) => s + b.act, 0)); source.material.opacity = 0.8;
  updateDust(now, num('haze'));
  if (now - readT > 120) { readT = now; const lines = [`plane ${(-harp.centre.z).toFixed(2)} m from the camera`];
    const fmtDz = id => rig.lastDz?.[id] == null ? '-' : ((rig.lastDz[id] >= 0 ? '+' : '') + (rig.lastDz[id] * 100).toFixed(0) + ' cm');
    lines.push(`left index ${fmtDz('li')} · right index ${fmtDz('ri')}  (+ in front of the plane)`);
    const held = [...harp.active].map(([b, a]) => `${noteName(noteMidi(num('root'), $('scale').value, b))} ${(a.h * 100).toFixed(0)}%`);
    lines.push(held.length ? 'holding ' + held.join('  ') : 'holding -', `sound ${synth.running ? 'on' : 'off (click sound)'}`);
    $('read').textContent = lines.join('\n'); $('note').textContent = held.length ? held[held.length - 1].split(' ')[0] : ' '; }
  $('hud').textContent = `${rig.fps} body frames/s · ${rig.depthMaps} depth maps`;
};

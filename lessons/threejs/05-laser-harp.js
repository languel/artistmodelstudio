// Lesson 05: a laser harp. Fusion (lesson 04) gives hands in metres; Harp (lib/harp.js) decides what was plucked;
// the synth (lib/synth.js) makes the sound; this page draws the beams and wires the controls.
import * as THREE from 'three';
import { J } from './lib/body.js';
import { createRig } from './lib/rig.js';
import { Harp } from './lib/harp.js';
import { createSynth, SCALES, noteMidi, noteName } from './lib/synth.js';

const $ = id => document.getElementById(id);
const rig = createRig({ stage: $('stage'), video: $('video'), status: t => $('status').textContent = t, camBtn: $('cam'), clipSel: $('clip') });
const { scene, body, fusion } = rig;
const harp = new Harp(), synth = createSynth();

// ---- controls ----------------------------------------------------------------------------------------------------
for (const k of Object.keys(SCALES)) $('scale').add(new Option(k, k));
$('scale').value = 'pentatonic minor';
['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'].forEach((n, i) => $('root').add(new Option(n, 48 + i)));
$('root').value = 48 + 9;   // A
const val = id => $(id).value, num = id => +$(id).value;
for (const k of ['cloud', 'fused', 'ghost']) {
  const l = document.createElement('label'); l.className = 'chk';
  const c = Object.assign(document.createElement('input'), { type: 'checkbox', checked: true, onchange: () => rig.show[k] = c.checked }); l.append(c, k); $('layers').append(l);
}
$('trust').oninput = e => fusion.trust = +e.target.value;
$('vol').oninput = e => synth.volume = +e.target.value;
$('snd').onclick = () => synth.resume().then(() => $('snd').textContent = 'sound on');
document.addEventListener('click', () => synth.resume().then(() => $('snd').textContent = 'sound on'), { once: true });

// ---- the beams: a bright core, a soft glow, and a spark where a pluck happened --------------------------------------
const group = new THREE.Group(); group.name = 'harp'; scene.add(group);
let beamMeshes = [];
const sparks = [];
const planeFrame = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xff4a4a, transparent: true, opacity: 0.35 })); group.add(planeFrame);
function rebuild() {
  harp.beams = num('beams'); harp.span = num('span'); harp.top = 0.55; harp.bottom = -0.9;
  $('beamso').textContent = harp.beams; $('spano').textContent = harp.span.toFixed(2) + ' m'; $('reacho').textContent = num('reach').toFixed(2) + ' m';
  for (const b of beamMeshes) { group.remove(b.core, b.glow); b.core.geometry.dispose(); b.glow.geometry.dispose(); }
  const h = harp.top - harp.bottom;
  beamMeshes = Array.from({ length: harp.beams }, () => {
    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, h, 6), new THREE.MeshBasicMaterial({ color: 0xff3030 }));
    const glow = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, h, 10, 1, true), new THREE.MeshBasicMaterial({ color: 0xff5a5a, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false }));
    group.add(core, glow); return { core, glow, flash: 0 };
  });
  layout();
}
function layout() {
  const c = harp.centre, mid = (harp.yMin + harp.yMax) / 2;
  beamMeshes.forEach((b, i) => { b.core.position.set(harp.beamX(i), mid, c.z); b.glow.position.copy(b.core.position); });
  const x0 = harp.beamX(0) - harp.spacing / 2, x1 = harp.beamX(harp.beams - 1) + harp.spacing / 2;
  planeFrame.geometry.setFromPoints([[x0, harp.yMin], [x1, harp.yMin], [x1, harp.yMin], [x1, harp.yMax], [x1, harp.yMax], [x0, harp.yMax], [x0, harp.yMax], [x0, harp.yMin]].map(([x, y]) => new THREE.Vector3(x, y, c.z)));
}
for (const id of ['beams', 'span', 'reach']) $(id).oninput = () => { rebuild(); if (id === 'reach') placeHere(); };
rebuild();

// the fingertips: bright when in front of the plane, dim behind
const tipDots = ['l', 'r'].flatMap(s => [0, 1].map(() => new THREE.Mesh(new THREE.SphereGeometry(0.025, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff })))); tipDots.forEach(d => scene.add(d));

// @key Place the harp in front of the chest | The plane stands a chosen number of metres nearer the camera than the shoulders, centred on the chest. It then stays put in space, unless "follow" is on.
function placeHere() {
  if (!rig.active) return;
  const sh = body.c[J.leftShoulder].clone().lerp(body.c[J.rightShoulder], 0.5);
  harp.place({ x: sh.x, y: sh.y - 0.2, z: sh.z + num('reach') }); layout();
}
// @/key
$('place').onclick = placeHere;
let placed = false; rig.onStart = () => { placed = false; };

// ---- each frame --------------------------------------------------------------------------------------------------
let lastNote = '', count = 0, readT = 0;
rig.onFrame = (now, fresh) => {
  group.visible = rig.active; tipDots.forEach(d => d.visible = false);
  if (!rig.active) { $('hud').textContent = rig.live ? 'looking for a body…' : 'choose a source'; return; }
  if (!placed) { placeHere(); placed = true; }
  if ($('follow').checked && fresh) {   // glide toward the chest so the harp follows slowly, not jitterily
    const sh = body.c[J.leftShoulder].clone().lerp(body.c[J.rightShoulder], 0.5), c = harp.centre, k = 0.04;
    harp.place({ x: c.x + (sh.x - c.x) * k, y: c.y + (sh.y - 0.2 - c.y) * k, z: c.z + (sh.z + num('reach') - c.z) * k }); layout();
  }
  // @key Fingertips in, plucks out | The tracked fingertips, in metres, go to the Harp once per new pose frame; every pluck becomes a note, with speed as loudness and x as stereo position.
  if (fresh) {
    const mode = val('tips'), ids = mode === 'wrist' ? [['lw', J.leftWrist], ['rw', J.rightWrist]] : mode === 'both' ? [['li', J.leftIndex], ['ri', J.rightIndex], ['lw', J.leftWrist], ['rw', J.rightWrist]] : [['li', J.leftIndex], ['ri', J.rightIndex]];
    const tips = ids.map(([id, j]) => ({ id, p: body.c[j], ok: body.frame.pose[j][3] > 0.5 }));
    tips.forEach((t, i) => { if (tipDots[i]) { tipDots[i].visible = t.ok; tipDots[i].position.copy(t.p); tipDots[i].material.color.set(harp.distance(t.id) > 0 ? 0xffffff : 0x8a8f9a); } });
    for (const p of harp.update(tips, now / 1000)) {
      const midi = noteMidi(num('root'), val('scale'), p.beam);
      synth.pluck(midi, p.speed / 1.5, (p.point.x - harp.centre.x) / (harp.span / 2 + 0.01));
      lastNote = noteName(midi); count++; $('note').textContent = lastNote;
      beamMeshes[p.beam].flash = 1;
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true })); s.position.set(p.point.x, p.point.y, p.point.z); scene.add(s); sparks.push({ s, life: 1 });
    }
  }
  // @/key
  for (const b of beamMeshes) { b.flash *= 0.9; b.glow.material.opacity = 0.12 + 0.6 * b.flash; b.glow.scale.set(1 + 3 * b.flash, 1, 1 + 3 * b.flash); b.core.material.color.setHSL(0.0, 1, 0.5 + 0.4 * b.flash); }
  for (let i = sparks.length - 1; i >= 0; i--) { const k = sparks[i]; k.life -= 0.06; k.s.scale.setScalar(1 + (1 - k.life) * 2); k.s.material.opacity = Math.max(0, k.life); if (k.life <= 0) { scene.remove(k.s); k.s.geometry.dispose(); k.s.material.dispose(); sparks.splice(i, 1); } }
  if (now - readT > 150) { readT = now;
    const d = id => { const v = harp.distance(id); return v == null ? '   -' : ((v >= 0 ? '+' : '') + (v * 100).toFixed(0)).padStart(4) + ' cm'; };
    $('read').textContent = `plane at ${(-harp.centre.z).toFixed(2)} m from the camera\nleft  index ${d('li')}  (+ in front)\nright index ${d('ri')}\nplucks ${count}  ·  sound ${synth.running ? 'on' : 'off (click sound)'}`; }
  $('hud').textContent = `${rig.fps} body frames/s · ${rig.depthMaps} depth maps`;
};

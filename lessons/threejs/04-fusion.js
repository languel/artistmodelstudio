// Lesson 04: depth + body in one metric space. The shared rig (lib/rig.js) does source -> pose + depth -> Fusion -> scene;
// this page adds the air plane, a tape measure and the readout.
import * as THREE from 'three';
import { J } from './lib/body.js';
import { createRig } from './lib/rig.js';

const $ = id => document.getElementById(id);
const rig = createRig({ stage: $('stage'), video: $('video'), status: t => $('status').textContent = t, camBtn: $('cam'), clipSel: $('clip') });
const { scene, body, fusion } = rig;

// the air plane: a vertical sheet in front of the chest that lights when a wrist passes through it
const air = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.1), new THREE.MeshBasicMaterial({ color: 0x6fc2ff, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false }));
const airEdge = new THREE.LineSegments(new THREE.EdgesGeometry(air.geometry), new THREE.LineBasicMaterial({ color: 0x6fc2ff })); air.add(airEdge); scene.add(air);
const tape = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: 0xff7a7a })); scene.add(tape);

const show = { cloud: true, fused: true, ghost: true, plane: true };
for (const k of Object.keys(show)) {
  const l = document.createElement('label'); l.className = 'chk';
  const c = Object.assign(document.createElement('input'), { type: 'checkbox', checked: true, onchange: () => { show[k] = c.checked; if (k in rig.show) rig.show[k] = c.checked; } }); l.append(c, k); $('layers').append(l);
}
$('fov').oninput = e => { fusion.fov = +e.target.value; $('fovo').textContent = e.target.value; };
$('trust').oninput = e => fusion.trust = +e.target.value;
$('reach').oninput = e => $('reacho').textContent = (+e.target.value).toFixed(2) + ' m';

let readT = 0;
rig.onFrame = now => {
  if (!rig.active) { air.visible = false; $('hud').textContent = rig.live ? 'looking for a body…' : 'choose a source'; return; }
  // @key The air plane | A plane a fixed distance in front of the chest. A wrist is "through" it when it is nearer the camera than the plane.
  const sh = body.c[J.leftShoulder].clone().lerp(body.c[J.rightShoulder], 0.5), reach = +$('reach').value;
  air.visible = show.plane; air.position.set(sh.x, sh.y - 0.15, sh.z + reach);
  const through = [J.leftWrist, J.rightWrist].filter(i => body.frame.pose[i][3] > 0.5 && body.c[i].z > air.position.z);
  air.material.opacity = through.length ? 0.4 : 0.12; airEdge.material.color.set(through.length ? 0xffffff : 0x6fc2ff);
  // @/key
  // tape measure between the wrists
  const a = body.c[J.leftWrist], b = body.c[J.rightWrist]; tape.geometry.setFromPoints([a, b]);
  if (now - readT > 150 && fusion.alpha != null) { readT = now;
    const surf = rig.depth ? fusion.surfaceDistance(a.z < b.z ? a : b, rig.depth, rig.mirror ? -1 : 1) : null;
    $('read').textContent = [`camera to hips   ${fusion.Zhip.toFixed(2)} m`, `wrists apart     ${(a.distanceTo(b) * 100).toFixed(0)} cm`,
      `left wrist front ${((sh.z - a.z) * 100).toFixed(0)} cm of chest`, `right wrist front ${((sh.z - b.z) * 100).toFixed(0)} cm of chest`,
      `nearest wrist to a surface ${surf == null ? '-' : (surf * 100).toFixed(0) + ' cm'}`, `depth fit error  ${(fusion.residual * 100).toFixed(0)} cm`].join('\n'); }
  $('hud').textContent = `${rig.fps} body frames/s · ${rig.depthMaps} depth maps`;
};

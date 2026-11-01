import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// A paper cutout puppet: black silhouette pieces joined at hinges, on a lightbox, with layers of set in front and behind.
let view = 'film' /* film | inspect */;
let joints = true /* toggle */;
let walk = 0 /* 0..1 */;
let tint = '#f0d9a0' /* color */;
let moon = true /* toggle */;

const W = innerWidth, H = innerHeight, FRAME = 7;               // FRAME: the height the film camera sees, in puppet units
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(W, H);
document.body.append(renderer.domElement);
const scene = new THREE.Scene();
const film = new THREE.OrthographicCamera(-FRAME * W / H / 2, FRAME * W / H / 2, FRAME / 2, -FRAME / 2, 0.1, 50);
film.position.set(0, 0, 10);
const eye = new THREE.PerspectiveCamera(40, W / H, 0.1, 100);
eye.position.set(5, 2.5, 9);
const controls = new OrbitControls(eye, renderer.domElement);

// --- paper -----------------------------------------------------------------------------------------------------
const paper = (color = 0x0b0a0a, opacity = 1) => new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, side: THREE.DoubleSide, depthWrite: opacity === 1 });
const BLACK = paper();
const cut = (shape, z, mat = BLACK) => { const m = new THREE.Mesh(new THREE.ShapeGeometry(shape, 24), mat); m.position.z = z; return m; };

// A tapered limb with rounded ends, hanging from the origin down to -len (the hinge is the top circle's centre).
function limb(len, w0, w1) {
  const s = new THREE.Shape();
  s.absarc(0, 0, w0 / 2, Math.PI, 0, true);
  s.lineTo(w1 / 2, -len); s.absarc(0, -len, w1 / 2, 0, Math.PI, true); s.lineTo(-w0 / 2, 0);
  return s;
}
function torso() {                                                  // a long jacket, narrower at the waist
  const s = new THREE.Shape();
  s.moveTo(-0.3, 0); s.bezierCurveTo(-0.38, 0.4, -0.34, 0.8, -0.26, 1.08); s.lineTo(0.2, 1.08);
  s.bezierCurveTo(0.34, 0.8, 0.38, 0.4, 0.3, 0); s.lineTo(-0.3, 0);
  return s;
}
function head() {                                                   // a profile: forehead, nose, chin, a turban
  const s = new THREE.Shape();
  s.moveTo(-0.05, 0); s.lineTo(0.14, 0.02); s.lineTo(0.17, 0.12); s.lineTo(0.3, 0.2); s.lineTo(0.17, 0.26); s.lineTo(0.2, 0.36);
  s.bezierCurveTo(0.2, 0.55, 0.1, 0.7, -0.08, 0.72); s.bezierCurveTo(-0.26, 0.7, -0.3, 0.45, -0.22, 0.25); s.lineTo(-0.1, 0.1);
  return s;
}
function foot() {                                                   // a slipper: a heel, a sole, and a toe that curls up
  const s = new THREE.Shape(); s.moveTo(-0.1, 0.1); s.lineTo(0.22, 0.04); s.bezierCurveTo(0.4, 0.02, 0.5, 0.05, 0.56, 0.2);
  s.bezierCurveTo(0.5, 0.0, 0.42, -0.1, 0.3, -0.11); s.lineTo(-0.1, -0.12); s.lineTo(-0.1, 0.1);
  return s;
}
function neck() { const s = new THREE.Shape(); s.moveTo(-0.07, -0.02); s.lineTo(0.08, -0.02); s.lineTo(0.06, 0.24); s.lineTo(-0.07, 0.24); return s; }

// Each part: where its hinge is (in its parent), its shape, its tip (where you grab it: the far end), how far it may turn.
// A hinge turns its part to point at the pointer, so any part, whatever its shape, is moved the same way.
const PARTS = [
  { id: 'torso', at: [0, 0], shape: torso(), tip: [0, 1.0], limit: [-0.6, 0.6], z: 0.02 },
  { id: 'neck', parent: 'torso', at: [0.02, 1.05], shape: neck(), tip: [0, 0.22], limit: [-0.5, 0.5], z: 0.025 },
  { id: 'head', parent: 'neck', at: [0, 0.2], shape: head(), tip: [0.03, 0.5], limit: [-0.7, 0.7], z: 0.03 },
  { id: 'armA', parent: 'torso', at: [0, 0.95], shape: limb(0.62, 0.17, 0.12), tip: [0, -0.62], limit: [-3.1, 3.1], z: 0.04 },
  { id: 'foreA', parent: 'armA', at: [0, -0.62], shape: limb(0.58, 0.12, 0.09), tip: [0, -0.58], limit: [-0.1, 2.7], z: 0.05 },
  { id: 'handA', parent: 'foreA', at: [0, -0.58], shape: limb(0.2, 0.09, 0.06), tip: [0, -0.2], limit: [-1.0, 1.0], z: 0.06 },
  { id: 'armB', parent: 'torso', at: [0, 0.95], shape: limb(0.62, 0.17, 0.12), tip: [0, -0.62], limit: [-3.1, 3.1], z: -0.04 },
  { id: 'foreB', parent: 'armB', at: [0, -0.62], shape: limb(0.58, 0.12, 0.09), tip: [0, -0.58], limit: [-0.1, 2.7], z: -0.05 },
  { id: 'handB', parent: 'foreB', at: [0, -0.58], shape: limb(0.2, 0.09, 0.06), tip: [0, -0.2], limit: [-1.0, 1.0], z: -0.06 },
  { id: 'thighA', parent: 'torso', at: [0, 0], shape: limb(0.85, 0.26, 0.16), tip: [0, -0.85], limit: [-1.5, 1.5], z: 0.01 },
  { id: 'shinA', parent: 'thighA', at: [0, -0.85], shape: limb(0.85, 0.16, 0.08), tip: [0, -0.85], limit: [-2.5, 0.1], z: 0.015 },
  { id: 'footA', parent: 'shinA', at: [0, -0.85], shape: foot(), tip: [0.5, 0.02], limit: [-0.9, 0.9], z: 0.02 },
  { id: 'thighB', parent: 'torso', at: [0, 0], shape: limb(0.85, 0.26, 0.16), tip: [0, -0.85], limit: [-1.5, 1.5], z: -0.01 },
  { id: 'shinB', parent: 'thighB', at: [0, -0.85], shape: limb(0.85, 0.16, 0.08), tip: [0, -0.85], limit: [-2.5, 0.1], z: -0.015 },
  { id: 'footB', parent: 'shinB', at: [0, -0.85], shape: foot(), tip: [0.5, 0.02], limit: [-0.9, 0.9], z: -0.02 },
];
const puppet = new THREE.Group();
const home = new THREE.Vector2(-1.2, -3.0);                          // where the puppet stands: drag the body to move it
puppet.position.set(home.x, home.y, 0);
puppet.scale.setScalar(1.35);
scene.add(puppet);
const node = {};
for (const p of PARTS) {
  const g = new THREE.Group();
  g.position.set(p.at[0], p.at[1], 0);
  const m = cut(p.shape, p.z);
  g.add(m);
  const pin = new THREE.Mesh(new THREE.RingGeometry(0.035, 0.06, 20), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  pin.position.z = p.z + 0.2;
  g.add(pin);
  (p.parent ? node[p.parent].group : puppet).add(g);
  node[p.id] = { ...p, group: g, mesh: m, pin, pose: 0, depth: p.parent ? node[p.parent].depth + 1 : 0 };
}
node.torso.group.position.y = 1.75;                                  // the hip: the legs hang from it, the body rises from it
const REST = { armA: 0.5, foreA: 0.7, armB: -0.4, foreB: 0.4, thighA: 0.2, thighB: -0.15, shinA: -0.1, shinB: -0.1, head: 0.05 };
for (const [id, a] of Object.entries(REST)) node[id].pose = a;

// --- the set: layers of cut paper at different depths, a lightbox behind ---------------------------------------
const ridge = (y, amp, freq, phase, depth) => {
  const s = new THREE.Shape(); s.moveTo(-14, -6);
  for (let x = -14; x <= 14; x += 0.4) s.lineTo(x, y + amp * Math.sin(x * freq + phase) + 0.35 * amp * Math.sin(x * freq * 2.7 + phase * 2));
  s.lineTo(14, -6); s.lineTo(-14, -6);
  return s;
};
const far = cut(ridge(-1.4, 0.7, 0.33, 0.3), -3.2, paper(0x3a3226, 0.55));      // tissue: the light comes through it
const mid = cut(ridge(-2.2, 0.8, 0.26, 2.1), -1.8, paper(0x1a1610, 0.9));
const ground = cut(ridge(-3.05, 0.14, 0.9, 0), -0.3);
const reeds = new THREE.Group();
for (let i = 0; i < 26; i++) {                                                  // foreground grasses, nearer than the puppet
  const x = -9 + i * 0.7 + 0.3 * Math.sin(i * 7.1), h = 1 + 0.9 * Math.abs(Math.sin(i * 3.3)), lean = 0.3 * Math.sin(i * 5.3);
  const s = new THREE.Shape(); s.moveTo(x - 0.05, -3.4); s.quadraticCurveTo(x + lean * 0.5, -3.4 + h * 0.6, x + lean, -3.4 + h); s.quadraticCurveTo(x + lean * 0.5 + 0.06, -3.4 + h * 0.6, x + 0.05, -3.4);
  reeds.add(cut(s, 1.2));
}
scene.add(far, mid, ground, reeds);

const lightbox = new THREE.Mesh(new THREE.PlaneGeometry(40, 24), new THREE.MeshBasicMaterial({ map: glow(), depthWrite: false }));
lightbox.position.z = -5;
scene.add(lightbox);
const moonDisc = new THREE.Mesh(new THREE.CircleGeometry(0.9, 48), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95 }));
moonDisc.position.set(3.4, 2.1, -4.9);
scene.add(moonDisc);
function glow() {                                                               // the lightbox: bright in the middle, falling off at the edges
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const g = c.getContext('2d'), r = g.createRadialGradient(256, 256, 20, 256, 256, 360);
  r.addColorStop(0, '#ffffff'); r.addColorStop(0.55, '#bdbdbd'); r.addColorStop(1, '#4a4a4a');
  g.fillStyle = r; g.fillRect(0, 0, 512, 512);
  return new THREE.CanvasTexture(c);
}

// --- hold a piece and turn it about its hinge ------------------------------------------------------------------
// The piece you grab is the one whose bone (hinge to tip) is nearest the pointer, so a thin hand or a hidden arm is as easy
// to catch as the body. Nothing near a bone: the body itself, which moves the whole puppet (Shift: leans it).
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
let held = null, over = null, grab = null;
const camera = () => (view === 'film' ? film : eye);
const world = e => {
  const r = renderer.domElement.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera());
  return ray.ray.intersectPlane(plane, new THREE.Vector3());
};
function reach(at) {                                                   // the part whose bone passes nearest `at`
  let best = null, bd = 0.3;
  for (const n of Object.values(node)) {
    if (n.id === 'torso') continue;
    const a = n.group.getWorldPosition(new THREE.Vector3()), b = n.group.localToWorld(new THREE.Vector3(n.tip[0], n.tip[1], 0));
    const ab = b.clone().sub(a), t = Math.min(1, Math.max(0, at.clone().sub(a).dot(ab) / ab.lengthSq()));
    const d = at.distanceTo(a.add(ab.multiplyScalar(t))) - 0.01 * n.depth;       // (the far end wins a tie)
    if (d < bd) { bd = d; best = n; }
  }
  return best;
}
const inBody = at => ray.intersectObject(node.torso.mesh, false).length > 0;
renderer.domElement.addEventListener('pointerdown', e => {
  if (view !== 'film') return;
  const at = world(e); if (!at) return;
  const part = reach(at);
  if (part) held = part;
  else if (inBody(at)) { held = node.torso; grab = { at: at.clone(), home: home.clone(), lean: e.shiftKey }; }
  if (held) renderer.domElement.setPointerCapture(e.pointerId);
});
renderer.domElement.addEventListener('pointermove', e => {
  const at = world(e); if (!at) return;
  if (!held) { over = view === 'film' ? reach(at) : null; renderer.domElement.style.cursor = over ? 'grab' : ''; return; }
  if (grab && !grab.lean) { home.set(grab.home.x + at.x - grab.at.x, grab.home.y + at.y - grab.at.y); return; }
  const pivot = held.group.getWorldPosition(new THREE.Vector3());
  const total = Math.atan2(at.y - pivot.y, at.x - pivot.x) - Math.atan2(held.tip[1], held.tip[0]);   // the angle that points the piece at the pointer
  const parent = held.parent ? worldAngle(node[held.parent].group) : 0;
  let a = total - parent; a = Math.atan2(Math.sin(a), Math.cos(a));
  held.pose = Math.min(held.limit[1], Math.max(held.limit[0], a));
});
renderer.domElement.addEventListener('pointerup', () => { held = null; grab = null; });
function worldAngle(g) { const q = g.getWorldQuaternion(new THREE.Quaternion()); return new THREE.Euler().setFromQuaternion(q).z; }

// --- a walk, to show the rig moves --------------------------------------------------------------------------------
function stride(t) {
  const k = walk * Math.sin(t * 4);
  return { thighA: 0.55 * k, shinA: -0.5 * Math.max(0, -k) - 0.1 * walk, thighB: -0.55 * k, shinB: -0.5 * Math.max(0, k) - 0.1 * walk,
    armA: -0.5 * k, foreA: 0.4 * walk, armB: 0.5 * k, foreB: 0.4 * walk, torso: 0.04 * walk, head: 0, neck: 0 };
}

renderer.setAnimationLoop(now => {
  const t = now / 1000, st = stride(t);
  for (const n of Object.values(node)) {
    n.group.rotation.z = (held === n ? n.pose : n.pose + (st[n.id] || 0));
    n.pin.visible = joints;
    n.pin.material.color.set(n === (held || over) ? 0xe0a030 : 0xffffff);
  }
  puppet.position.set(home.x + walk * 1.2 * Math.sin(t * 0.5), home.y, 0);
  lightbox.material.color.set(tint);
  moonDisc.visible = moon;
  reeds.children.forEach((r, i) => { r.rotation.z = 0.02 * Math.sin(t * 1.3 + i); });
  controls.enabled = view === 'inspect';
  if (view === 'inspect') controls.update();
  renderer.render(scene, camera());
});

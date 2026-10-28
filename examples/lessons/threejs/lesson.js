/**
 * Lecture: three.js for body and sound. The same shape as the sampling and diffusion lessons and built by the same
 * scene builder (examples/lessons/sampling/scene.js, as `/lesson threejs`): a cover, a section per theme, and a frame per
 * example with a three.js board beside its notes. A board with `three` is a three.js sketch (an ES module that runs in a
 * sandboxed frame while you are on its slide).
 *
 * The full course (MediaPipe body tracking, depth, the real instruments) is its own repository, threejslessons. These
 * boards teach the same ideas with no camera and no models: a dancer made of numbers stands in for the tracker, so the
 * code you read is the code that draws; swap the dancer for the tracker's joints and it is the lesson.
 */
const REPO = 'https://github.com/languel/threejslessons';

// Every sketch starts here: a renderer on the board, a scene, a camera you can orbit, light.
const BASE = `import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
const W = ams.width, H = ams.height, V = (x, y, z) => new THREE.Vector3(x, y, z), s = Math.sin, c = Math.cos;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(W, H); renderer.setClearColor(0x141414);
document.body.append(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 100);
camera.position.set(0, 1.2, 4.6);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1, 0);
const sun = new THREE.DirectionalLight(0xffffff, 2.4); sun.position.set(2, 4, 3);
scene.add(new THREE.AmbientLight(0xffffff, 0.7), sun);
let tick = () => {};
renderer.setAnimationLoop(now => { tick(now / 1000); controls.update(); renderer.render(scene, camera); });
`;

// A dancer made of numbers: the joints a tracker would give, in metres, y up. (Stand-in for MediaPipe.)
const DANCER = `function dancer(t) {
  const hip = V(0.3 * s(t * 0.5), 0.95 + 0.03 * s(t * 2), 0.1 * c(t * 0.5));
  const neck = hip.clone().add(V(0.05 * s(t), 0.5, 0)), head = neck.clone().add(V(0.03 * s(t * 1.3), 0.22, 0));
  const j = { hip, neck, head };
  for (const [k, n] of [[1, 'l'], [-1, 'r']]) {
    const sh = neck.clone().add(V(k * 0.19, -0.03, 0)), a = 1.2 + 0.9 * s(t * 1.7 + (k > 0 ? 0 : 1.6)), b = a + 0.7 * s(t * 2.3);
    const el = sh.clone().add(V(k * 0.28 * s(a), -0.28 * c(a), 0.03 * s(t * 2 + k)));
    j[n + 'sh'] = sh; j[n + 'el'] = el; j[n + 'wr'] = el.clone().add(V(k * 0.26 * s(b), -0.26 * c(b), 0.15 * c(t * 2 + k)));
    const hi = hip.clone().add(V(k * 0.1, -0.02, 0)), kn = hi.clone().add(V(k * 0.04, -0.45, 0.12 * Math.max(0, s(t * 2 + (k > 0 ? 0 : Math.PI)))));
    j[n + 'hi'] = hi; j[n + 'kn'] = kn; j[n + 'an'] = kn.clone().add(V(0, -0.43, -0.05));
  }
  return j;
}
const BONES = [['head', 'neck'], ['neck', 'lsh'], ['neck', 'rsh'], ['lsh', 'lel'], ['lel', 'lwr'], ['rsh', 'rel'], ['rel', 'rwr'], ['neck', 'hip'], ['hip', 'lhi'], ['hip', 'rhi'], ['lhi', 'lkn'], ['lkn', 'lan'], ['rhi', 'rkn'], ['rkn', 'ran']];
// A cylinder between two points: how a limb, a beam or a costume part follows the joints.
function between(mesh, a, b) { mesh.position.copy(a).lerp(b, 0.5); mesh.scale.y = a.distanceTo(b); mesh.quaternion.setFromUnitVectors(V(0, 1, 0), b.clone().sub(a).normalize()); }
`;

// A few notes of Web Audio (starts on your first click in the board: browsers insist on a gesture).
const AUDIO = `let ac = null;
addEventListener('pointerdown', () => { ac ||= new AudioContext(); });
function tone(freq, dur = 0.5, type = 'sawtooth', vol = 0.12) {
  if (!ac) return;
  const o = ac.createOscillator(), g = ac.createGain(), f = ac.createBiquadFilter(), t = ac.currentTime;
  o.type = type; o.frequency.value = freq; f.type = 'lowpass'; f.frequency.value = 1600;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
  o.connect(f).connect(g).connect(ac.destination); o.start(t); o.stop(t + dur);
}
`;

// Studio-code helpers for the route diagram.
const HELP = `const INK = '#dadada', MUTED = '#8c8c8c', GOLD = '#f2c14e'
const label = (x, y, t, o = {}) => note(x, y, t, { color: o.color || MUTED, note: { style: 'plain', font: 'sans', size: o.size || 14, width: o.width || 200 } })
const box = (x, y, w, h, c = INK) => line(rect(x, y, w, h), { brush: 'pen', width: 2, color: c, closed: true, path: 'straight' })
const arrow = (a, b, c = MUTED) => { line([a, b], { brush: 'pen', width: 2, color: c, path: 'straight' }); line([[b[0] - 0.012, b[1] - 0.016], b, [b[0] - 0.012, b[1] + 0.016]], { brush: 'pen', width: 2, color: c, path: 'straight' }) }
`;

const sketch = (parts, body) => parts.join('\n') + '\n' + body;

export const LESSON = {
  title: 'Three.js for body and sound',
  subtitle: 'From a spinning cube to a body you can play, dress, draw with and paint with.',
  idea: 'A three.js scene is a few objects and a loop. Give it a body (joints in metres) and everything else, instruments, costumes, drawings, paint, is a rule that reads those joints.',
  main: 'route',
  sources: {},
  sections: [
    {
      id: 'basics', title: 'A scene from nothing', label: 'Examples',
      text: 'Three things make a picture: a **scene** that holds objects, a **camera** that looks at it, and a **renderer** that draws what the camera sees onto the board. Add a loop and it moves.',
      boards: [
        { id: 'route', title: '0.0 · The route', w: 800, h: 600, ground: '#141414',
          idea: 'Ten small programs in four steps. The first two need nothing; from the third on, a body (joints, in metres) drives the scene. In the course the body is a camera and MediaPipe; here it is a dancer made of numbers, so everything runs in the board.',
          code: HELP + `// The route through the lessons: a scene, a body, instruments, then things the body wears and draws.
const steps = [['00', 'cube'], ['01', 'anatomy'], ['02', 'body'], ['03', 'pinboard'], ['04', 'metres'], ['05', 'laser harp'], ['06', 'body drum'], ['07', 'costumes'], ['08', 'one line'], ['09', 'paint marks']]
steps.forEach(([n, t], i) => {
  const x = 0.06 + (i % 5) * 0.185, y = i < 5 ? 0.2 : 0.58, c = i < 2 ? MUTED : i < 5 ? GOLD : i < 7 ? '#7fb069' : '#c8664f'
  box(x, y, 0.15, 0.2, c); label(x + 0.012, y + 0.02, n, { color: c, size: 22, width: 90 }); label(x + 0.012, y + 0.12, t, { size: 14, width: 120 })
  if (i % 5 < 4) arrow([x + 0.155, y + 0.1], [x + 0.18, y + 0.1])
})
label(0.06, 0.88, 'scene → body → instruments → costume, line, paint', { size: 16, width: 700 })` },
        { id: 'cube', title: '0.1 · A spinning cube', w: 800, h: 600, ground: '#141414',
          idea: 'The whole program: a scene, a camera, a renderer, one mesh (geometry + material) and a loop that turns it. Drag to orbit, wheel to zoom.',
          pseudo: `scene = empty space
camera = a point of view looking at it
mesh = a shape (geometry) with a surface (material)
every frame: turn the mesh, then draw scene as seen by camera`,
          three: sketch([BASE], `const cube = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: '#e0a030' }));
cube.position.y = 1;
scene.add(cube, new THREE.GridHelper(6, 12, 0x444444, 0x2a2a2a));
tick = t => { cube.rotation.set(t * 0.6, t * 0.9, 0); };`) },
        { id: 'anatomy', title: '0.2 · Anatomy of a scene', w: 800, h: 600, ground: '#141414',
          idea: 'The same cube, taken apart: three **materials** that answer light differently (Basic ignores it, Lambert is matte, Standard is physical), and a **light** you can see because it is an object too. The scene is a tree: moving a group moves what is in it.',
          pseudo: `group = [ball with Basic, ball with Lambert, ball with Standard]
light = a small glowing ball that circles the group
every frame: move the light; the balls shade differently`,
          three: sketch([BASE], `const group = new THREE.Group(); group.position.y = 1; scene.add(group);
[new THREE.MeshBasicMaterial({ color: '#7fb069' }), new THREE.MeshLambertMaterial({ color: '#7fb069' }), new THREE.MeshStandardMaterial({ color: '#7fb069', roughness: 0.25, metalness: 0.3 })].forEach((m, i) => {
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.5, 48, 24), m); ball.position.x = (i - 1) * 1.4; group.add(ball);
});
const bulb = new THREE.PointLight(0xffd080, 14); const glow = new THREE.Mesh(new THREE.SphereGeometry(0.07), new THREE.MeshBasicMaterial({ color: 0xffd080 })); bulb.add(glow); scene.add(bulb);
scene.add(new THREE.GridHelper(6, 12, 0x444444, 0x2a2a2a));
tick = t => { bulb.position.set(2.2 * c(t), 1.8 + 0.6 * s(t * 1.7), 2.2 * s(t)); group.rotation.y = 0.3 * s(t * 0.4); };`) }
      ]
    },
    {
      id: 'body', title: 'The body as data', label: 'Examples',
      text: 'A tracker turns a picture of a person into **joints**: points in space, a few dozen of them, thirty times a second. Once the body is numbers you can draw it, measure it, or let it push things.',
      boards: [
        { id: 'skeleton', title: '1.1 · A body in the scene', w: 800, h: 600, ground: '#141414',
          idea: 'Joints become spheres, bones become cylinders between them. This is lesson 02: the landmarks from MediaPipe go in the same places as the dancer\'s numbers. Orbit around the figure: it is in 3D, not a flat overlay.',
          pseudo: `each frame: joints = tracker(picture)    # here: dancer(t)
for each joint: move its sphere there
for each bone (a, b): stretch a cylinder from a to b`,
          three: sketch([BASE, DANCER], `const names = Object.keys(dancer(0)), dots = {}, rods = BONES.map(() => new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1, 8), new THREE.MeshStandardMaterial({ color: '#dadada' })));
names.forEach(n => { dots[n] = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 8), new THREE.MeshStandardMaterial({ color: n.endsWith('wr') ? '#f2c14e' : '#c8664f' })); scene.add(dots[n]); });
rods.forEach(r => scene.add(r)); scene.add(new THREE.GridHelper(6, 12, 0x444444, 0x2a2a2a));
tick = t => { const j = dancer(t); names.forEach(n => dots[n].position.copy(j[n])); BONES.forEach(([a, b], i) => between(rods[i], j[a], j[b])); };`) },
        { id: 'pinboard', title: '1.2 · Pinboard', w: 800, h: 600, ground: '#141414',
          idea: 'A pin screen: a grid of pins pushed up where the person is (the **mask**) and by how far they are (the **depth**). Lesson 03 gets both from models; here the dancer\'s bones are blurred into a depth map. Thousands of pins are one InstancedMesh, so it stays fast.',
          pseudo: `for each pin at (x, y):
  d = distance from (x, y) to the nearest bone
  height = smooth falloff of d          # near a bone: tall
instanced mesh: set every pin's height each frame`,
          three: sketch([BASE, DANCER], `const N = 56, pins = new THREE.InstancedMesh(new THREE.BoxGeometry(0.04, 1, 0.04), new THREE.MeshStandardMaterial({ color: '#e0a030' }), N * N), m = new THREE.Matrix4();
scene.add(pins); camera.position.set(0, 1.6, 4.4);
const seg = (p, a, b) => { const ab = b.clone().sub(a), t = Math.max(0, Math.min(1, p.clone().sub(a).dot(ab) / ab.lengthSq())); return p.distanceTo(a.clone().add(ab.multiplyScalar(t))); };
tick = t => {
  const j = dancer(t), p = V(0, 0, 0);
  for (let i = 0; i < N; i++) for (let k = 0; k < N; k++) {
    p.set((i / N - 0.5) * 2.4, k / N * 2.2 - 0.1, 0);
    let d = 9; for (const [a, b] of BONES) d = Math.min(d, seg(p, j[a].clone().setZ(0), j[b].clone().setZ(0)));
    const h = 0.02 + Math.max(0, 1 - d / 0.14) ** 1.5 * 0.5;
    m.makeScale(1, h, 1).setPosition(p.x, p.y, h / 2); pins.setMatrixAt(i * N + k, m);
  }
  pins.instanceMatrix.needsUpdate = true;
};`) },
        { id: 'metres', title: '1.3 · The body in metres', w: 800, h: 600, ground: '#141414',
          idea: 'A picture has no scale; a joint list in **metres** does. Lesson 04 fuses depth with pose so a hand is a known distance from the camera, which is what makes air instruments possible. Here, a point cloud of the body beside a two-metre ruler.',
          pseudo: `for each bone: put 40 points along it, with a little scatter
colour by height
add a 2 m ruler with a tick every half metre`,
          three: sketch([BASE, DANCER], `const per = 40, pts = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ size: 0.035, vertexColors: true }));
const pos = new Float32Array(BONES.length * per * 3), col = new Float32Array(pos.length), seed = Array.from({ length: pos.length }, () => (Math.random() - 0.5) * 0.04);
pts.geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3)); pts.geometry.setAttribute('color', new THREE.BufferAttribute(col, 3)); pts.frustumCulled = false; scene.add(pts);
const ruler = new THREE.Group(); ruler.position.set(-1.4, 0, 0); scene.add(ruler);
ruler.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([V(0, 0, 0), V(0, 2, 0)]), new THREE.LineBasicMaterial({ color: 0xf2c14e })));
for (let m = 0; m <= 4; m++) { const tk = new THREE.Mesh(new THREE.BoxGeometry(m % 2 ? 0.1 : 0.2, 0.012, 0.012), new THREE.MeshBasicMaterial({ color: 0xf2c14e })); tk.position.set(0.05, m * 0.5, 0); ruler.add(tk); }
scene.add(new THREE.GridHelper(6, 12, 0x444444, 0x2a2a2a));
const tint = new THREE.Color();
tick = t => {
  const j = dancer(t); let n = 0;
  for (const [a, b] of BONES) for (let i = 0; i < per; i++, n++) {
    const q = j[a].clone().lerp(j[b], i / per); pos[n * 3] = q.x + seed[n * 3]; pos[n * 3 + 1] = q.y + seed[n * 3 + 1]; pos[n * 3 + 2] = q.z + seed[n * 3 + 2];
    tint.setHSL(0.08 + q.y * 0.18, 0.8, 0.6); col.set([tint.r, tint.g, tint.b], n * 3);
  }
  pts.geometry.attributes.position.needsUpdate = pts.geometry.attributes.color.needsUpdate = true;
};`) }
      ]
    },
    {
      id: 'instruments', title: 'Playing the air', label: 'Examples',
      text: 'With the body in metres, the room is an instrument: beams to cut, pads to strike. Sound is a few lines of Web Audio. *Click the board once so the browser lets it make sound.*',
      boards: [
        { id: 'harp', title: '2.1 · Laser harp', w: 800, h: 600, ground: '#141414',
          idea: 'After Jean-Michel Jarre: beams stand in the air, and a hand that reaches into one **interrupts** it, starting a note; the height of the hand would sweep a filter. The beam starts at the floor and is cut at the hand, so you see the contact. Lesson 05 adds attack and release, sustain, tuning, bloom and haze.',
          pseudo: `9 beams, evenly spaced, each a note of a scale
each frame: if the right hand is within 5 cm of a beam (in x) and in the beam's plane
  cut the beam at the hand's height; if it was not cut a moment ago: start the note
else: beam reaches full height`,
          three: sketch([BASE, DANCER, AUDIO], `const scale = [0, 2, 4, 7, 9, 12, 14, 16, 19], beams = scale.map((st, i) => {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1, 8), new THREE.MeshBasicMaterial({ color: '#ff2a55', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
  m.position.x = (i - 4) * 0.28; m.hit = false; scene.add(m); return m;
});
const hand = new THREE.Mesh(new THREE.SphereGeometry(0.05), new THREE.MeshBasicMaterial({ color: '#f2c14e' })); scene.add(hand, new THREE.GridHelper(6, 12, 0x444444, 0x2a2a2a));
tick = t => {
  hand.position.set(1.2 * s(t * 0.7), 1.0 + 0.45 * s(t * 1.9), 0);   // a hand sweeping the beams (the tracker's fingertip, in the course)
  beams.forEach((b, i) => {
    const cut = Math.abs(hand.position.x - b.position.x) < 0.06, top = cut ? hand.position.y : 2.2;
    b.scale.y = top; b.position.y = top / 2;
    if (cut && !b.hit) tone(220 * 2 ** (scale[i] / 12), 0.6, 'sawtooth');
    b.hit = cut;
  });
};`) },
        { id: 'drum', title: '2.2 · Body drum', w: 800, h: 600, ground: '#141414',
          idea: 'After Laurie Anderson: pads are placed **on the body** (chest, hips, thighs) and a hit is a hand or foot that arrives fast. Speed, not just position, tells a touch from a pass. Lesson 06 adds the full pad map, a rolling score and a drum kit.',
          pseudo: `pads = chest, belly, left thigh, right thigh  (each follows the body)
each frame: for each hand and foot:
  if it is inside a pad and moving faster than a threshold, and the pad was quiet: hit
a hit flashes the pad and plays its drum`,
          three: sketch([BASE, DANCER, AUDIO], `const pads = [['neck', 'hip', 0.45, '#c8664f', 80], ['hip', 'hip', 0, '#f2c14e', 55], ['lhi', 'lkn', 0.4, '#5b7fd1', 130], ['rhi', 'rkn', 0.4, '#7fb069', 165]].map(([a, b, f, col, hz]) => {
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.13, 24, 12), new THREE.MeshStandardMaterial({ color: col, transparent: true, opacity: 0.55, emissive: col, emissiveIntensity: 0 })); m.def = { a, b, f, hz }; m.quiet = 0; scene.add(m); return m;
});
const hitters = ['lwr', 'rwr', 'lan', 'ran'], last = {}, dots = hitters.map(() => new THREE.Mesh(new THREE.SphereGeometry(0.04), new THREE.MeshBasicMaterial({ color: '#ffffff' }))); scene.add(...dots, new THREE.GridHelper(6, 12, 0x444444, 0x2a2a2a));
tick = t => {
  const j = dancer(t), dt = 1 / 60;
  pads.forEach(p => { p.position.copy(j[p.def.a]).lerp(j[p.def.b], p.def.f); p.material.emissiveIntensity *= 0.9; p.quiet -= dt; });
  hitters.forEach((h, i) => {
    const pos = j[h], v = last[h] ? pos.distanceTo(last[h]) / dt : 0; last[h] = pos.clone(); dots[i].position.copy(pos);
    for (const p of pads) if (p.quiet <= 0 && pos.distanceTo(p.position) < 0.15 && v > 0.8) { p.material.emissiveIntensity = 1.5; p.quiet = 0.25; tone(p.def.hz, 0.25, 'sine', 0.3); }
  });
};`) }
      ]
    },
    {
      id: 'costume', title: 'Dressing, drawing, painting', label: 'Examples',
      text: 'The same joints can be dressed in geometry (Schlemmer), drawn as one unbroken line (Picasso), or leave their path behind them as paint in space (Bill T. Jones and OpenEndedGroup\'s *Ghostcatching*).',
      boards: [
        { id: 'triadic', title: '3.1 · Triadic costumes', w: 800, h: 600, ground: '#141414',
          idea: 'After Oskar Schlemmer\'s Triadic Ballet: the body is a mannequin and the costume is geometry sized to its measurements: a sphere for the head, a cone for the torso, a disc at the hips, tubes for the limbs. Lesson 07 has fifteen costumes, palettes, and the motion cleaning (inertia, planted feet) that makes it usable on a live performer.',
          pseudo: `head = a sphere at the head joint
torso = a cone from hip to neck
hips = a flat disc around the hip
each limb = a tube from joint to joint, in a colour by body part`,
          three: sketch([BASE, DANCER], `const mat = col => new THREE.MeshStandardMaterial({ color: col, roughness: 0.5 });
const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 32, 16), mat('#f2c14e')), torso = new THREE.Mesh(new THREE.ConeGeometry(0.28, 1, 32, 1, true), mat('#e0869a')), disc = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.03, 40), mat('#222')), tubes = BONES.slice(3).filter((_, i) => i !== 4).map(() => new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1, 16), mat('#e8e6e1')));
torso.material.side = THREE.DoubleSide; scene.add(head, torso, disc, ...tubes, new THREE.GridHelper(6, 12, 0x444444, 0x2a2a2a));
tick = t => {
  const j = dancer(t); head.position.copy(j.head); between(torso, j.hip, j.neck); torso.scale.x = torso.scale.z = 1; disc.position.copy(j.hip);
  BONES.slice(3).filter((_, i) => i !== 4).forEach(([a, b], i) => between(tubes[i], j[a], j[b]));
};`) },
        { id: 'oneline', title: '3.2 · One line', w: 800, h: 600, ground: '#141414',
          idea: 'After Picasso: a face drawn **without lifting the pen**. The strokes (oval, brows, eyes, nose, mouth) are joined by connectors into one path, and the pen walks it. Lesson 08 builds the path from a real face mesh, orders the strokes, adds wobble and pressure, and keeps the line in 3D so you can orbit it.',
          pseudo: `strokes = oval, brows, eyes, nose, mouth    # from the face landmarks
order them so each begins near where the last ended
path = stroke, connector, stroke, connector ...
every frame: the pen advances along the path; draw what it has passed`,
          three: sketch([BASE], `const ell = (cx, cy, rx, ry, n = 40, a0 = 0, a1 = 6.283) => Array.from({ length: n + 1 }, (_, i) => V(cx + rx * c(a0 + (a1 - a0) * i / n), cy + ry * s(a0 + (a1 - a0) * i / n), 0));
const strokes = [ell(0, 1, 0.55, 0.72), ell(-0.22, 1.15, 0.11, 0.06, 20), ell(0.22, 1.15, 0.11, 0.06, 20), [V(0, 1.12, 0), V(-0.05, 0.92, 0.04), V(0.05, 0.88, 0.04)], ell(0, 0.68, 0.16, 0.07, 24, 3.4, 6.0), [V(-0.34, 1.3, 0), V(-0.1, 1.33, 0)], [V(0.1, 1.33, 0), V(0.34, 1.3, 0)]];
const path = []; strokes.forEach((st, k) => { if (k && path.length) { const a = path[path.length - 1], b = st[0]; for (let i = 1; i <= 6; i++) path.push(a.clone().lerp(b, i / 6)); } path.push(...st); });
path.forEach((p, i) => p.z = 0.15 * s(i * 0.15));
const geo = new THREE.BufferGeometry().setFromPoints(path), ink = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: '#f3efe6' })), pen = new THREE.Mesh(new THREE.SphereGeometry(0.03), new THREE.MeshBasicMaterial({ color: '#f2c14e' }));
scene.add(ink, pen); renderer.setClearColor(0x1a1a1a);
tick = t => { const n = Math.floor((t * 60) % (path.length + 120)); geo.setDrawRange(0, Math.min(n, path.length)); pen.position.copy(path[Math.min(n, path.length - 1)]); };`) },
        { id: 'paint', title: '3.3 · Paint marks', w: 800, h: 600, ground: '#141414',
          idea: 'After Ghostcatching: points on the body (hands, head, feet) leave strokes that **stay** where they were made. Pause and walk around what the dance drew. Lesson 09 turns the trails into camera-facing ribbons with a brush that is fat when slow and thin when fast, three looks, and an OBJ export for Blender.',
          pseudo: `for each marked joint: keep a trail of its recent positions
each frame: append the joint's position to its trail
draw each trail as a line; colour by joint`,
          three: sketch([BASE, DANCER], `const marks = [['lwr', '#f2c14e'], ['rwr', '#ff6a3d'], ['head', '#7fd1b9'], ['lan', '#5b7fd1'], ['ran', '#e0869a']], MAX = 900;
const trails = marks.map(([n, col]) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX * 3), 3)); g.setDrawRange(0, 0); const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color: col })); l.frustumCulled = false; scene.add(l); return { n, g, count: 0 }; });
scene.add(new THREE.GridHelper(6, 12, 0x444444, 0x2a2a2a)); camera.position.set(2.8, 1.4, 4.2);
tick = t => {
  const j = dancer(t);
  trails.forEach(tr => { const p = j[tr.n], a = tr.g.attributes.position; if (tr.count < MAX) { a.setXYZ(tr.count++, p.x, p.y, p.z); } else { a.array.copyWithin(0, 3); a.setXYZ(MAX - 1, p.x, p.y, p.z); } a.needsUpdate = true; tr.g.setDrawRange(0, tr.count); });
};`) }
      ]
    }
  ],
  bibliography: [
    { title: 'The course', width: 440, items: [
      ['threejslessons, online: the ten lessons running in the browser, with MediaPipe body tracking, depth, the real instruments and costumes', 'https://languel.github.io/threejslessons/'],
      ['threejslessons, the repository', REPO],
      ['three.js documentation', 'https://threejs.org/docs/'],
      ['three.js examples', 'https://threejs.org/examples/'],
      ['MediaPipe pose landmarker', 'https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker'],
      ['Depth Anything V2 (Yang et al., 2024)', 'https://arxiv.org/abs/2406.09414']
    ] },
    { title: 'Artists', items: [
      ['Oskar Schlemmer, Triadic Ballet (1922)', 'https://en.wikipedia.org/wiki/Triadic_Ballet'],
      ['Laurie Anderson, the body drum and the Handphone Table', 'https://en.wikipedia.org/wiki/Laurie_Anderson'],
      ['Jean-Michel Jarre and the laser harp', 'https://en.wikipedia.org/wiki/Laser_harp'],
      ['Bill T. Jones, OpenEndedGroup: Ghostcatching (1999)', 'https://openendedgroup.com/artworks/gc.html'],
      ['Picasso\'s one-line drawings', 'https://en.wikipedia.org/wiki/Pablo_Picasso']
    ] }
  ]
};

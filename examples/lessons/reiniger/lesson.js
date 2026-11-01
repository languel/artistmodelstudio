/**
 * Lecture: the silhouette film. An homage to Lotte Reiniger and The Adventures of Prince Achmed (1926), and a way to learn
 * three.js and animation by rebuilding her method: paper cut into pieces, joined at hinges, laid on a lightbox, in layers
 * of set, photographed a frame at a time. The same shape as the other lessons, built by the same scene builder
 * (examples/lessons/sampling/scene.js, as `/lesson reiniger`).
 *
 * Every drawing here is original code: nothing of Reiniger's is copied. Material from outside (a photograph, a pattern) is
 * only ever the clearly public domain kind, and its rights are written down in RIGHTS.md.
 *
 * The first section builds one scene step by step. Its boards are cut from a single program, cutout.js (the last board is
 * all of it), so what the lesson teaches is what runs.
 */
import SRC from './cutout.js?raw';

const at = marker => SRC.indexOf(marker);
const LIGHTBOX = SRC.slice(at('// --- the lightbox'), at('// --- paper'));
const PUPPET = SRC.slice(at('// --- paper'), at('// --- the set'));
const SET = SRC.slice(at('// --- the set'), at('// --- hold a piece'));
const HOLD = SRC.slice(at('// --- hold a piece'), at('// --- a walk'));

// The top of every sketch: a renderer on the board, a scene, and a camera that looks straight at it, as the film camera does.
const PRE = `import * as THREE from 'three';
const W = innerWidth, H = innerHeight, FRAME = 7;                  // FRAME: the height the camera sees, in units
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(W, H);
document.body.append(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-FRAME * W / H / 2, FRAME * W / H / 2, FRAME / 2, -FRAME / 2, 0.1, 50);
camera.position.z = 10;
let tick = () => {};
renderer.setAnimationLoop(now => { tick(now / 1000); renderer.render(scene, camera); });
`;

// The head of the full program, with the controls a board does not use taken out.
const head = (keep = []) => {
  let h = SRC.slice(0, at('// --- the lightbox'));
  if (!keep.includes('view')) h = h.replace(/^let view = .*\n/m, "const view = 'film';\n");
  if (!keep.includes('walk')) h = h.replace(/^let walk = .*\n/m, '');
  if (!keep.includes('moon')) h = h.replace(/^let moon = .*\n/m, '');
  return h;
};
const loop = (extra = '') => `
renderer.setAnimationLoop(now => {
  const t = now / 1000;
  for (const n of Object.values(node)) {
    n.group.rotation.z = n.pose;
    n.pin.visible = joints;
    n.pin.material.color.set(n === (held || over) ? 0xe0a030 : 0xffffff);
  }
  puppet.position.set(home.x, home.y, 0);
  lightbox.material.color.set(tint);
${extra}  controls.enabled = view === 'inspect';
  if (view === 'inspect') controls.update();
  renderer.render(scene, camera());
});
`;
const noMoon = code => code.replace(/^const moonDisc[\s\S]*?scene\.add\(moonDisc\);\n/m, '');
const reeds = '  reeds.children.forEach((r, i) => { r.rotation.z = 0.02 * Math.sin(t * 1.3 + i); });\n';

const HELP = `const INK = '#dadada', MUTED = '#8c8c8c', GOLD = '#f2c14e'
const label = (x, y, t, o = {}) => note(x, y, t, { color: o.color || MUTED, note: { style: 'plain', font: 'sans', size: o.size || 14, width: o.width || 200 } })
const box = (x, y, w, h, c = INK) => line(rect(x, y, w, h), { brush: 'pen', width: 2, color: c, closed: true, path: 'straight' })
const arrow = (a, b, c = MUTED) => { line([a, b], { brush: 'pen', width: 2, color: c, path: 'straight' }); line([[b[0] - 0.012, b[1] - 0.016], b, [b[0] - 0.012, b[1] + 0.016]], { brush: 'pen', width: 2, color: c, path: 'straight' }) }
`;

const BOARD = { w: 800, h: 600, ground: '#141414' };

export const LESSON = {
  title: 'The silhouette film',
  subtitle: 'Paper, hinges, a lightbox and a camera: rebuild the method behind The Adventures of Prince Achmed.',
  idea: 'In 1926 Lotte Reiniger cut a feature film out of black paper: every figure a set of pieces joined at hinges, laid on a glass table lit from below, moved a little, photographed, moved again. Here the paper is a three.js shape, the hinge is a group, the lightbox is a glowing plane and the camera is a camera: the method, in a few hundred lines you can read.',
  main: 'route',
  codePanel: true,
  sources: {},
  sections: [
    {
      id: 'build', title: 'Build the scene', label: 'Examples',
      text: 'One scene, built a piece at a time: a **lightbox**, a **piece of paper**, a **hinge**, a **puppet** of fourteen pieces, a **set** in layers, and two **cameras**: the film camera that looks straight on, and one you can orbit to see how the layers stack. Each board adds to the one before; the last is the whole program.',
      boards: [
        { id: 'route', title: '1.0 · The route', ...BOARD,
          idea: 'Seven small programs. Each keeps everything the one before had and adds one idea, in the order the paper film was made: light first, then paper, then the hinge that makes paper a puppet.',
          code: HELP + `// The route: from a glowing sheet to a walking puppet in a layered set.
const steps = ['lightbox', 'paper', 'hinge', 'puppet', 'set', 'cameras', 'walk']
steps.forEach((t, i) => {
  const x = 0.06 + (i % 4) * 0.23, y = i < 4 ? 0.2 : 0.56, c = i < 3 ? GOLD : i < 5 ? '#7fb069' : '#c8664f'
  box(x, y, 0.18, 0.22, c); label(x + 0.012, y + 0.02, '1.' + (i + 1), { color: c, size: 22, width: 90 }); label(x + 0.012, y + 0.13, t, { size: 14, width: 130 })
  if (i % 4 < 3 && i < 6) arrow([x + 0.185, y + 0.11], [x + 0.225, y + 0.11])
})
label(0.06, 0.9, 'light → paper → hinge → puppet → set → cameras → walk', { size: 16, width: 700 })` },
        { id: 'lightbox', title: '1.1 · The lightbox', ...BOARD,
          idea: 'Everything in a silhouette film is made of one thing: light that gets through or does not. Reiniger shot from above, through a glass table lit from below. A plane glowing in the middle and darker at its edges is the whole table. The colour is the tint of the film; the hot centre is where the lamp is.',
          pseudo: `lightbox = a plane, far behind everything
its picture: white in the middle, darker toward the edges
colour it with the tint (the film was dyed, a colour for each scene)`,
          three: PRE + `
// A radial gradient: bright in the middle, falling off toward the edges.
let tint = '#f0d9a0' /* color */;
let edge = 0.3 /* 0..1 */;
const glow = e => {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const g = c.getContext('2d'), r = g.createRadialGradient(256, 256, 20, 256, 256, 360);
  const k = Math.round(255 * e);
  r.addColorStop(0, '#ffffff'); r.addColorStop(0.55, '#bdbdbd'); r.addColorStop(1, 'rgb(' + k + ',' + k + ',' + k + ')');
  g.fillStyle = r; g.fillRect(0, 0, 512, 512);
  return new THREE.CanvasTexture(c);
};
const lightbox = new THREE.Mesh(new THREE.PlaneGeometry(40, 24), new THREE.MeshBasicMaterial({ map: glow(edge) }));
scene.add(lightbox);
let built = edge;
tick = () => {
  lightbox.material.color.set(tint);                              // the texture is grey light; the colour multiplies it
  if (edge !== built) { built = edge; lightbox.material.map = glow(edge); }   // a texture made from a value is made again when it changes
};` },
        { id: 'paper', title: '1.2 · A piece of paper', ...BOARD,
          idea: 'A piece of paper is a **shape**: a closed outline, made flat, filled black. Scissors cut straight lines; a curve is a few points and a smooth path through them. `smooth` turns the same points from a polygon (a cut with the scissors) into a rounded outline. Black paper over a bright plane is a silhouette.',
          pseudo: `points = the outline of a piece, in order
shape = the polygon through the points  (or a smooth curve through them)
mesh = shape, flat, filled black; put it in front of the lightbox`,
          three: PRE + `
let piece = 'slipper' /* slipper|hand|leaf */;
let smooth = false /* toggle */;
let size = 1.6 /* 0.5..3 */;
let tint = '#f0d9a0' /* color */;
const OUTLINES = {                                                // each is a handful of points
  slipper: [[-1, 0.4], [0.6, 0.15], [1.2, 0.3], [1.5, 0.9], [1.3, 0.1], [0.9, -0.4], [-1, -0.45]],
  hand: [[-0.3, 1], [0.3, 1], [0.5, 0.2], [0.9, 0], [0.55, -0.3], [0.45, -1], [-0.45, -1], [-0.5, 0.3]],
  leaf: [[-1.4, 0], [-0.4, 0.7], [0.8, 0.55], [1.5, 0], [0.8, -0.55], [-0.4, -0.7]]
};
const lightbox = new THREE.Mesh(new THREE.PlaneGeometry(40, 24), new THREE.MeshBasicMaterial({ color: tint }));
lightbox.position.z = -5;
scene.add(lightbox);
const black = new THREE.MeshBasicMaterial({ color: 0x0b0a0a, side: THREE.DoubleSide });
const cutout = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape()), black);
scene.add(cutout);
let built = '';
tick = () => {
  lightbox.material.color.set(tint);
  const key = piece + smooth + size;
  if (key === built) return;                                      // the geometry is made again only when something it depends on changed
  built = key;
  const pts = OUTLINES[piece].map(([x, y]) => new THREE.Vector2(x * size, y * size));
  const outline = smooth ? new THREE.SplineCurve([...pts, pts[0]]).getPoints(80) : pts;
  cutout.geometry.dispose();
  cutout.geometry = new THREE.ShapeGeometry(new THREE.Shape(outline));
};` },
        { id: 'hinge', title: '1.3 · A hinge', ...BOARD,
          idea: 'A hinge is a **group**: it sits at the pivot, and everything it holds turns with it. The forearm is a group inside the upper arm\'s group: turn the upper arm and the forearm swings along, turn the forearm and only it moves. Reiniger joined her pieces with thin wire. Drag a piece: it turns about its hinge to point at the pointer.',
          pseudo: `upper = a group at the shoulder, holding the upper arm piece
fore = a group at the end of the upper arm, holding the forearm piece
(fore is inside upper, so it follows when upper turns)
drag: turn the nearest piece until its far end points at the pointer`,
          three: PRE + `
let joints = true /* toggle */;
let tint = '#f0d9a0' /* color */;
const lightbox = new THREE.Mesh(new THREE.PlaneGeometry(40, 24), new THREE.MeshBasicMaterial({ color: tint }));
lightbox.position.z = -5;
scene.add(lightbox);
const black = new THREE.MeshBasicMaterial({ color: 0x0b0a0a, side: THREE.DoubleSide });
// A tapered limb hanging from the origin down to -len, rounded at both ends.
const limb = (len, w0, w1) => {
  const s = new THREE.Shape();
  s.absarc(0, 0, w0 / 2, Math.PI, 0, true); s.lineTo(w1 / 2, -len); s.absarc(0, -len, w1 / 2, 0, Math.PI, true); s.lineTo(-w0 / 2, 0);
  return s;
};
const bones = [{ len: 1.7, w: [0.36, 0.26] }, { len: 1.5, w: [0.26, 0.16] }, { len: 0.6, w: [0.16, 0.12] }];
const group = [];
bones.forEach((b, i) => {
  const g = new THREE.Group();                                    // the hinge
  g.add(new THREE.Mesh(new THREE.ShapeGeometry(limb(b.len, ...b.w), 24), black));
  const pin = new THREE.Mesh(new THREE.RingGeometry(0.06, 0.1, 24), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  pin.position.z = 0.1; g.add(pin); g.userData = { len: b.len, pin };
  if (i) { g.position.y = -bones[i - 1].len; group[i - 1].add(g); } else { g.position.set(-1.2, 1.8, 0); scene.add(g); }
  group.push(g);
});
group[0].rotation.z = 0.6; group[1].rotation.z = 0.9;           // (start bent)
// Drag: the piece whose line (hinge to far end) is nearest the pointer turns until it points at the pointer.
let held = null;
const where = e => { const r = renderer.domElement.getBoundingClientRect(); return new THREE.Vector3(((e.clientX - r.left) / r.width - 0.5) * FRAME * W / H, (0.5 - (e.clientY - r.top) / r.height) * FRAME, 0); };
const nearest = p => {
  let best = null, bd = 0.5;
  group.forEach(g => {
    const a = g.getWorldPosition(new THREE.Vector3()), b = g.localToWorld(new THREE.Vector3(0, -g.userData.len, 0));
    const ab = b.clone().sub(a), t = Math.min(1, Math.max(0, p.clone().sub(a).dot(ab) / ab.lengthSq()));
    const d = p.distanceTo(a.add(ab.multiplyScalar(t)));
    if (d < bd) { bd = d; best = g; }
  });
  return best;
};
const angleOf = g => new THREE.Euler().setFromQuaternion(g.getWorldQuaternion(new THREE.Quaternion())).z;
renderer.domElement.addEventListener('pointerdown', e => { held = nearest(where(e)); if (held) renderer.domElement.setPointerCapture(e.pointerId); });
renderer.domElement.addEventListener('pointerup', () => { held = null; });
renderer.domElement.addEventListener('pointermove', e => {
  const p = where(e);
  if (!held) { renderer.domElement.style.cursor = nearest(p) ? 'grab' : ''; return; }
  const pivot = held.getWorldPosition(new THREE.Vector3());
  const world = Math.atan2(p.y - pivot.y, p.x - pivot.x) + Math.PI / 2;       // the piece hangs down: its far end is at -90 degrees
  const parent = held.parent === scene ? 0 : angleOf(held.parent);
  held.rotation.z = Math.atan2(Math.sin(world - parent), Math.cos(world - parent));
});
tick = () => {
  lightbox.material.color.set(tint);
  group.forEach(g => { g.userData.pin.visible = joints; });
};` },
        { id: 'puppet', title: '1.4 · The puppet', ...BOARD,
          idea: 'A puppet is a table of **parts** and a loop that builds a hinge for each: where its hinge is inside its parent, its shape, how far it may turn. Fourteen pieces, two for the body, a neck, a head, and arms and legs of three pieces each. It is the hinge of the last board, many times. Drag a piece, drag the chest to bend at the waist, drag the hips to carry the puppet (Shift tilts the hips).',
          pseudo: `PARTS = a table: for each piece its parent, hinge position, shape, tip, turn limits
for each part: make a group at its hinge, put the shape in it, and the group in its parent
pose = one angle per part; every frame: group.rotation = pose
drag: a part turns about its hinge toward the pointer, within its limits`,
          three: noMoon(head() + LIGHTBOX + PUPPET + HOLD + loop()) },
        { id: 'set', title: '1.5 · A set in layers', ...BOARD,
          idea: 'The set is more paper at other depths: **tissue** hills far back, so the light comes through them dim; darker hills nearer; the ground; and foreground grasses in front of the puppet. Each layer is a flat shape at its own z. In the film the layers were sheets of glass and paper under the camera; here depth is a number.',
          pseudo: `ridge(y, amplitude, frequency) = a hilltop outline, filled below
far hills = ridge at z = -3.2, translucent (tissue: the light shows through)
near hills = ridge at z = -1.8; ground = ridge at z = -0.3
reeds = grass blades at z = +1.2, in front of the puppet`,
          three: head() + LIGHTBOX + PUPPET + SET + HOLD + loop(reeds) },
        { id: 'cameras', title: '1.6 · Two cameras', ...BOARD,
          idea: 'The film camera is **orthographic** and looks straight down the stack: no perspective, so the layers do not shift as they would with an eye. The second camera is a normal perspective one you can orbit: it shows that the picture is a pile of flat sheets. Switch `view` to inspect, then drag to orbit and wheel to zoom; switch back to film to pose the puppet.',
          pseudo: `film = orthographic camera, straight on (what the audience sees)
eye = perspective camera you can orbit (how the layers sit in depth)
view chooses which one renders; posing is only for the film camera`,
          three: head(['view']) + LIGHTBOX + PUPPET + SET + HOLD + loop(reeds) },
        { id: 'walk', title: '1.7 · A walk', ...BOARD,
          idea: 'Animation is a pose that changes. A walk is a few hinge angles driven by one sine wave: the thighs swing in opposite directions, the shins bend as the leg lifts, the arms swing against the legs. `walk` turns it on and sets how big it is; the puppet strolls across the set. Everything you posed by hand is the same thing, one frame at a time. That is what the film was.',
          pseudo: `k = walk × sin(speed × time)
thigh A swings +k, thigh B −k      (the legs are in opposite phase)
shins bend while the leg lifts; arms swing against the legs
every frame: hinge angle = the pose you set + the walk's angle`,
          three: SRC }
      ]
    }
  ],
  bibliography: [
    { title: 'The film and its maker', width: 440, items: [
      ['The Adventures of Prince Achmed (1926), on Wikipedia', 'https://en.wikipedia.org/wiki/The_Adventures_of_Prince_Achmed'],
      ['Lotte Reiniger, on Wikipedia', 'https://en.wikipedia.org/wiki/Lotte_Reiniger'],
      ['Animation Resources: Reiniger\'s Prince Achmed (portfolio of prints, Berlin 1926)', 'https://animationresources.org/category/silhouette/'],
      ['Silhouette animation, on Wikipedia', 'https://en.wikipedia.org/wiki/Silhouette_animation']
    ] },
    { title: 'Tools', items: [
      ['three.js: ShapeGeometry', 'https://threejs.org/docs/#api/en/geometries/ShapeGeometry'],
      ['three.js: OrthographicCamera', 'https://threejs.org/docs/#api/en/cameras/OrthographicCamera'],
      ['three.js: Group', 'https://threejs.org/docs/#api/en/objects/Group']
    ] }
  ]
};

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

// The whole program plus a few lines: the later sections add one idea each to the finished scene.
const WHOLE = (add, { controls = '', patch = c => c } = {}) => patch(SRC.replace(/^let tint = .*\n/m, m => m + controls)) + '\n' + add;

const BOARD = { w: 800, h: 600, ground: '#141414' };

export const LESSON = {
  title: 'The silhouette film',
  subtitle: 'Paper, hinges, a lightbox and a camera: rebuild the method behind The Adventures of Prince Achmed.',
  idea: 'In 1926 Lotte Reiniger cut a feature film out of black paper: every figure a set of pieces joined at hinges, laid on a glass table lit from below, moved a little, photographed, moved again. Here the paper is a three.js shape, the hinge is a group, the lightbox is a glowing plane and the camera is a camera: the method, in a few hundred lines you can read.',
  main: 'route',
  codePanel: true,
  folder: 'Lessons/Silhouette film',
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
    },
    {
      id: 'texture', title: 'Light, paper and texture', label: 'Examples',
      text: 'Until now every surface was a flat colour. A **texture** is a picture laid on a surface, and in a silhouette film it is how paper, light and the camera show themselves: the fibre of tissue paper, the grain of the film, the pool of a lamp. A texture is also a **mask**: a picture that says where something shows and where it does not.',
      boards: [
        { id: 'grain', title: '2.1 · Paper fibre and film grain', ...BOARD,
          idea: 'Two textures made of noise. **Fibre** is laid on the tissue hills far back, so the light comes through them unevenly like paper held up to a window. **Grain** is a sheet of black specks in front of the camera, shifted a little every frame so it boils like film. A texture made from a number is made again when the number changes. Move `fibre` and `grain`.',
          pseudo: `noise(strength) = a square picture of random greys
fibre = noise, repeated over the far hills as their texture
grain = noise as the alpha of a black sheet in front of the camera
every frame: slide the grain texture by a random amount`,
          three: WHOLE(`
// --- texture: paper fibre and film grain ---------------------------------------------------------------------------
let fibre = 0.5 /* 0..1 */;
let grain = 0.35 /* 0..1 */;
const speckle = (n, make) => {                                    // a square canvas, one random value per pixel
  const c = document.createElement('canvas'); c.width = c.height = n;
  const g = c.getContext('2d'), d = g.createImageData(n, n);
  for (let i = 0; i < d.data.length; i += 4) make(d.data, i, Math.random());
  g.putImageData(d, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
};
let fibreBuilt = -1;
const grainTex = speckle(256, (px, i, r) => { px[i] = px[i + 1] = px[i + 2] = 0; px[i + 3] = 255 * r * r; });
const grainSheet = new THREE.Mesh(new THREE.PlaneGeometry(FRAME * W / H, FRAME), new THREE.MeshBasicMaterial({ map: grainTex, transparent: true, depthTest: false }));
grainSheet.position.z = 5;
grainTex.repeat.set(4, 3);
scene.add(grainSheet);
const grainTick = () => {
  if (fibre !== fibreBuilt) {                                     // made again only when fibre changes
    fibreBuilt = fibre;
    far.material.map = speckle(128, (px, i, r) => { const v = 255 * (1 - fibre * 0.7 * r); px[i] = px[i + 1] = px[i + 2] = v; px[i + 3] = 255; });
    far.material.map.repeat.set(8, 4); far.material.needsUpdate = true;
  }
  grainSheet.material.opacity = grain;
  grainTex.offset.set(Math.random(), Math.random());              // the grain boils: a new patch of noise each frame
};
const frame = renderer.render.bind(renderer);
renderer.render = (s, c) => { grainTick(); frame(s, c); };`) },
        { id: 'lamp', title: '2.2 · A lamp, a mask', ...BOARD,
          idea: 'A **mask** is a texture used as transparency. A black sheet in front of the camera, with a soft hole in its middle, is a pool of lamplight: the hole is the mask. The hole follows the pointer, so the same scene lit from one side, then another, is a different picture. Everything outside the hole is darkened by `dark`; `size` is how wide the pool is.',
          pseudo: `mask = a picture: black in the middle (let through), white at the edges (hide), soft between
sheet = a black plane in front of the camera, using the mask as its alpha
every frame: put the sheet's hole under the pointer`,
          three: WHOLE(`
// --- a mask: a pool of lamplight ----------------------------------------------------------------------------------
let lamp = true /* toggle */;
let size = 0.8 /* 0.3..1.6 */;
let dark = 0.85 /* 0..1 */;
const maskTex = (() => {                                          // the hole is dark, the rest bright (the alpha map reads the green channel)
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d'), r = g.createRadialGradient(128, 128, 20, 128, 128, 128);
  r.addColorStop(0, '#000'); r.addColorStop(1, '#fff');
  g.fillStyle = r; g.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
})();
const night = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshBasicMaterial({ color: 0x050403, alphaMap: maskTex, transparent: true, depthTest: false }));
night.position.z = 5;
scene.add(night);
const pool = new THREE.Vector2();                                  // where the lamp is, in the film's units
renderer.domElement.addEventListener('pointermove', e => {
  const r = renderer.domElement.getBoundingClientRect();
  pool.set(((e.clientX - r.left) / r.width - 0.5) * FRAME * W / H, (0.5 - (e.clientY - r.top) / r.height) * FRAME);
});
const frame = renderer.render.bind(renderer);
renderer.render = (s, c) => {
  night.visible = lamp;
  night.material.opacity = dark;
  maskTex.center.set(0.5, 0.5);
  maskTex.repeat.setScalar(60 / (size * FRAME * 1.2));            // the sheet is huge: zoom the mask so its soft hole is size wide
  night.position.set(pool.x, pool.y, 5);
  frame(s, c);
};`) }
      ]
    },
    {
      id: 'film', title: 'Filming it', label: 'Examples',
      text: 'A silhouette film is not made by moving a puppet. It is made by **photographing** it, a frame at a time: pose, expose, pose a little differently, expose again. Played back at a dozen or two frames a second the poses become movement. Then the film itself adds its own look: tint, grain, flicker, the wobble of the gate.',
      boards: [
        { id: 'stop', title: '3.1 · Stop motion', ...BOARD,
          idea: 'Pose the puppet, press **Space**: the frame is photographed and joins the strip below. The previous frame stays faintly on top (an **onion skin**) so you see how far you moved. **P** plays the strip back at `fps`, **Backspace** drops the last frame, **O** toggles the onion skin. Reiniger worked on twos at about twelve exposures a second: a walk of a few poses is already a film.',
          pseudo: `frames = []
on Space: render the scene once, copy the picture, add it to frames
onion skin = the last frame, drawn faintly over the live view
on P: show frames[0], frames[1], … at fps, then the live view again`,
          three: WHOLE(`
// --- stop motion: photograph a pose, move, photograph again -----------------------------------------------------------
let fps = 12 /* 4..24 */;
let onion = true /* toggle */;
const frames = [];                                                  // each is a picture (a data URL)
const photo = document.createElement('img');                       // the playback screen, over the live view
const ghost = document.createElement('img');                       // the onion skin
const strip = document.createElement('div');                       // the exposure sheet: a thumbnail per frame
const layer = (el, css) => { Object.assign(el.style, { position: 'fixed', pointerEvents: 'none', ...css }); document.body.append(el); };
layer(photo, { inset: 0, width: '100%', height: '100%', objectFit: 'contain', display: 'none', background: '#111' });
layer(ghost, { inset: 0, width: '100%', height: '100%', objectFit: 'contain', opacity: 0.3, mixBlendMode: 'multiply', display: 'none' });
layer(strip, { left: '8px', right: '8px', bottom: '8px', height: '46px', display: 'flex', gap: '3px', overflow: 'hidden' });
let playing = false, playAt = 0;
const shoot = () => {                                               // render once with the hinge pins hidden, and keep the picture
  const was = joints; joints = false;
  for (const n of Object.values(node)) n.pin.visible = false;
  renderer.render(scene, camera());
  joints = was;
  const url = renderer.domElement.toDataURL('image/jpeg', 0.85);
  frames.push(url);
  const th = new Image(); th.src = url; th.style.cssText = 'height:100%;border:1px solid #555';
  strip.append(th); strip.scrollLeft = 1e6;
};
addEventListener('keydown', e => {
  if (e.target.closest?.('input, textarea')) return;
  if (e.code === 'Space') { e.preventDefault(); shoot(); }
  else if (e.code === 'Backspace' && frames.length) { frames.pop(); strip.lastChild?.remove(); }
  else if (e.code === 'KeyP') { playing = !playing; playAt = performance.now(); }
});
const live = renderer.render.bind(renderer);
renderer.render = (s, c) => {
  live(s, c);
  const last = frames[frames.length - 1];
  ghost.style.display = onion && last && !playing ? '' : 'none';
  if (ghost.src !== last && last) ghost.src = last;
  photo.style.display = playing && frames.length ? '' : 'none';
  if (playing && frames.length) photo.src = frames[Math.floor((performance.now() - playAt) / 1000 * fps) % frames.length];
};`, { patch: c => c.replace('{ antialias: true }', '{ antialias: true, preserveDrawingBuffer: true }') }) },
        { id: 'look', title: '3.2 · The look of film', ...BOARD,
          idea: 'The last step is the film itself. The scene is drawn to a **render target** (a picture in memory), and that picture goes through a **shader**: a few lines that run for every pixel. It adds **grain** (noise that changes each frame), **flicker** (the whole picture a little brighter or darker), a **weave** (the film wobbling in the gate), a **vignette** (dark corners) and **dust**. Every setting is a number; zero is a clean picture.',
          pseudo: `target = a picture the scene is drawn into
shader, for each pixel: shift by the weave, read the picture, add grain,
  multiply by the flicker and the vignette, add a speck of dust now and then
draw the result to the screen`,
          three: WHOLE(`
// --- the look of film: render to a picture, then a shader over it -----------------------------------------------------
let grain = 0.25 /* 0..1 */;
let flicker = 0.08 /* 0..0.3 */;
let weave = 0.004 /* 0..0.02 */;
let vignette = 0.6 /* 0..1 */;
let dust = 0.4 /* 0..1 */;
const target = new THREE.WebGLRenderTarget(W * 2, H * 2);
const post = new THREE.Scene(), postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const filmMat = new THREE.ShaderMaterial({
  uniforms: { tex: { value: target.texture }, time: { value: 0 }, grain: { value: 0 }, flicker: { value: 0 }, weave: { value: 0 }, vignette: { value: 0 }, dust: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: \`
    varying vec2 vUv; uniform sampler2D tex; uniform float time, grain, flicker, weave, vignette, dust;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      float frame = floor(time * 12.0);                                         // the film runs at 12 frames a second
      vec2 shift = weave * vec2(hash(vec2(frame, 1.0)) - 0.5, hash(vec2(frame, 2.0)) - 0.5);
      vec3 c = texture2D(tex, vUv + shift).rgb;
      c += grain * (hash(vUv * 900.0 + frame) - 0.5);                           // grain: new noise every frame
      c *= 1.0 + flicker * (hash(vec2(frame, 3.0)) - 0.5) * 2.0;                // flicker
      c *= 1.0 - vignette * smoothstep(0.35, 0.95, length(vUv - 0.5) * 1.4);    // dark corners
      float speck = step(0.9993, hash(floor(vUv * 220.0) + frame));             // dust: a few pale specks
      c = mix(c, vec3(0.92), speck * dust);
      gl_FragColor = vec4(c, 1.0);
    }\`
});
post.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), filmMat));
const draw = renderer.render.bind(renderer);
renderer.render = (s, c) => {
  Object.assign(filmMat.uniforms, { time: { value: performance.now() / 1000 }, grain: { value: grain }, flicker: { value: flicker }, weave: { value: weave }, vignette: { value: vignette }, dust: { value: dust } });
  renderer.setRenderTarget(target); draw(s, c);                     // the scene, into the picture
  renderer.setRenderTarget(null); draw(post, postCam);               // the picture, through the shader, to the screen
};`) }
      ]
    },
    {
      id: 'short', title: 'A short film', label: 'Examples',
      text: 'Everything so far, in sixteen seconds: the same set, the same puppet, and a story told by **keyframes**. A keyframe is a pose at a time; the frames between are made by easing from one pose to the next. A sitting figure, a rising moon, a stand, a reach, a fall. And the **rhythm** of the film: it is photographed a frame at a time and moved only between exposures, so it moves in small jumps and hesitates.',
      boards: [
        { id: 'moon', title: '4.1 · The moon', ...BOARD,
          idea: 'A figure sits on a dune and watches the moon rise. When it nears the edge of the sky he stands, reaches for it, and cannot. He lunges after it and his hand just touches it: the moon is knocked out of the frame. The sky goes black, the paper dissolves and only his hinges are left, a constellation among the stars. Stars appear as the light fades; now and then one falls. The film is a table of **keyframes**, each a pose and a time, and a function that eases between them. The puppet is moved only on each exposure, `fps` times a second (8 is on threes, as a hand-animated film is; 24 is smooth; 4 is halting), and every exposure is a little imprecise. `play` runs it (and repeats it with `loop`); turn it off and `scrub` moves through the film by hand. `view` set to inspect lets you orbit the set.',
          pseudo: `keys = [ (time, pose, hip height, tilt, step, lift), … ]    # sit, look, lean, half-stand, stand, reach, stretch, lunge, fall, drift
at the end: the moon settles on his hand and is knocked out of the frame; the sky goes black, only stars are left
every frame: t = the film's clock; exposure = floor(t × fps)
  pose = ease between the two keys around the exposure's time, plus a tiny random error
  moon = rises with t; sky colour = from the key colours at t
  paper opacity falls to 0 near the end; the hinges glow as stars; lines join them
  stars appear by their own times; a few shooting stars cross at random times`,
          three: WHOLE(`
// --- the film: a table of keyframes and a function that eases between them ---------------------------------------------
let play = true /* toggle */;
let loop = true /* toggle */;
let scrub = 0 /* 0..1 */;
let fps = 8 /* 3..24 */;                                          // exposures a second (24 is smooth; 8 is on threes; 4 is halting)
const DURATION = 16, HOLD = 2;                                      // seconds of film, and a rest before it starts again
const ease = u => u * u * (3 - 2 * u);
const BASE = { pelvis: 0, chest: 0, neck: 0, head: 0, armA: 0, foreA: 0, handA: 0, armB: 0, foreB: 0, handB: 0, thighA: 0, shinA: 0, footA: 0, thighB: 0, shinB: 0, footB: 0 };
// Poses: an angle for every hinge (0 is the rest pose; a positive angle turns a piece counter-clockwise, away from the way he faces).
const SIT = { ...BASE, neck: 0.05, head: 0.2, armA: 0.35, foreA: 2.1, handA: 0.2, armB: 0.9, foreB: 0.8, thighA: 1.75, shinA: -2.95, footA: 1.2, thighB: 1.55, shinB: -2.8, footB: 1.25 };
const LOOK = { ...SIT, neck: 0.15, head: 0.55, armA: 0.45, foreA: 1.9 };                                                          // chin up: the moon has cleared the hills
const LEAN = { ...SIT, chest: -0.2, neck: 0.1, head: 0.35, armA: 0.9, foreA: 0.5, armB: 1.0, foreB: 0.4, thighA: 1.85, shinA: -3.0 };   // a hand on each knee, to push
const HALF = { ...BASE, chest: -0.45, neck: 0.1, head: 0.3, armA: 1.0, foreA: 0.4, armB: 1.1, foreB: 0.35, thighA: 1.15, shinA: -1.8, footA: 0.65, thighB: 1.05, shinB: -1.7, footB: 0.6 };
const STAND = { ...BASE, chest: 0.03, neck: 0.05, head: 0.35, armA: 0.15, foreA: 0.25, armB: -0.15, foreB: 0.2, thighA: 0.1, shinA: -0.05, footA: -0.05, thighB: -0.1, shinB: -0.05 };
const REACH = { ...BASE, chest: -0.16, neck: 0.1, head: 0.5, armA: 2.35, foreA: 0.12, handA: 0.12, armB: -0.9, foreB: 0.3, thighA: 0.2, shinA: -0.25, footA: 0.3, thighB: -0.15, shinB: -0.05 };
const STRETCH = { ...REACH, chest: -0.26, head: 0.65, armA: 2.55, handA: 0.3, thighA: 0.3, shinA: -0.3, footA: 0.9, thighB: -0.1 };          // on tiptoe: still too far
const LUNGE = { ...BASE, chest: -0.5, neck: 0.1, head: 0.55, armA: 2.5, foreA: 0.1, armB: 2.1, foreB: 0.2, thighA: 0.75, shinA: -0.45, footA: 0.2, thighB: -0.55, shinB: -0.9, footB: 0.5 };   // a step after the moon
const FALL = { ...BASE, chest: -0.6, neck: 0.1, head: 0.5, armA: 2.7, foreA: 0.1, armB: 2.3, foreB: 0.15, thighA: 0.5, shinA: -0.2, footA: -0.2, thighB: -0.9, shinB: -1.1, footB: 0.6 };
const DRIFT = { ...FALL, chest: -0.4, armA: 2.6, armB: 2.5, thighA: 0.2, thighB: -0.4, shinB: -0.5 };
// A film made on threes: the puppet is moved, photographed, held for three frames of the 24 a second, moved again. Halting, a little
// hesitant: the keys hold (the same pose twice) where he thinks, and move quickly where he lunges.
//            time  pose    hip height  tilt   forward  lift
const KEYS = [[0, SIT, 0.14, 0, 0, 0], [3.5, LOOK, 0.14, 0, 0, 0], [5.2, LOOK, 0.14, 0, 0, 0], [6.0, LEAN, 0.14, 0, 0, 0], [6.9, LEAN, 0.14, 0, 0, 0],
  [7.7, HALF, 0.95, 0, 0, 0], [8.2, HALF, 1.0, 0, 0, 0], [9.0, STAND, 1.75, 0, 0, 0], [9.5, STAND, 1.75, 0, 0, 0], [10.2, REACH, 1.78, 0, 0, 0], [11.0, STRETCH, 1.8, 0, 0, 0],
  [11.5, STRETCH, 1.8, 0, 0, 0], [12.2, LUNGE, 1.68, -0.3, 0.7, 0], [13.0, FALL, 1.55, -0.75, 1.5, 0.15], [14.4, DRIFT, 1.5, -1.0, 2.0, 1.0], [DURATION, DRIFT, 1.5, -1.1, 2.3, 1.7]];
const track = t => {                                                // the pose, hip height, tilt, step forward and lift at time t
  let i = 0; while (i < KEYS.length - 2 && t > KEYS[i + 1][0]) i++;
  const [t0, p0, h0, r0, f0, l0] = KEYS[i], [t1, p1, h1, r1, f1, l1] = KEYS[i + 1];
  const u = ease(Math.min(1, Math.max(0, (t - t0) / (t1 - t0)))), mix = (a, b) => a + (b - a) * u;
  return { pose: Object.fromEntries(Object.keys(BASE).map(k => [k, mix(p0[k], p1[k])])), hip: mix(h0, h1), tilt: mix(r0, r1), step: mix(f0, f1), lift: mix(l0, l1) };
};
const hash = (a, b) => { const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return x - Math.floor(x); };

// The sky: colours at times, and the moon's climb.
const SKY = [[0, '#f0d9a0'], [5.5, '#e0b98e'], [9, '#b08e92'], [11.5, '#5b5a86'], [13, '#1d2750'], [14.4, '#070b1c'], [16, '#020309']].map(([t, c]) => [t, new THREE.Color(c)]);
const sky = t => { let i = 0; while (i < SKY.length - 2 && t > SKY[i + 1][0]) i++; const [a, ca] = SKY[i], [b, cb] = SKY[i + 1]; return ca.clone().lerp(cb, ease(Math.min(1, Math.max(0, (t - a) / (b - a))))); };
const dark = t => Math.min(1, Math.max(0, (t - 3) / 11));            // 0 at the start, 1 when the sky is night

home.set(-3.0, -2.35);
const dune = new THREE.Shape(); dune.moveTo(-6, -3.6); dune.quadraticCurveTo(-4.4, -2.4, -3.0, -2.4); dune.quadraticCurveTo(-1.4, -2.4, -0.2, -3.6);
scene.add(cut(dune, -0.2));
const figure = new THREE.MeshBasicMaterial({ color: 0x0b0a0a, transparent: true, side: THREE.DoubleSide });
for (const n of Object.values(node)) n.mesh.material = figure;     // the puppet's paper has a material of its own, so it can fade alone
const glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.25, 'rgba(255,255,255,0.7)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
const starMat = () => new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending });
for (const n of Object.values(node)) {                              // each hinge can glow: a star in the paper's own place
  n.star = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22), starMat());
  n.star.position.z = 0.4; n.group.add(n.star);
  n.dot = new THREE.Mesh(new THREE.CircleGeometry(0.05, 20), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 }));   // the ring fills in as the paper goes
  n.dot.position.z = 0.3; n.group.add(n.dot);
}
const lines = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, depthTest: false }));
scene.add(lines);

// Sky stars: each has a place and a time it appears. Shooting stars: a few, at random times, each a streak that fades.
let rnd = 1;
const rand = () => { rnd = (rnd * 16807) % 2147483647; return (rnd - 1) / 2147483646; };
let skyStars = [], streaks = [], run = -1;
const reseed = () => {
  rnd = 1 + Math.floor(Math.random() * 1e6);
  skyStars.forEach(m => { scene.remove(m); }); streaks.forEach(m => scene.remove(m.mesh));
  skyStars = Array.from({ length: 110 }, () => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), starMat());
    m.position.set((rand() - 0.5) * FRAME * W / H * 1.1, -0.2 + rand() * (FRAME / 2 + 0.2), -4.8);
    m.userData = { at: 2 + 10 * Math.pow(rand(), 1.4), size: 0.06 + 0.14 * rand() * rand(), twinkle: rand() * 6 };
    scene.add(m); return m;
  });
  streaks = Array.from({ length: 6 }, () => {
    const mesh = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, depthTest: false }));
    mesh.position.z = -4.7; scene.add(mesh);
    return { mesh, at: 4 + rand() * 9.5, x: (rand() - 0.2) * FRAME * W / H * 0.5, y: 0.8 + rand() * 2.4, a: -0.35 - rand() * 0.5 };
  });
};
const showSky = (t, night) => {
  for (const m of skyStars) {
    const d = m.userData, on = ease(Math.min(1, Math.max(0, (t - d.at) / 1.5))) * night;
    m.material.opacity = on * (0.65 + 0.35 * Math.sin(t * 3 + d.twinkle));
    m.scale.setScalar(d.size * (0.8 + 0.4 * Math.sin(t * 2 + d.twinkle)));
  }
  for (const s of streaks) {
    const u = (t - s.at) / 0.8;
    s.mesh.visible = u > 0 && u < 1 && night > 0.35;
    if (!s.mesh.visible) continue;
    const dx = Math.cos(s.a), dy = Math.sin(s.a), head = u * 3.4, tail = Math.max(0, head - 1.1);
    s.mesh.geometry.setFromPoints([new THREE.Vector3(s.x + dx * tail, s.y + dy * tail, 0), new THREE.Vector3(s.x + dx * head, s.y + dy * head, 0)]);
    s.mesh.material.opacity = (1 - u) * night;
  }
};

const reel = renderer.render.bind(renderer);
let startedAt = performance.now();
renderer.render = (sc, cam) => {
  const length = DURATION + HOLD;
  let t = play ? ((performance.now() - startedAt) / 1000) : scrub * DURATION;
  if (play && t > length) { if (loop) { startedAt = performance.now(); t = 0; } else t = DURATION; }
  const clock = Math.min(t, DURATION), run2 = Math.floor((performance.now() - startedAt) / 1000 / length);
  if (run !== (play ? startedAt : 0)) { run = play ? startedAt : 0; reseed(); }   // new random stars each time round
  // the puppet is photographed a frame at a time: its pose changes only on an exposure, and each is a little imprecise
  const frameNo = Math.floor(clock * fps), still = frameNo / fps;
  const k = track(still), night = dark(clock) * dark(clock) * (3 - 2 * dark(clock));
  Object.keys(k.pose).forEach((id, i) => { node[id].group.rotation.z = k.pose[id] + 0.025 * (hash(frameNo, i) - 0.5); });
  if (still > 10.2 && still < 12) node.armA.group.rotation.z += 0.035 * Math.sin(frameNo * 2.3);   // reaching: a tremble
  node.pelvis.group.position.y = k.hip;
  puppet.position.set(home.x + k.step, home.y + k.lift, 0);
  puppet.rotation.z = k.tilt;
  // the paper dissolves; the hinges become stars; lines join them
  const fade = ease(Math.min(1, Math.max(0, (clock - 12.6) / 1.5)));
  figure.opacity = 1 - fade;
  for (const n of Object.values(node)) {                              // the white hinge rings stay; they fill in and glow, and are the stars
    n.pin.visible = true; n.dot.material.opacity = fade;
    n.star.material.opacity = fade; n.star.scale.setScalar(0.4 + 1.1 * fade * (0.85 + 0.15 * Math.sin(clock * 5 + n.depth * 2)));
  }
  const pts = [];
  for (const n of Object.values(node)) if (n.parent) { pts.push(node[n.parent].group.getWorldPosition(new THREE.Vector3()), n.group.getWorldPosition(new THREE.Vector3())); }
  lines.geometry.setFromPoints(pts); lines.material.opacity = 0.5 * fade;
  // the sky, the moon, the hills' colour
  lightbox.material.color.copy(sky(clock));
  const rise = Math.min(1, Math.floor(clock * 12) / 12 / 11);        // the moon climbs on the diagonal, up and to the right (a frame at a time too)
  let mx = -0.4 + 3.6 * ease(rise), my = -1.5 + 4.7 * ease(rise);
  if (clock > 12.3) {                                                // he reaches it: it settles on his hand, and he knocks it away, out of the frame
    const hand = node.handA.group.getWorldPosition(new THREE.Vector3());
    const hold = ease(Math.min(1, (clock - 12.3) / 0.7)) * (1 - ease(Math.min(1, Math.max(0, (clock - 13) / 0.5))));
    mx += (hand.x + 0.6 - mx) * hold; my += (hand.y + 0.6 - my) * hold;
    const push = Math.pow(Math.max(0, (clock - 13) / 1.1), 2) * 10;
    mx += push * 0.8; my += push * 0.65;
  }
  moonDisc.visible = true; moonDisc.position.set(mx, my, -4.9);
  mid.material.color.setHex(0x1a1610).lerp(new THREE.Color(0x060810), night);
  showSky(clock, night);
  reel(sc, cam);
};`, { patch: c => c.replace(/^let joints = .*\n/m, 'const joints = false;\n').replace(/^let walk = .*\n/m, 'const walk = 0;\n').replace(/^let tint = .*\n/m, "const tint = '#f0d9a0';\n").replace(/^let moon = .*\n/m, 'const moon = true;\n') }) }
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

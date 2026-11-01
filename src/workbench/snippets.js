/**
 * What a new board of each kind starts with (blank: the setup a sketch needs, none of the content), and a catalog of
 * snippets to insert, built in and the user's own (kept in this browser). After Underscores' templates and examples.
 */
import { PLAYLIST_TEMPLATE } from '../process/playlist.js';

// ---- blank starts ----------------------------------------------------------------------
export const TEMPLATES = {
  drawing: `// This board's code: it makes marks on the board. Coordinates are fractions of the board.
// Drag a slider, or Cmd-drag any number. Insert a snippet from the { } button.
`,
  p5: `function setup() {
  createCanvas(windowWidth, windowHeight);
}

function draw() {
  background(20);
}
`,
  three: `import * as THREE from 'three';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(windowWidth, windowHeight);
document.body.append(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, windowWidth / windowHeight, 0.1, 100);
camera.position.z = 3;

renderer.render(scene, camera);
`,
  html: `<!doctype html>
<style>
  body { margin: 0; font: 16px/1.5 system-ui, sans-serif; color: #dadada; }
</style>
<body>

</body>
`,
  markdown: `# 

`,
  playlist: PLAYLIST_TEMPLATE
};

// ---- the catalog -----------------------------------------------------------------------
const THREE_CUBE = `import * as THREE from 'three';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(windowWidth, windowHeight);
document.body.append(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, windowWidth / windowHeight, 0.1, 100);
camera.position.z = 3;

const cube = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ color: '#e0a030' }));
scene.add(cube, new THREE.DirectionalLight('#ffffff', 3), new THREE.AmbientLight('#ffffff', 0.6));

renderer.setAnimationLoop(t => {
  cube.rotation.set(t / 1500, t / 1000, 0);
  renderer.render(scene, camera);
});
`;

const THREE_CONTROLS = `import * as THREE from 'three';

// Each comment makes a control: drag it, and the sketch changes while it runs.
const speed = 1 /* 0..5 */;
const spin = true /* toggle */
const shape = 'torus' /* box|sphere|cone|torus|cylinder */
const colors = ['#e63946', '#f1c453', '#2a9d8f', '#457b9d'] /* palette */;
const back = '#111111' /* color */;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(windowWidth, windowHeight);
document.body.append(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, windowWidth / windowHeight, 0.1, 100);
camera.position.z = 6;

const geometries = {
  box: new THREE.BoxGeometry(1, 1, 1), sphere: new THREE.SphereGeometry(0.6, 24, 16), cone: new THREE.ConeGeometry(0.6, 1.2, 24),
  torus: new THREE.TorusGeometry(0.5, 0.2, 12, 32), cylinder: new THREE.CylinderGeometry(0.5, 0.5, 1.1, 24)
};
const meshes = [0, 1, 2, 3].map(i => {
  const mesh = new THREE.Mesh(geometries.box, new THREE.MeshBasicMaterial());
  mesh.position.x = (i - 1.5) * 1.6;
  mesh.rotation.x = 0.4;
  scene.add(mesh);
  return mesh;
});

renderer.setAnimationLoop(() => {
  scene.background = new THREE.Color(back);
  meshes.forEach((mesh, i) => {
    mesh.geometry = geometries[shape];
    mesh.material.color.set(colors[i % colors.length]);
    if (spin) mesh.rotation.y += 0.02 * speed;
  });
  renderer.render(scene, camera);
});
`;

const THREE_ORBIT = `import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(windowWidth, windowHeight);
document.body.append(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, windowWidth / windowHeight, 0.1, 100);
camera.position.set(2, 2, 4);

const controls = new OrbitControls(camera, renderer.domElement);   // drag to orbit, wheel to zoom
scene.add(new THREE.GridHelper(10, 10), new THREE.AxesHelper(2));

renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});
`;

const THREE_PARTICLES = `import * as THREE from 'three';

// A control changes the variable while the sketch runs: what is built once from it has to be built again when it changes.
const count = 2000 /* 100..10000 step:100 */;
const size = 0.03 /* 0.005..0.1 step:0.005 */;
const tint = '#ffd27a' /* color */;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(windowWidth, windowHeight);
document.body.append(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, windowWidth / windowHeight, 0.1, 100);
camera.position.z = 4;

const material = new THREE.PointsMaterial({ size, color: tint });
let points, built = 0;
function build() {
  if (points) { scene.remove(points); points.geometry.dispose(); }
  const positions = new Float32Array(count * 3).map(() => (Math.random() - 0.5) * 6);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  points = new THREE.Points(geometry, material);
  scene.add(points);
  built = count;
}

renderer.setAnimationLoop(t => {
  if (count !== built) build();   // the count changed: new points
  material.size = size;
  material.color.set(tint);
  points.rotation.y = t / 8000;
  renderer.render(scene, camera);
});
`;

const P5_CIRCLE = `function setup() {
  createCanvas(windowWidth, windowHeight);
}

function draw() {
  background(20);
  noFill();
  stroke(220);
  const r = 0.35 * min(width, height) * (1 + 0.1 * sin(frameCount * 0.05));
  circle(width / 2, height / 2, 2 * r);
}
`;

const P5_CONTROLS = `// Each comment makes a control: drag it, and the sketch changes while it runs.
const count = 24 /* 3..80 step:1 */;
const wobble = 0.4 /* 0..1 */;
const rings = true /* toggle */
const palette = ['#e63946', '#f1c453', '#2a9d8f', '#457b9d'] /* palette */;
const back = '#141414' /* color */;

function setup() {
  createCanvas(windowWidth, windowHeight);
  noStroke();
}

function draw() {
  background(back);
  for (let i = 0; i < count; i++) {
    const a = (i / count) * TWO_PI + frameCount * 0.01;
    const r = min(width, height) * (0.3 + 0.1 * wobble * sin(a * 3 + frameCount * 0.03));
    fill(palette[i % palette.length]);
    circle(width / 2 + cos(a) * r, height / 2 + sin(a) * r, min(width, height) * 0.04);
  }
  if (rings) { noFill(); stroke(255, 40); circle(width / 2, height / 2, min(width, height) * 0.6); noStroke(); }
}
`;

const P5_TRAIL = `const fade = 0.15 /* 0.01..1 */;
const tint = '#ffffff' /* color */;

function setup() {
  createCanvas(windowWidth, windowHeight);
  background(20);
}

function draw() {
  noStroke();
  fill(20, 255 * fade);
  rect(0, 0, width, height);
  stroke(tint);
  strokeWeight(6);
  if (mouseIsPressed) line(pmouseX, pmouseY, mouseX, mouseY);
}
`;

const DRAWING_WAVE = `const n = 9 /* 1..40 */
for (const i of range(n)) {
  const x = 0.1 + 0.8 * i / max(1, n - 1)
  point(x, 0.5 + 0.25 * sin(i * 0.9), { size: 24, why: 'a point: a place, with tension' })
}
`;

const DRAWING_SPIRAL = `const turns = 3 /* 1..8 */
const steps = 120 /* 20..400 */
const pts = []
for (const i of range(steps)) {
  const t = i / (steps - 1)
  const a = t * turns * 2 * Math.PI
  pts.push([0.5 + 0.4 * t * cos(a), 0.5 + 0.4 * t * sin(a)])
}
line(...pts, { why: 'a line that opens as it turns' })
`;

const HTML_BUTTON = `<style>
  body { font: 16px/1.5 system-ui, sans-serif; color: #dadada; padding: 24px; }
</style>
<h1>A page</h1>
<p>Plain HTML in a sandboxed frame. <code>window.ams</code> reaches the studio.</p>
<button onclick="ams.call('ams_board', { action: 'list' }).then(r => out.textContent = r.boards.map(b => b.title).join(', '))">List the boards</button>
<p id="out"></p>
`;

const HTML_CANVAS = `<style>body { margin: 0; background: #111; } canvas { display: block; }</style>
<canvas id="c"></canvas>
<script>
  const c = document.getElementById('c'), g = c.getContext('2d');
  c.width = innerWidth; c.height = innerHeight;
  (function frame(t) {
    g.fillStyle = '#111'; g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#e0a030';
    g.beginPath(); g.arc(c.width / 2 + Math.sin(t / 700) * 120, c.height / 2, 30, 0, 7); g.fill();
    requestAnimationFrame(frame);
  })(0);
</script>
`;

const MARKDOWN_PAGE = `# A page on the canvas

Write in **Markdown**: math like $E = mc^2$, tables, callouts, diagrams.

> [!tip] Links
> [[Main]] goes to a board; ![[Main]] shows its picture.

| kind | where it runs |
| --- | --- |
| drawing | the studio |
| p5 | a frame, while live |
`;

/** Built-in snippets: { id, title, note, code } for each kind of board. */
export const SNIPPETS = {
  three: [
    { id: 'cube', title: 'A spinning cube', note: 'A scene, a camera, a light and a loop', code: THREE_CUBE },
    { id: 'controls', title: 'Controls: slider, toggle, select, colours', note: 'Each comment makes a control that changes the sketch while it runs', code: THREE_CONTROLS },
    { id: 'orbit', title: 'Orbit controls', note: 'Drag to orbit, wheel to zoom', code: THREE_ORBIT },
    { id: 'particles', title: 'Particles', note: 'Points with a size and a colour', code: THREE_PARTICLES }
  ],
  p5: [
    { id: 'circle', title: 'A breathing circle', note: 'setup and draw', code: P5_CIRCLE },
    { id: 'controls', title: 'Controls: slider, toggle, palette', note: 'Each comment makes a control that changes the sketch while it runs', code: P5_CONTROLS },
    { id: 'trail', title: 'Drawing with fading trails', note: 'Press and drag', code: P5_TRAIL }
  ],
  drawing: [
    { id: 'wave', title: 'Points on a wave', note: 'A loop of points', code: DRAWING_WAVE },
    { id: 'spiral', title: 'A spiral line', note: 'One line through computed points', code: DRAWING_SPIRAL }
  ],
  html: [
    { id: 'button', title: 'A button that asks the studio', note: 'window.ams.call', code: HTML_BUTTON },
    { id: 'canvas', title: 'A 2D canvas animation', note: 'requestAnimationFrame', code: HTML_CANVAS }
  ],
  markdown: [
    { id: 'page', title: 'A page with callouts, a table and links', note: '', code: MARKDOWN_PAGE }
  ],
  playlist: []
};

// ---- the user's own --------------------------------------------------------------------
const KEY = 'ams_snippets_v1';
const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; } };
const write = o => { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch { /* storage blocked */ } };

/** { builtin, user } for a kind of board. */
export const snippetsFor = kind => ({ builtin: SNIPPETS[kind] || [], user: read()[kind] || [] });

export function saveSnippet(kind, title, code) {
  const all = read();
  const list = all[kind] || [];
  const name = String(title || '').trim() || 'Snippet';
  const at = list.findIndex(s => s.title === name);
  const snippet = { id: at >= 0 ? list[at].id : `u${Date.now().toString(36)}`, title: name, code: String(code) };
  if (at >= 0) list[at] = snippet; else list.push(snippet);
  all[kind] = list; write(all);
  return snippet;
}

export function deleteSnippet(kind, id) {
  const all = read();
  all[kind] = (all[kind] || []).filter(s => s.id !== id);
  write(all);
}

/** Is this code just a blank start (or empty), so a snippet may replace it? */
export const isBlank = (kind, code) => {
  const t = String(code || '').trim();
  return !t || t === String(TEMPLATES[kind] || '').trim() || (SNIPPETS[kind] || []).some(s => s.code.trim() === t);
};

/**
 * Lesson 2B of the synthesis series (brief): the modular synth drawn on the canvas, and pictures that listen to it. A p5.js
 * or three.js sketch reads the patch through a global `patch` the studio sends it while the sound is on
 * (boardFrames.js, patchPlayer.pump): patch.level, .bass, .mid, .treble, .bands (8), .spectrum (32), .wave (64, scaled to its peak), .steps (each sequencer's
 * step) and patch.onNote = n => … for every note as it sounds ({ note, velocity, module, kind, channel }).
 *
 * Built by the sampling lesson's scene builder (`/lesson visuals`). `setup` draws the patch (the band: Euclid drums, a Grid
 * bass, a Steps lead, a Mixer) on the first board.
 */

// three.js: a renderer on the board, a camera you can orbit, light, and a tick(t) the sketch fills in.
const BASE = `import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
const W = innerWidth, H = innerHeight;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(W, H); renderer.setClearColor(0x141414);
document.body.append(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 100);
camera.position.set(0, 1.6, 4.8);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1, 0);
const sun = new THREE.DirectionalLight(0xffffff, 2.4); sun.position.set(2, 4, 3);
scene.add(new THREE.AmbientLight(0xffffff, 0.6), sun);
let tick = () => {};
renderer.setAnimationLoop(now => { tick(now / 1000); controls.update(); renderer.render(scene, camera); });
`;

const HOW = 'Turn the sound on (the Modular toolbar\'s power button) and press **Play** on the Timeline (Space): the sequencers play, and every sketch that reads `patch` hears them.';

export const LESSON = {
  title: 'Modular: pictures that listen',
  subtitle: 'The modular synth drawn on the canvas, and p5.js and three.js sketches that move with it: notes as events, the spectrum and the wave as numbers. Part 2B of the synthesis series.',
  idea: 'A sequencer is already a picture of time. Send its notes and its sound to a sketch and the picture plays too: an event for each note, a number for each band.',
  main: 'patch',
  codePanel: true,
  sources: {},
  sections: [
    {
      id: 'patch',
      title: 'The patch that plays',
      label: 'Patch',
      text: 'The board holds a modular synth drawn with the **Modular toolbar**: modules are boxes, cables are paths. Euclidean rings play a drum synth, a Grid plays a bass, a Steps line plays a lead through an echo, and a Mixer sends them to the Output. ' + HOW + ' Double-click a Grid cell or a Euclid ring to change the pattern while it plays; the sketches on the next boards follow.',
      boards: [
        { id: 'patch', title: '1 · A band, drawn', w: 980, h: 560, ground: '#17181b',
          idea: 'Every box is a mark: move it, scale it, duplicate it. Amber cables carry notes, teal ones sound, dashed violet ones move a setting. Each sequencer shows its playhead; an instrument\'s title lights when it plays. What the sketches read: `patch.onNote` gets every note these instruments play (its `kind` says which: DrumSynth, Synth…), and `patch.bands`, `patch.level` are the Output\'s sound.',
          pseudo: `sequencer $\\xrightarrow{\\text{notes}}$ instrument $\\xrightarrow{\\text{sound}}$ mixer $\\to$ output
each note $\\to$ patch.onNote(n) in every sketch
the output's sound $\\to$ patch.level, bass, mid, treble, bands[8], wave[64]`,
          code: `note(0.02, 0.025, 'A band drawn with the Modular toolbar. Power on, then Play (Space).', { color: '#8c8c8c', note: { style: 'plain', font: 'sans', size: 14, width: 700 } })` }
      ]
    },
    {
      id: 'p5',
      title: 'p5.js listens',
      label: 'p5.js',
      text: 'A p5.js sketch reads the patch from a global, `patch`. Two ways in: **events** (`patch.onNote = n => …` runs once for each note, as it sounds) and **numbers** (`patch.level`, `patch.bands`, `patch.spectrum`, `patch.wave`, read every frame in `draw`). Events suit things that start: a ring, a flash, a new particle. Numbers suit things that last: a size, a colour, a line. ' + HOW,
      boards: [
        { id: 'rings', title: '2.1 · Notes become rings', w: 800, h: 600, ground: '#141414',
          idea: 'Each note is a ring: across by its pitch, up by which instrument played it (drums low, the bass in the middle, the lead high), as wide as it is loud. The ground brightens with the level. Change `fade` and `grow` (the sliders), or the patch: a ring in the Euclid adds a ring here.',
          pseudo: `patch.onNote(n): rings += { x: pitch, y: instrument, size: velocity }
draw: each ring grows as $\\sqrt{age}$ and fades out
ground brightness $\\propto$ patch.level`,
          p5: `// 2.1 Every note the patch plays is a ring: across by pitch, up by instrument, as big as it is loud.
// Power on (the Modular toolbar) and Play (Space).
const fade = 1.2 /* 0.3..4 */
const grow = 1 /* 0.2..3 */
let rings = []
const HUE = { DrumSynth: 15, DrumKit: 15, Synth: 210, Karplus: 45, Sampler: 290, Granular: 160 }
const rowOf = n => (n.kind === 'DrumSynth' || n.kind === 'DrumKit' ? 480 : n.channel === 3 ? 320 : 160)

function setup() {
  createCanvas(800, 600)
  colorMode(HSB, 360, 100, 100, 1)
  // an event: once for each note, as it sounds
  patch.onNote = n => rings.push({ x: map(n.note, 24, 96, 60, 740), y: rowOf(n), v: n.velocity, h: (HUE[n.kind] ?? 120) + (n.note % 12) * 5, t: millis() })
}

function draw() {
  background(230, 30, 5 + 22 * patch.level)          // a number: read every frame
  const now = millis()
  rings = rings.filter(r => now - r.t < fade * 1000)
  noFill()
  for (const r of rings) {
    const a = (now - r.t) / (fade * 1000)
    stroke(r.h, 70, 100, 1 - a)
    strokeWeight(1 + 6 * r.v * (1 - a))
    circle(r.x, r.y, (20 + 150 * r.v * grow) * sqrt(a))
  }
  noStroke(); fill(0, 0, 55); textSize(13)
  text('lead', 20, 164); text('bass', 20, 324); text('drums', 20, 484)
  text(patch.on ? 'last note: ' + (patch.last ? patch.last.kind + ' ' + patch.last.note : '—') + '   notes so far: ' + patch.count : 'the sound is off: power on in the Modular toolbar', 20, 585)
}` },
        { id: 'spectrum', title: '2.2 · The spectrum and the wave', w: 800, h: 600, ground: '#141414',
          idea: 'The Output\'s sound as numbers, thirty times a second: eight **bands** of the spectrum (low at the left: the kick, then the bass, the lead, the hats), the **wave** itself (64 samples across, scaled to its own peak so a quiet sound still shows its shape), and a disc as big as the **bass**. `smooth` holds the numbers back a little, so they move rather than flicker.',
          pseudo: `bands[i] = the loudness between two frequencies (30, 60, 120 … 9000 Hz)
wave = 64 samples of the output, $-1..1$
shown = lerp(new, shown, smooth)`,
          p5: `// 2.2 The sound as numbers: eight bands of the spectrum (low at the left), the wave, and a disc that is the bass.
const smooth = 0.6 /* 0..0.95 */
let shown = new Array(8).fill(0), bass = 0
const NAMES = ['30', '60', '120', '250', '500', '1k', '2k', '4k']

function setup() { createCanvas(800, 600) }

function draw() {
  background(18)
  for (let i = 0; i < 8; i++) shown[i] = lerp(patch.bands[i], shown[i], smooth)
  bass = lerp(patch.bass, bass, smooth)
  noStroke()
  for (let i = 0; i < 8; i++) {
    fill(60 + i * 24, 140 + i * 8, 220 - i * 18)
    rect(60 + i * 85, 540 - shown[i] * 300, 70, shown[i] * 300, 4)
    fill(120); textSize(11); text(NAMES[i] + ' Hz', 66 + i * 85, 558)
  }
  fill(240, 180, 60, 190); circle(400, 130, 30 + bass * 220)
  stroke(230); strokeWeight(2); noFill()
  beginShape()
  patch.wave.forEach((v, i) => vertex(40 + i * 720 / 63, 240 - v * 150))
  endShape()
  noStroke(); fill(140); textSize(13)
  text('level ' + nf(patch.level, 1, 2) + '   bass ' + nf(patch.bass, 1, 2) + '   mid ' + nf(patch.mid, 1, 2) + '   treble ' + nf(patch.treble, 1, 2), 60, 588)
}` }
      ]
    },
    {
      id: 'three',
      title: 'three.js listens',
      label: 'three.js',
      text: 'The same global in a three.js sketch: `patch.onNote` to start something, `patch.bands` and `patch.bass` in the animation loop to move it, and `patch.steps` to know where each sequencer is (by its name, or its kind: `patch.steps.Euclid`). Drag to orbit. ' + HOW,
      boards: [
        { id: 'euclid3d', title: '3.1 · A Euclid in space', w: 800, h: 600, ground: '#141414',
          idea: 'Sixteen spheres in a ring are the sixteen steps of the Euclid sequencer: the one at the step being played pops when a drum hits (`patch.steps.Euclid`). The solid in the middle swells with the bass and takes its colour from the last note of the bass or the lead.',
          pseudo: `sphere i = step i of 16
patch.onNote(drum): pop the sphere at patch.steps.Euclid mod 16
core scale $= 1 + 1.6 \\cdot$ patch.bass;  colour = hue(note mod 12)`,
          three: BASE + `
const N = 16, balls = [], pops = new Array(N).fill(0);
for (let i = 0; i < N; i++) {
  const a = i / N * Math.PI * 2 - Math.PI / 2;
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.09, 20, 14), new THREE.MeshStandardMaterial({ color: '#e0a43a' }));
  m.position.set(Math.cos(a) * 1.4, 1 - Math.sin(a) * 1.4, 0);
  scene.add(m); balls.push(m);
}
const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.45, 1), new THREE.MeshStandardMaterial({ color: '#3fb3a6', flatShading: true }));
core.position.y = 1; scene.add(core);

// an event for each note: drums pop the step that is playing; other notes colour the core
patch.onNote = n => {
  if (n.kind === 'DrumSynth' || n.kind === 'DrumKit') pops[(patch.steps.Euclid ?? 0) % N] = 1 + n.velocity;
  else core.material.color.setHSL((n.note % 12) / 12, 0.65, 0.55);
};

// numbers, every frame
tick = t => {
  core.scale.setScalar(1 + patch.bass * 1.6);
  core.rotation.set(t * 0.23, t * 0.4, 0);
  balls.forEach((m, i) => {
    pops[i] *= 0.9;
    m.scale.setScalar(1 + pops[i] * 1.4);
    m.material.emissive.setRGB(pops[i] * 0.9, pops[i] * 0.5, 0);
  });
};` },
        { id: 'land', title: '3.2 · A landscape of the sound', w: 800, h: 600, ground: '#141414',
          idea: 'A spectrogram you can fly over: every other frame the spectrum (`patch.spectrum`: 32 bins from 40 Hz to 12 kHz) becomes a new row of hills at the far edge, and the rows roll towards you, so the music of the last few seconds is a landscape (low notes on the left, high on the right). Its colour warms with the bass.',
          pseudo: `row(now) = patch.spectrum (32 bins, log-spaced)
the grid's rows = the last 60 rows (the newest farthest)
height $= 1.2 \\cdot$ row[c]`,
          three: BASE + `
const COLS = 32, ROWS = 60;
const geo = new THREE.PlaneGeometry(4, 6, COLS - 1, ROWS - 1);
geo.rotateX(-Math.PI / 2);
const solid = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: '#5a8de0', flatShading: true, side: THREE.DoubleSide }));
const wire = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: '#cfe8ff', wireframe: true, transparent: true, opacity: 0.18 }));
for (const m of [solid, wire]) { m.position.set(0, 0, -2); scene.add(m); }
const hist = Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
camera.position.set(0, 3.4, 4.4); controls.target.set(0, 0.2, -1.2);
let frame = 0;

tick = t => {
  if (frame++ % 2) return;   // a new row every other frame
  hist.pop();
  hist.unshift(patch.spectrum.slice(0, COLS));   // 32 bins, 40 Hz to 12 kHz
  const pos = geo.attributes.position;
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) pos.setY(r * COLS + c, hist[r][c] * 1.2);
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  solid.material.color.setHSL(0.62 - patch.bass * 0.55, 0.6, 0.5);
};` }
      ]
    },
    {
      id: 'next',
      title: 'Your turn',
      label: 'Your turn',
      text: 'Start from any of these sketches. Ideas: give each Euclid ring its own shape in 3.1 (`n.note` says which drum: 36 kick, 38 snare, 42 hat); in 2.1 draw the Grid itself (`patch.steps.Grid` is its column); put an **LFO** on the Mixer\'s level and watch `patch.level` breathe; draw your own patch with the Modular toolbar and make one sketch that reads only the notes and one that reads only the sound. In the studio\'s own code a sketch can also follow the sound through a Timeline lane (◆ → *Follow the sound*), which works in renders too; `patch` is live, while you play.',
      boards: []
    }
  ],
  bibliography: [
    { title: 'Seeing sound', items: [
      ['Oskar Fischinger, *An Optical Poem* (1938) and the *Lumigraph*: music made visible.', 'https://en.wikipedia.org/wiki/Oskar_Fischinger'],
      ['Toshio Iwai and Yamaha, the Tenori-on (2005): a grid that is the instrument and its picture. The model of the Grid sequencer.', 'https://en.wikipedia.org/wiki/Tenori-on'],
      ['Godfried Toussaint (2005). The Euclidean algorithm generates traditional musical rhythms. *Proceedings of BRIDGES*.', 'https://archive.bridgesmathart.org/2005/bridges2005-47.html'],
      ['p5.js reference.', 'https://p5js.org/reference/'],
      ['three.js manual.', 'https://threejs.org/manual/']
    ] }
  ],

  /** The band, drawn on the first board; the tempo; the Modular toolbar shown. */
  async setup(app, ids) {
    const { addExample } = await import('../../../src/modular/examples.js'), { boardsOf } = await import('../../../src/process/boards.js');
    const b = boardsOf(app.store.doc).find(x => x.id === ids.patch);   // (the main board is the artboard: 'main')
    if (!b) return;
    // the band is about 920 × 480: scaled to the board if it is smaller
    app.store.change('the band', d => {
      const made = new Set(addExample(d, 'band', 0, 0, { board: b.id }));
      const k = Math.min(1, (b.width - 40) / 940, (b.height - 70) / 490);
      for (const e of d.elements) if (made.has(e.id)) e.points = e.points.map(([x, y, ...r]) => [b.x + 20 + x * k, b.y + 50 + y * k, ...r]);
    });
    app.player?.setSettings({ tempo: 110 });
    app.modularToolbar?.show();
  }
};

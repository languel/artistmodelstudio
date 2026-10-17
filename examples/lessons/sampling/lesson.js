/**
 * Lesson: pointillism and expressionism, by sampling.
 *
 * One idea throughout: a picture is a function from a place to a color. Sample it, and decide what
 * to draw there. Seurat decides "a dot of pure color"; Munch decides "a stroke that follows the
 * form, in the color of the feeling". Muybridge's walk makes the picture move, and the same code
 * follows it.
 *
 * Each example is a board: its code (the studio's point / line vocabulary, fractions of the board),
 * pseudocode, and a p5.js version (exported from the code, see src/process/p5code.js). Used by
 * scripts/lesson-sampling.mjs (the report) and by the scene builder in the studio.
 */

export const LESSON = {
  title: 'Pointillism and Expressionism, by sampling',
  subtitle: 'Seurat, Munch and Muybridge as sources: sample a picture, decide what to draw there.',
  sources: {
    seurat: { file: 'seurat.jpg', title: 'Georges Seurat, A Sunday on La Grande Jatte, 1884–86', commons: 'https://commons.wikimedia.org/wiki/File:A_Sunday_on_La_Grande_Jatte,_Georges_Seurat,_1884.jpg' },
    munch: { file: 'munch.jpg', title: 'Edvard Munch, The Scream, 1893', commons: 'https://commons.wikimedia.org/wiki/File:Edvard_Munch,_1893,_The_Scream,_oil,_tempera_and_pastel_on_cardboard,_91_x_73_cm,_National_Gallery_of_Norway.jpg' },
    walk: { file: 'walk.gif', title: 'Eadweard Muybridge, man walking (Animal Locomotion, 1887)', commons: 'https://commons.wikimedia.org/wiki/File:Muybridge_human_male_walking_animated.gif', animated: true }
  },
  sections: [
    {
      id: 'seeing',
      title: 'How we see',
      text: 'Before sampling pictures, how the eye samples the world. Seurat painted with the optics of his time: Chevreul on contrast, Rood on mixing light, the Young–Helmholtz idea of three receptors. Rods and cones had been seen under the microscope, and their roles guessed; the three cone pigments were only measured eighty years later. The diagrams below are drawn by code, like everything else here.',
      diagram: true,
      boards: [
        { id: 'eye', title: '0.1 · Light into the eye', w: 800, h: 600, ground: '#141414',
          idea: 'The cornea and the lens focus the light, and the picture lands upside down on the retina, a thin layer at the back of the eye with about 120 million rods and 6 million cones. Only the fovea, a small pit in the middle, sees sharply and in color.',
          code: `// Light into the eye: cornea and lens focus it; the image lands on the retina, upside down.
const INK = '#dadada', MUTED = '#8c8c8c', WARM = '#c8664f', GOLD = '#f2c14e', k = width / height
const label = (x, y, t, o = {}) => note(x, y, t, { color: o.color || MUTED, note: { style: 'plain', font: 'sans', size: 14, width: o.width || 200 } })
const cx = 0.56, cy = 0.5, r = 0.19                                        // the eye (round on the board)
const at = (a, s = 1) => [cx + Math.cos(a) * r * s, cy + Math.sin(a) * r * s * k]
line(circle(cx, cy, r, 64), { brush: 'pen', width: 2, color: INK, closed: true })
line([at(PI - 0.55), [cx - r * 1.14, cy], at(PI + 0.55)], { brush: 'pen', width: 2, color: INK })   // cornea
const lx = cx - r * 0.7
plane([[lx, cy - 0.13], [lx + 0.022, cy], [lx, cy + 0.13], [lx - 0.022, cy]], { color: '#3c3c3c' })   // lens
line([-1.1, -0.55, 0, 0.55, 1.1].map(a => at(a, 0.97)), { brush: 'pen', width: 6, color: WARM })  // retina
point(...at(0, 0.97), { size: 12, color: INK })                                                   // fovea
line([[0.07, 0.34], [0.07, 0.7]], { brush: 'pen', width: 5, color: INK, path: 'straight' })       // a candle
point(0.07, 0.29, { size: 16, color: GOLD })
// Rays: the top of the candle lands low on the retina, the bottom lands high.
line([[0.07, 0.29], [lx, cy - 0.05], at(0.6, 0.97)], { brush: 'pen', width: 1.5, color: GOLD, path: 'straight' })
line([[0.07, 0.7], [lx, cy + 0.05], at(-0.6, 0.97)], { brush: 'pen', width: 1.5, color: GOLD, path: 'straight' })
label(0.02, 0.76, 'what we look at', { width: 120 })
label(0.3, 0.07, 'cornea and lens focus the light')
label(0.77, 0.16, 'retina: about 120 million rods and 6 million cones', { color: WARM, width: 170 })
label(0.77, 0.47, 'fovea: sharp, colored vision', { color: INK, width: 160 })
label(0.46, 0.9, 'the picture lands upside down', { width: 240 })
` },
        { id: 'mosaic', title: '0.2 · The retina is pointillist', w: 800, h: 600, ground: '#141414',
          idea: 'The retina is a mosaic of separate receptors, each answering for one small spot: the eye samples the image, as our code samples a painting. In the fovea there are only cones, packed tight (and no S cones at the very center); away from it, rods take over. Rods work in dim light and see no color. Roughly six in ten cones are L, three M, and fewer than one S, and the L to M ratio varies a lot between people with normal color vision.',
          code: `// The retina is pointillist: separate receptors, each answering for one spot of the image.
const L = '#d9674e', M = '#7fb069', S = '#5b7fd1', ROD = '#555555', MUTED = '#8c8c8c', BG = '#141414'
const label = (x, y, t, o = {}) => note(x, y, t, { color: o.color || MUTED, note: { style: 'plain', font: 'sans', size: 14, width: o.width || 200, bg: BG } })
const step = 11, fovea = 110                                     // spacing and fovea radius, in pixels
const cx = width * 0.42, cy = height * 0.5
for (let row = 0; row * step * 0.87 < height; row++) for (let col = 0; col * step < width * 0.78; col++) {
  const px = col * step + (row % 2) * step / 2, py = row * step * 0.87       // a honeycomb
  const d = Math.hypot(px - cx, py - cy)
  const cone = d < fovea || random() < 0.3 * fovea / d                      // cones thin out away from the fovea
  if (!cone) { point(px / width, py / height, { size: 4, color: ROD }); continue }
  const kinds = d < fovea * 0.3 ? [L, L, M] : [L, L, L, L, L, L, M, M, M, S]  // no S cones at the very center
  point(px / width, py / height, { size: 8, color: kinds[Math.floor(random(kinds.length))] })
}
const key = [[L, 'L cones: long waves (reddish)'], [M, 'M cones: middle (green)'], [S, 'S cones: short (blue)'], [ROD, 'rods: dim light, no color']]
key.forEach(([c, t], i) => { point(0.815, 0.2 + i * 0.1, { size: 10, color: c }); label(0.835, 0.18 + i * 0.1, t, { width: 130 }) })
label(0.815, 0.66, 'fovea: cones only, packed tight', { width: 140 })
` },
        { id: 'curves', title: '0.3 · Three kinds of cones', w: 800, h: 600, ground: '#141414',
          idea: 'Each kind of cone answers to a band of the spectrum, most strongly near its peak: S near 420 nm, M near 534, L near 564 (rods near 498). One kind alone cannot tell a dim green from a bright red; color is the comparison between them. That is why three numbers can describe a color for us: trichromacy, guessed by Young in 1802 and measured in single cones in 1964. The curves here are stylized; the real ones are broader and lopsided.',
          code: `// Three kinds of cones, each most sensitive to one part of the spectrum (stylized curves).
const MUTED = '#8c8c8c', INK = '#dadada'
const label = (x, y, t, o = {}) => note(x, y, t, { color: o.color || MUTED, note: { style: 'plain', font: 'sans', size: 14, width: o.width || 120 } })
const toHex = c => '#' + c.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')
const clamp = t => Math.max(0, Math.min(1, t))
const spectrum = nm => {                                        // a wavelength as a screen color (approximate)
  const t = (a, b) => clamp((nm - a) / (b - a))
  const r = nm < 440 ? 0.6 * t(440, 380) : nm < 510 ? 0 : nm < 580 ? t(510, 580) : 1
  const g = nm < 440 ? 0 : nm < 490 ? t(440, 490) : nm < 580 ? 1 : t(645, 580)
  const b = nm < 490 ? 1 : nm < 510 ? t(510, 490) : 0
  const fade = nm < 420 ? 0.3 + 0.7 * t(380, 420) : nm > 680 ? 0.3 + 0.7 * t(740, 680) : 1
  return toHex([r, g, b].map(v => 255 * v * fade))
}
const x = nm => 0.08 + 0.84 * (nm - 380) / 340                 // 380–720 nm across the board
const y = s => 0.7 - 0.56 * s                                    // sensitivity 0..1, up
for (let nm = 380; nm < 720; nm += 10) plane(rect(x(nm), 0.76, x(nm + 10) - x(nm) + 0.002, 0.05), { color: spectrum(nm + 5), path: 'straight' })
const curve = (peak, spread) => range(25).map(i => peak - 3 * spread + i * spread / 4)
  .filter(nm => nm >= 380 && nm <= 720).map(nm => [x(nm), y(Math.exp(-(((nm - peak) / spread) ** 2) / 2))])
line(curve(498, 40), { brush: 'pen', width: 2, color: '#666666' })
line(curve(420, 26), { brush: 'pen', width: 3, color: '#5b7fd1' })
line(curve(534, 40), { brush: 'pen', width: 3, color: '#7fb069' })
line(curve(564, 44), { brush: 'pen', width: 3, color: '#d9674e' })
label(x(420) - 0.03, 0.06, 'S · 420 nm', { color: '#5b7fd1' })
label(x(498) - 0.06, 0.06, 'rods · 498', { color: '#8c8c8c' })
label(x(534) - 0.04, 0.06, 'M · 534', { color: '#7fb069' })
label(x(564) + 0.01, 0.06, 'L · 564', { color: '#d9674e' })
for (const nm of [400, 500, 600, 700]) label(x(nm) - 0.02, 0.84, nm + ' nm', { width: 80 })
` },
        { id: 'pixel', title: '0.4 · Three numbers, one pixel', w: 800, h: 600, ground: '#141414',
          idea: 'Because we have three kinds of cones, three lights can match almost any color (Maxwell showed it with spinning discs and, in 1861, a first color photograph). A screen does the same: each pixel is three small lights, red, green and blue, set by three numbers from 0 to 255. Up close they stay apart; from a distance the eye mixes them, as it mixes Seurat’s dots. A camera sensor samples the other way, through a mosaic of color filters with two greens for each red and blue (Bayer, 1976).',
          code: `// Three numbers make a color: a pixel is three lights, mixed by the eye from a distance.
const MUTED = '#8c8c8c', INK = '#dadada'
const label = (x, y, t, o = {}) => note(x, y, t, { color: o.color || MUTED, note: { style: 'plain', font: o.font || 'sans', size: 14, width: o.width || 150 } })
const toHex = c => '#' + c.map(v => Math.round(v).toString(16).padStart(2, '0')).join('')
const c = [96, 128, 60]                                            // a green from La Grande Jatte
const arrow = (x1, x2, y) => { line([[x1, y], [x2, y]], { brush: 'pen', width: 2, color: MUTED, path: 'straight' }); line([[x2 - 0.012, y - 0.03], [x2, y], [x2 - 0.012, y + 0.03]], { brush: 'pen', width: 2, color: MUTED, path: 'straight' }) }
plane(rect(0.05, 0.16, 0.17, 0.34), { color: toHex(c), path: 'straight' })
label(0.05, 0.54, 'a color is three numbers', { width: 200 })
label(0.05, 0.61, 'R 96 · G 128 · B 60', { font: 'mono', color: INK, width: 220 })
arrow(0.25, 0.33, 0.33)
c.forEach((v, i) => plane(rect(0.36 + i * 0.06, 0.16, 0.05, 0.34), { color: toHex(c.map((w, j) => (j === i ? w : 0))), path: 'straight' }))
label(0.36, 0.54, 'a pixel up close: three lights', { width: 190 })
arrow(0.56, 0.64, 0.33)
plane(rect(0.67, 0.29, 0.025, 0.08), { color: toHex(c), path: 'straight' })
label(0.67, 0.54, 'from a distance: one color, mixed by the eye', { width: 170 })
// A camera sensor: a mosaic of filters, two greens for each red and blue (Bayer, 1976).
const R = '#8a2f24', G = '#3f6e2f', B = '#2c3f78'
for (let i = 0; i < 12; i++) for (let j = 0; j < 2; j++) {
  const f = j % 2 ? (i % 2 ? B : G) : (i % 2 ? G : R)
  plane(rect(0.05 + i * 0.03, 0.74 + j * 0.055, 0.026, 0.047), { color: f, path: 'straight' })
}
label(0.44, 0.75, 'a camera sensor samples through a mosaic of filters: two greens for each red and blue', { width: 300 })
` },
        { id: 'timeline', title: '0.5 · Then and now', w: 800, h: 600, ground: '#141414',
          idea: 'What Seurat could know, and what came later. By 1886 the ideas were in place: three receptors (a theory), rods and cones (seen, their roles guessed), the pigment of the rods, contrast and the mixing of light. The cone pigments, their genes, the living mosaic and the color spaces of our screens all came in the twentieth century.',
          code: `// What Seurat could know, and what came later: a strip to scale, then the events in two columns.
const MUTED = '#8c8c8c', INK = '#dadada', WARM = '#c8664f'
const label = (x, y, t, o = {}) => note(x, y, t, { color: o.color || MUTED, note: { style: 'plain', font: o.font || 'sans', size: o.size || 13, width: o.width || 300 } })
const then = [[1802, 'Young: three kinds of receptors (a guess)'], [1839, 'Chevreul: colors change their neighbors'],
  [1855, 'Maxwell: three lights can match a color'], [1856, 'Helmholtz: Physiological Optics (to 1867)'],
  [1866, 'Schultze: rods for dim light, cones for color'], [1876, 'Boll: visual purple, the pigment of rods'],
  [1878, 'Hering: colors come in opposing pairs'], [1879, 'Rood: Modern Chromatics, which Seurat read']]
const now = [[1931, 'CIE: a standard map of the colors we see'], [1964, 'the three cone pigments measured, cone by cone'],
  [1976, 'Bayer: the color filter mosaic of camera sensors'], [1986, 'Nathans: the genes of the cone pigments'],
  [1996, 'sRGB: the colors of screens and the web'], [1999, 'Roorda and Williams: the cone mosaic of a living eye']]
// The strip: 1800 to 2000, to scale.
const x = year => 0.04 + 0.92 * (year - 1800) / 200, axis = 0.14
line([[x(1800), axis], [x(2000), axis]], { brush: 'pen', width: 2, color: '#444444', path: 'straight' })
plane(rect(x(1884), axis - 0.05, x(1886) - x(1884), 0.1), { color: WARM, path: 'straight' })
for (const [year] of then) point(x(year), axis, { size: 8, color: INK })
for (const [year] of now) point(x(year), axis, { size: 8, color: MUTED })
for (const year of [1800, 1850, 1900, 1950, 2000]) label(x(year) - 0.012, axis + 0.03, String(year), { size: 13, width: 60 })
// The columns.
label(0.04, 0.25, 'In Seurat’s time', { color: INK, size: 16 })
label(0.53, 0.25, 'Since', { color: INK, size: 16 })
label(x(1884) - 0.03, axis - 0.1, 'Seurat, 1884–86', { color: WARM, size: 13, width: 140 })
then.forEach(([year, text], i) => { label(0.04, 0.33 + i * 0.078, String(year), { font: 'mono', color: INK, width: 50 }); label(0.11, 0.33 + i * 0.078, text, { width: 290 }) })
now.forEach(([year, text], i) => { label(0.53, 0.33 + i * 0.078, String(year), { font: 'mono', color: INK, width: 50 }); label(0.6, 0.33 + i * 0.078, text, { width: 290 }) })
` }
      ]
    },
    {
      title: 'Seurat: the dot',
      text: 'Seurat built pictures from small touches of paint set side by side, and let the eye mix them at a distance. We start by asking the painting one question at a time: what color is it here?',
      boards: [
        { id: 'seurat', title: 'Seurat: the painting', source: 'seurat', w: 800, h: 600, reference: true,
          idea: 'The source, shown under the board as a reference. It is not part of the drawing: every mark that follows is made by code that samples it.' },
        { id: 'sample', title: '1 · Sample: a color at a place', source: 'seurat', w: 800, h: 600,
          idea: 'A picture is a function: give it a place, it gives back a color. Twenty-four questions, twenty-four answers, drawn as large dots. Already the composition shows through.',
          pseudo: `for each cell of a 6 × 4 grid
  c ← the painting's color at the cell's center
  draw a large dot of color c there`,
          p5expl: `// 1 · Sample: a color at a place (p5.js)
// For p5.js 2.x: upload seurat.jpg to your sketch files in editor.p5js.org
let img;

async function setup() {
  img = await loadImage('seurat.jpg');
  createCanvas(800, 600);
  img.resize(width, height);
  noLoop();
}

function draw() {
  background('#f3efe6');
  const cols = 6, rows = 4;
  const cellW = width / cols;
  const cellH = height / rows;

  noStroke();
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const x = (i + 0.5) * cellW;
      const y = (j + 0.5) * cellH;
      const c = img.get(x, y);

      fill(c);
      circle(x, y, 90);
    }
  }
}
`,
          code: `// An image is a function: give it a place, it gives a color.
const s = source('seurat')
const cols = 6 /* 2..16 */, rows = 4 /* 2..12 */
for (const i of range(cols)) for (const j of range(rows)) {
  const x = (i + 0.5) / cols, y = (j + 0.5) / rows
  point(x, y, { size: 90, color: s.color(x, y) })
}
` },
        { id: 'grid', title: '2 · Dots on a grid', source: 'seurat', w: 800, h: 600,
          idea: 'More questions, smaller dots. The size answers a second question: how dark is it here? Dark places get big dots, light places small ones, so value reads even before color.',
          pseudo: `for each cell of a fine grid
  c ← color at the cell
  v ← lightness at the cell (0 dark … 1 light)
  draw a dot of color c, larger where v is small`,
          p5expl: `// 2 · Dots on a grid (p5.js)
// For p5.js 2.x: upload seurat.jpg to your sketch files in editor.p5js.org
let img;

async function setup() {
  img = await loadImage('seurat.jpg');
  createCanvas(800, 600);
  img.resize(width, height);
  noLoop();
}

function draw() {
  background('#f3efe6');
  const cols = 60;
  const rows = Math.round(cols * height / width);
  const cellW = width / cols;
  const cellH = height / rows;

  noStroke();
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const x = (i + 0.5) * cellW;
      const y = (j + 0.5) * cellH;
      const c = img.get(x, y);

      // Lightness from 0 (dark) to 1 (light): darker places get larger dots
      const lightness = (red(c) + green(c) + blue(c)) / (3 * 255);
      const dotSize = cellW * (1.3 - lightness);

      fill(c);
      circle(x, y, dotSize);
    }
  }
}
`,
          code: `// A grid of dots: the color from the painting, the size from how dark it is.
const s = source('seurat')
const cols = 60 /* 10..120 */, rows = Math.round(cols * height / width)
const cell = width / cols
for (const i of range(cols)) for (const j of range(rows)) {
  const x = (i + 0.5) / cols, y = (j + 0.5) / rows
  point(x, y, { size: cell * (1.3 - s.value(x, y)), color: s.color(x, y) })
}
` },
        { id: 'scatter', title: '3 · Scattered dots', source: 'seurat', w: 800, h: 600,
          idea: 'Seurat did not paint on a grid. Dots at random places lose the machine look; their density, not their order, carries the picture. Change n and watch detail arrive.',
          pseudo: `repeat n times
  (x, y) ← a random place
  draw a small dot of the painting's color at (x, y)`,
          p5expl: `// 3 · Scattered dots (p5.js)
// For p5.js 2.x: upload seurat.jpg to your sketch files in editor.p5js.org
let img;

async function setup() {
  img = await loadImage('seurat.jpg');
  createCanvas(800, 600);
  img.resize(width, height);
  noLoop();
}

function draw() {
  background('#f3efe6');
  noStroke();

  for (let i = 0; i < 9000; i++) {
    const x = random(width);
    const y = random(height);
    const c = img.get(x, y);

    fill(c);
    circle(x, y, 7);
  }
}
`,
          code: `// Dots at random places: no grid, just density.
const s = source('seurat')
const n = 9000 /* 500..16000 */
for (const i of range(n)) {
  const x = random(), y = random()
  point(x, y, { size: 7, color: s.color(x, y) })
}
` },
        { id: 'divide', title: '4 · Divisionism: pure colors only', source: 'seurat', w: 800, h: 600,
          idea: 'The theory behind the dot: paint only pure colors, side by side, and let them mix in the eye. Each dot takes the nearest of eight pigments; a little noise before choosing lets neighbors differ, so the in-between colors appear only when you step back.',
          pseudo: `palette ← eight pure pigments
repeat n times
  (x, y) ← a random place
  c ← color at (x, y), nudged a little at random
  p ← the pigment in the palette closest to c
  draw a dot of pigment p at (x, y)`,
          p5expl: `// 4 · Divisionism: pure colors only (p5.js)
// For p5.js 2.x: upload seurat.jpg to your sketch files in editor.p5js.org
let img;

// Eight pure pigments
const palette = [
  [246, 240, 220], [240, 200, 60], [228, 110, 40], [190, 45, 50],
  [70, 130, 205],  [35, 60, 140],  [70, 140, 70],  [30, 40, 35]
];

async function setup() {
  img = await loadImage('seurat.jpg');
  createCanvas(800, 600);
  img.resize(width, height);
  noLoop();
}

function nearestPigment(r, g, b) {
  let best = palette[0];
  let minDiff = Infinity;
  for (const p of palette) {
    const diff = (p[0] - r) ** 2 + (p[1] - g) ** 2 + (p[2] - b) ** 2;
    if (diff < minDiff) {
      minDiff = diff;
      best = p;
    }
  }
  return best;
}

function draw() {
  background('#f3efe6');
  noStroke();

  for (let i = 0; i < 9000; i++) {
    const x = random(width);
    const y = random(height);
    const c = img.get(x, y);

    // Nudge the sampled color with random jitter
    const r = red(c) + random(-45, 45);
    const g = green(c) + random(-45, 45);
    const b = blue(c) + random(-45, 45);

    const [pr, pg, pb] = nearestPigment(r, g, b);
    fill(pr, pg, pb);
    circle(x, y, 8);
  }
}
`,
          code: `// Divisionism: only pure colors, side by side; the eye mixes them.
const s = source('seurat')
const palette = [[246, 240, 220], [240, 200, 60], [228, 110, 40], [190, 45, 50],
  [70, 130, 205], [35, 60, 140], [70, 140, 70], [30, 40, 35]]
const far = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2
const nearest = c => palette.reduce((best, p) => (far(p, c) < far(best, c) ? p : best))
const toHex = c => '#' + c.map(v => Math.round(v).toString(16).padStart(2, '0')).join('')
const n = 9000 /* 1000..16000 */, jitter = 45 /* 0..120 */
for (const i of range(n)) {
  const x = random(), y = random()
  const c = s.rgb(x, y).map(v => v + random(-jitter, jitter))
  point(x, y, { size: 8, color: toHex(nearest(c)) })
}
` }
      ]
    },
    {
      title: 'Munch: the stroke',
      text: 'Expressionism keeps the sampling but changes the answer. The mark follows the form (strokes run along the contours, where light changes least), and the color says how it feels rather than what it looks like.',
      boards: [
        { id: 'munch', title: 'Munch: the painting', source: 'munch', w: 800, h: 600, reference: true,
          idea: 'The source. Munch\'s sky and water swirl; the strokes follow the forms instead of filling them.' },
        { id: 'along', title: '5 · Strokes along the forms', source: 'munch', w: 800, h: 600,
          idea: 'Ask two more questions around each place: how does the light change to the right, and below? That is the gradient. A stroke turned a quarter from it runs along the contour. Each stroke is a short smooth curve that keeps following the form for a few steps.',
          pseudo: `repeat n times
  (x, y) ← a random place
  repeat 4 steps
    g ← how the light changes around (x, y)  (the gradient)
    a ← the direction of g, turned a quarter
    step from (x, y) a little in direction a
  draw a smooth curve through the steps, in the painting's color`,
          p5expl: `// 5 · Strokes along the forms (p5.js)
// For p5.js 2.x: upload munch.jpg to your sketch files in editor.p5js.org
let img;

async function setup() {
  img = await loadImage('munch.jpg');
  createCanvas(800, 600);
  img.resize(width, height);
  noLoop();
}

function lightnessAt(x, y) {
  const c = img.get(x, y);
  return (red(c) + green(c) + blue(c)) / (3 * 255);
}

// Direction perpendicular to the light change (along the contour)
function angleAlong(x, y) {
  const e = 8;
  const gx = lightnessAt(x + e, y) - lightnessAt(x - e, y);
  const gy = lightnessAt(x, y + e) - lightnessAt(x, y - e);
  return Math.atan2(gy, gx) + HALF_PI;
}

function draw() {
  background('#141414');
  noFill();
  strokeWeight(3);

  for (let i = 0; i < 2600; i++) {
    let x = random(width);
    let y = random(height);
    const c = img.get(x, y);
    stroke(c);

    beginShape();
    vertex(x, y);
    for (let step = 0; step < 4; step++) {
      const a = angleAlong(x, y);
      x += cos(a) * 12;
      y += sin(a) * 12;
      vertex(x, y);
    }
    endShape();
  }
}
`,
          code: `// Strokes that follow the forms: along the contours, across the change of light.
const s = source('munch')
const n = 2600 /* 200..5000 */, len = 0.016, e = 0.015
const along = (x, y) => {
  const gx = s.value(x + e, y) - s.value(x - e, y)
  const gy = s.value(x, y + e) - s.value(x, y - e)
  return Math.atan2(gy * width, gx * height) + PI / 2   // a quarter turn from the gradient
}
for (const i of range(n)) {
  let x = random(), y = random()
  const pts = [[x, y]], c = s.color(x, y)
  for (const step of range(4)) {
    const a = along(x, y)
    x += cos(a) * len
    y += sin(a) * len * width / height
    pts.push([x, y])
  }
  line(pts, { brush: 'pen', width: 3, color: c })
}
` },
        { id: 'feel', title: '6 · Color pushed toward feeling', source: 'munch', w: 800, h: 600,
          idea: 'The same strokes, but the color is pushed: away from grey (more saturated) and away from the middle (more contrast). The hues stay Munch\'s; their intensity is the feeling. Push further and likeness gives way, while the form holds because the strokes still follow it.',
          pseudo: `for each stroke (as in 5)
  c ← the painting's color where it starts
  grey ← the average of c's red, green and blue
  c ← grey + (c − grey) × saturation      (further from grey)
  c ← middle + (c − middle) × contrast     (further from the middle)
  draw the stroke wider, in color c`,
          p5expl: `// 6 · Color pushed toward feeling (p5.js)
// For p5.js 2.x: upload munch.jpg to your sketch files in editor.p5js.org
let img;

async function setup() {
  img = await loadImage('munch.jpg');
  createCanvas(800, 600);
  img.resize(width, height);
  noLoop();
}

function lightnessAt(x, y) {
  const c = img.get(x, y);
  return (red(c) + green(c) + blue(c)) / (3 * 255);
}

function angleAlong(x, y) {
  const e = 8;
  const gx = lightnessAt(x + e, y) - lightnessAt(x - e, y);
  const gy = lightnessAt(x, y + e) - lightnessAt(x, y - e);
  return Math.atan2(gy, gx) + HALF_PI;
}

// Push color: further from grey (saturation) and further from middle (contrast)
function pushColor(c) {
  const r = red(c), g = green(c), b = blue(c);
  const grey = (r + g + b) / 3;
  const saturation = 2.2;
  const contrast = 1.4;
  const pushChannel = v => 128 + (grey + (v - grey) * saturation - 128) * contrast;
  return color(pushChannel(r), pushChannel(g), pushChannel(b));
}

function draw() {
  background('#141414');
  noFill();
  strokeWeight(5);

  for (let i = 0; i < 1800; i++) {
    let x = random(width);
    let y = random(height);
    const c = pushColor(img.get(x, y));
    stroke(c);

    beginShape();
    vertex(x, y);
    for (let step = 0; step < 4; step++) {
      const a = angleAlong(x, y);
      x += cos(a) * 14;
      y += sin(a) * 14;
      vertex(x, y);
    }
    endShape();
  }
}
`,
          code: `// Push the color: further from grey, further from the middle. The hues stay; the feeling grows.
const s = source('munch')
const saturation = 2.2 /* 1..4 */, contrast = 1.4 /* 1..3 */
const push = ([r, g, b]) => {
  const grey = (r + g + b) / 3
  return [r, g, b].map(v => 128 + (grey + (v - grey) * saturation - 128) * contrast)
}
const toHex = c => '#' + c.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')
const n = 1800 /* 200..5000 */, len = 0.018, e = 0.015
const along = (x, y) => {
  const gx = s.value(x + e, y) - s.value(x - e, y)
  const gy = s.value(x, y + e) - s.value(x, y - e)
  return Math.atan2(gy * width, gx * height) + PI / 2
}
for (const i of range(n)) {
  let x = random(), y = random()
  const pts = [[x, y]], c = toHex(push(s.rgb(x, y)))
  for (const step of range(4)) {
    const a = along(x, y)
    x += cos(a) * len
    y += sin(a) * len * width / height
    pts.push([x, y])
  }
  line(pts, { brush: 'pen', width: 5, color: c })
}
` }
      ]
    },
    {
      title: 'Muybridge: the picture moves',
      text: 'Muybridge photographed motion frame by frame. As a source, the walk is a picture that changes; the board follows it, running its code again on every new frame. Nothing in the code changes: the same questions, asked of a moving picture.',
      boards: [
        { id: 'walk', title: 'Muybridge: the walk', source: 'walk', w: 800, h: 600, reference: true, live: true, fit: 'contain',
          idea: 'The source: an animated sequence from Animal Locomotion (1887). Shown under the board; it plays while the board is live.' },
        { id: 'walkdots', title: '7 · A pointillist walk', source: 'walk', w: 800, h: 600, follow: true,
          idea: 'The photograph is a light figure on a dark ground. Dots go only where it is light, larger where lighter: the figure is made of density alone, drawn in ink on paper, and it walks because the board follows its source.',
          pseudo: `every frame of the walk:
  repeat n times
    (x, y) ← a random place
    v ← lightness at (x, y)
    if v is light enough: draw a dot there, larger where lighter`,
          p5expl: `// 7 · A pointillist walk (p5.js)
// For p5.js 2.x: upload walk.gif to your sketch files in editor.p5js.org
// (a GIF is read as its first frame here: the studio version follows the walk)
let gif;

async function setup() {
  gif = await loadImage('walk.gif');
  createCanvas(800, 600);
}

function draw() {
  background('#f3efe6');
  noStroke();
  fill('#1d1b19');

  // Center the walking figure on the canvas
  const scale = min(width / gif.width, height / gif.height);
  const ox = (width - gif.width * scale) / 2;
  const oy = (height - gif.height * scale) / 2;

  for (let i = 0; i < 8000; i++) {
    const x = random(width);
    const y = random(height);

    // Map canvas coordinate to GIF pixel coordinate
    const gx = (x - ox) / scale;
    const gy = (y - oy) / scale;
    if (gx < 0 || gy < 0 || gx >= gif.width || gy >= gif.height) continue;

    const c = gif.get(gx, gy);
    const lightness = (red(c) + green(c) + blue(c)) / (3 * 255);

    if (lightness > 0.3) {
      const dotSize = 2 + 8 * (lightness - 0.3);
      circle(x, y, dotSize);
    }
  }
}
`,
          code: `// Dots where it is light: the figure is density alone. The board follows the walk.
const s = source('walk', { fit: 'contain' })
const n = 12000 /* 1000..20000 */, light = 0.3 /* 0.1..0.9 */
for (const i of range(n)) {
  const x = random(), y = random(), v = s.value(x, y)
  if (v > light) point(x, y, { size: 2 + 8 * (v - light), color: '#1d1b19' })
}
` },
        { id: 'walkfeel', title: '8 · An expressionist walk', source: 'walk', w: 800, h: 600, follow: true, ground: '#1b2a6b',
          idea: 'The strokes of example 5 on the moving figure, with a stronger push: a grey photograph has no color to exaggerate, so lightness picks a place on a ramp from hot red to light yellow, and the ground itself is the cold blue. Strokes go only where the figure is, so it burns on a cold ground, frame after frame.',
          pseudo: `ramp ← hot red → light yellow;  paper ← cold blue
every frame of the walk:
  for each stroke (as in 5)
    skip it where the photograph is dark (the ground stays cold blue)
    follow the form for a few steps
    color it by the lightness where it starts, on the ramp`,
          p5expl: `// 8 · An expressionist walk (p5.js)
// For p5.js 2.x: upload walk.gif to your sketch files in editor.p5js.org
// (a GIF is read as its first frame here: the studio version follows the walk)
let gif;

async function setup() {
  gif = await loadImage('walk.gif');
  createCanvas(800, 600);
}

function draw() {
  background('#1b2a6b'); // Cold blue ground
  noFill();
  strokeWeight(6);

  const scale = min(width / gif.width, height / gif.height);
  const ox = (width - gif.width * scale) / 2;
  const oy = (height - gif.height * scale) / 2;

  const hot = color(214, 68, 43);
  const light = color(242, 213, 120);

  for (let i = 0; i < 1800; i++) {
    let x = random(width);
    let y = random(height);

    const gx = (x - ox) / scale;
    const gy = (y - oy) / scale;
    if (gx < 0 || gy < 0 || gx >= gif.width || gy >= gif.height) continue;

    const c = gif.get(gx, gy);
    const v = (red(c) + green(c) + blue(c)) / (3 * 255);
    if (v < 0.25) continue; // Dark background remains cold blue

    // Stroke color from hot red to light yellow
    const strokeColor = lerpColor(hot, light, (v - 0.25) / 0.75);
    stroke(strokeColor);

    // Gradient direction from neighboring pixels
    const eps = 4;
    const cR = gif.get(gx + eps, gy), cL = gif.get(gx - eps, gy);
    const cD = gif.get(gx, gy + eps), cU = gif.get(gx, gy - eps);
    const gxVal = ((red(cR) + green(cR) + blue(cR)) - (red(cL) + green(cL) + blue(cL))) / (3 * 255);
    const gyVal = ((red(cD) + green(cD) + blue(cD)) - (red(cU) + green(cU) + blue(cU))) / (3 * 255);
    const angle = Math.atan2(gyVal, gxVal) + HALF_PI;

    beginShape();
    vertex(x, y);
    for (let step = 0; step < 3; step++) {
      x += cos(angle) * 16;
      y += sin(angle) * 16;
      vertex(x, y);
    }
    endShape();
  }
}
`,
          code: `// Example 5 on a moving source: hot strokes on the figure, a cold ground. The board follows the walk.
const s = source('walk', { fit: 'contain' })
const hot = [214, 68, 43], light = [242, 213, 120]   // the paper is the cold blue
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t)
const toHex = c => '#' + c.map(v => Math.round(v).toString(16).padStart(2, '0')).join('')
const n = 2500 /* 500..6000 */, len = 0.02, e = 0.01
const along = (x, y) => {
  const gx = s.value(x + e, y) - s.value(x - e, y)
  const gy = s.value(x, y + e) - s.value(x, y - e)
  return Math.atan2(gy * width, gx * height) + PI / 2
}
for (const i of range(n)) {
  let x = random(), y = random()
  const v = s.value(x, y)
  if (v < 0.25) continue                      // the ground: left cold
  const pts = [[x, y]], c = toHex(mix(hot, light, (v - 0.25) / 0.75))
  for (const step of range(3)) {
    const a = along(x, y)
    x += cos(a) * len
    y += sin(a) * len * width / height
    pts.push([x, y])
  }
  line(pts, { brush: 'pen', width: 6, color: c })
}
` }
      ]
    },
    {
      title: 'The body as a source',
      text: 'A model can answer other questions about a picture: where is the body, where are its shoulders, elbows, knees? In the studio MediaPipe finds 33 points; in p5.js, ml5.js does the same (bodyPose with the BlazePose model gives the same 33 points). The points move with the walk, so the drawing does too.',
      ml5: true,
      boards: [
        { id: 'gesture', title: '9 · Pose: a gesture drawing', source: 'walk', w: 800, h: 600, follow: true,
          idea: 'source().pose is a list of people, each 33 points. Join the points of each limb (shoulder, elbow, wrist; hip, knee, ankle, foot) with one smooth line: not a skeleton of sticks, but a gesture drawing, the few lines that carry the movement.',
          pseudo: `every frame of the walk:
  for each person the model finds
    for each limb (two arms, two legs, the torso)
      draw one smooth line through its points
    draw the head as a dot at the nose`,
          code: `// The body as a source: 33 points per person. Each limb becomes one smooth line.
const s = source('walk', { fit: 'contain' })
const limbs = [[11, 13, 15], [12, 14, 16],             // arms: shoulder, elbow, wrist
  [23, 25, 27, 31], [24, 26, 28, 32],                    // legs: hip, knee, ankle, foot
  [11, 12, 24, 23, 11]]                                  // the torso, around
for (const p of s.pose) {
  for (const limb of limbs) line(limb.map(i => [p[i].x, p[i].y]), { brush: 'pen', width: 9, color: '#c0392b' })
  point(p[0].x, p[0].y, { size: 44, color: '#c0392b' })
}
` },
        { id: 'bodybrush', title: '10 · A brush that samples: Seurat on the body', source: 'walk', w: 800, h: 600, follow: true,
          idea: 'A brush is a function too: it walks along a mark and decides what to put down. This one stamps dots across the line, colored from Seurat\'s painting at each place. The walk gives the lines, the painting gives the color: two sources, one drawing.',
          pseudo: `brush "seurat": for each step along a line
  (x, y) ← the step, moved a little across the line at random
  draw a dot there, in the color of the painting at (x, y)
every frame of the walk:
  draw each limb as a line with the brush "seurat"`,
          code: `// A brush is a function: walk along the mark, stamp dots colored from another picture.
brush({
  id: 'seurat', label: 'Seurat', roles: ['line'], doc: 'Dots along the line, colored from a painting.',
  params: { size: [2, 30, 10, 'Dot size'], spread: [0, 60, 26, 'How far dots stray across the line'] },
  draw(ctx, e, p, k) {
    const painting = k.source('seurat')
    for (const f of k.frames(e, 24)) {
      const across = (k.rng() - 0.5) * p.spread
      const x = f.x + f.nx * across, y = f.y + f.ny * across
      ctx.fillStyle = painting.colorAt(x, y)
      ctx.beginPath()
      ctx.arc(x, y, p.size / 2, 0, Math.PI * 2)
      ctx.fill()
    }
  }
})
const s = source('walk', { fit: 'contain' })
const limbs = [[11, 13, 15], [12, 14, 16], [23, 25, 27, 31], [24, 26, 28, 32], [11, 12, 24, 23, 11]]
for (const p of s.pose) for (const limb of limbs) line(limb.map(i => [p[i].x, p[i].y]), { brush: 'seurat' })
` }
      ]
    }
  ]
};

/** Sources of the pictures and of the history, with links (DOIs checked). */
export const BIBLIOGRAPHY = {
  pictures: [
    ['Georges Seurat, *A Sunday on La Grande Jatte*, 1884–86. Art Institute of Chicago.', 'https://commons.wikimedia.org/wiki/File:A_Sunday_on_La_Grande_Jatte,_Georges_Seurat,_1884.jpg'],
    ['Edvard Munch, *The Scream*, 1893. National Gallery of Norway.', 'https://commons.wikimedia.org/wiki/File:Edvard_Munch,_1893,_The_Scream,_oil,_tempera_and_pastel_on_cardboard,_91_x_73_cm,_National_Gallery_of_Norway.jpg'],
    ['Eadweard Muybridge, man walking, from *Animal Locomotion*, 1887 (animated).', 'https://commons.wikimedia.org/wiki/File:Muybridge_human_male_walking_animated.gif']
  ],
  history: [
    ['Thomas Young (1802). On the theory of light and colours. *Philosophical Transactions of the Royal Society* 92, 12–48.', 'https://doi.org/10.1098/rstl.1802.0004'],
    ['Michel Eugène Chevreul (1839). *De la loi du contraste simultané des couleurs*. Paris: Pitois-Levrault.', 'https://en.wikipedia.org/wiki/Michel_Eug%C3%A8ne_Chevreul'],
    ['James Clerk Maxwell (1855, published 1857). Experiments on colour, as perceived by the eye. *Transactions of the Royal Society of Edinburgh* 21(2), 275–298.', 'https://doi.org/10.1017/S0080456800032117'],
    ['Hermann von Helmholtz (1856–1867). *Handbuch der physiologischen Optik*. Leipzig: Voss.', 'https://en.wikipedia.org/wiki/Hermann_von_Helmholtz'],
    ['Max Schultze (1866). Zur Anatomie und Physiologie der Retina. *Archiv für mikroskopische Anatomie* 2, 175–286.', 'https://doi.org/10.1007/BF02962033'],
    ['Franz Boll (1876). Zur Anatomie und Physiologie der Retina: visual purple (rhodopsin) in the rods.', 'https://en.wikipedia.org/wiki/Franz_Christian_Boll'],
    ['Ewald Hering (1878). *Zur Lehre vom Lichtsinne*. Vienna: Gerold. The opponent colors.', 'https://en.wikipedia.org/wiki/Opponent_process'],
    ['Ogden Rood (1879). *Modern Chromatics*. New York: Appleton. Read by Seurat.', 'https://en.wikipedia.org/wiki/Ogden_Rood'],
    ['CIE (1931). The CIE 1931 color space.', 'https://en.wikipedia.org/wiki/CIE_1931_color_space'],
    ['W. B. Marks, W. H. Dobelle, E. F. MacNichol (1964). Visual pigments of single primate cones. *Science* 143, 1181–1183.', 'https://doi.org/10.1126/science.143.3611.1181'],
    ['P. K. Brown, G. Wald (1964). Visual pigments in single rods and cones of the human retina. *Science* 144, 45–52.', 'https://doi.org/10.1126/science.144.3614.45'],
    ['Bryce E. Bayer (1976). Color imaging array. US Patent 3,971,065.', 'https://patents.google.com/patent/US3971065A'],
    ['J. Nathans, D. Thomas, D. S. Hogness (1986). Molecular genetics of human color vision: the genes encoding blue, green, and red pigments. *Science* 232, 193–202.', 'https://doi.org/10.1126/science.2937147'],
    ['M. Stokes, M. Anderson, S. Chandrasekar, R. Motta (1996). A standard default color space for the Internet: sRGB.', 'https://www.w3.org/Graphics/Color/sRGB'],
    ['A. Roorda, D. R. Williams (1999). The arrangement of the three cone classes in the living human eye. *Nature* 397, 520–522.', 'https://doi.org/10.1038/17383']
  ]
};

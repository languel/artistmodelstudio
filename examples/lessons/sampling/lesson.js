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
      title: 'Seurat: the dot',
      text: 'Seurat built pictures from small touches of paint set side by side, and let the eye mix them at a distance. We start by asking the painting one question at a time: what color is it here?',
      boards: [
        { id: 'seurat', title: 'Seurat: the painting', source: 'seurat', w: 750, h: 500, reference: true,
          idea: 'The source, shown under the board as a reference. It is not part of the drawing: every mark that follows is made by code that samples it.' },
        { id: 'sample', title: '1 · Sample: a color at a place', source: 'seurat', w: 750, h: 500,
          idea: 'A picture is a function: give it a place, it gives back a color. Twenty-four questions, twenty-four answers, drawn as large dots. Already the composition shows through.',
          pseudo: `for each cell of a 6 × 4 grid
  c ← the painting's color at the cell's center
  draw a large dot of color c there`,
          code: `// An image is a function: give it a place, it gives a color.
const s = source('seurat')
const cols = 6 /* 2..16 */, rows = 4 /* 2..12 */
for (const i of range(cols)) for (const j of range(rows)) {
  const x = (i + 0.5) / cols, y = (j + 0.5) / rows
  point(x, y, { size: 90, color: s.color(x, y) })
}
` },
        { id: 'grid', title: '2 · Dots on a grid', source: 'seurat', w: 750, h: 500,
          idea: 'More questions, smaller dots. The size answers a second question: how dark is it here? Dark places get big dots, light places small ones, so value reads even before color.',
          pseudo: `for each cell of a fine grid
  c ← color at the cell
  v ← lightness at the cell (0 dark … 1 light)
  draw a dot of color c, larger where v is small`,
          code: `// A grid of dots: the color from the painting, the size from how dark it is.
const s = source('seurat')
const cols = 60 /* 10..120 */, rows = Math.round(cols * height / width)
const cell = width / cols
for (const i of range(cols)) for (const j of range(rows)) {
  const x = (i + 0.5) / cols, y = (j + 0.5) / rows
  point(x, y, { size: cell * (1.3 - s.value(x, y)), color: s.color(x, y) })
}
` },
        { id: 'scatter', title: '3 · Scattered dots', source: 'seurat', w: 750, h: 500,
          idea: 'Seurat did not paint on a grid. Dots at random places lose the machine look; their density, not their order, carries the picture. Change n and watch detail arrive.',
          pseudo: `repeat n times
  (x, y) ← a random place
  draw a small dot of the painting's color at (x, y)`,
          code: `// Dots at random places: no grid, just density.
const s = source('seurat')
const n = 9000 /* 500..16000 */
for (const i of range(n)) {
  const x = random(), y = random()
  point(x, y, { size: 7, color: s.color(x, y) })
}
` },
        { id: 'divide', title: '4 · Divisionism: pure colors only', source: 'seurat', w: 750, h: 500,
          idea: 'The theory behind the dot: paint only pure colors, side by side, and let them mix in the eye. Each dot takes the nearest of eight pigments; a little noise before choosing lets neighbors differ, so the in-between colors appear only when you step back.',
          pseudo: `palette ← eight pure pigments
repeat n times
  (x, y) ← a random place
  c ← color at (x, y), nudged a little at random
  p ← the pigment in the palette closest to c
  draw a dot of pigment p at (x, y)`,
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
        { id: 'munch', title: 'Munch: the painting', source: 'munch', w: 480, h: 596, reference: true,
          idea: 'The source. Munch\'s sky and water swirl; the strokes follow the forms instead of filling them.' },
        { id: 'along', title: '5 · Strokes along the forms', source: 'munch', w: 480, h: 596,
          idea: 'Ask two more questions around each place: how does the light change to the right, and below? That is the gradient. A stroke turned a quarter from it runs along the contour. Each stroke is a short smooth curve that keeps following the form for a few steps.',
          pseudo: `repeat n times
  (x, y) ← a random place
  repeat 4 steps
    g ← how the light changes around (x, y)  (the gradient)
    a ← the direction of g, turned a quarter
    step from (x, y) a little in direction a
  draw a smooth curve through the steps, in the painting's color`,
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
        { id: 'feel', title: '6 · Color pushed toward feeling', source: 'munch', w: 480, h: 596,
          idea: 'The same strokes, but the color is pushed: away from grey (more saturated) and away from the middle (more contrast). The hues stay Munch\'s; their intensity is the feeling. Push further and likeness gives way, while the form holds because the strokes still follow it.',
          pseudo: `for each stroke (as in 5)
  c ← the painting's color where it starts
  grey ← the average of c's red, green and blue
  c ← grey + (c − grey) × saturation      (further from grey)
  c ← middle + (c − middle) × contrast     (further from the middle)
  draw the stroke wider, in color c`,
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
        { id: 'walk', title: 'Muybridge: the walk', source: 'walk', w: 360, h: 640, reference: true, live: true,
          idea: 'The source: an animated sequence from Animal Locomotion (1887). Shown under the board; it plays while the board is live.' },
        { id: 'walkdots', title: '7 · A pointillist walk', source: 'walk', w: 360, h: 640, follow: true,
          idea: 'The photograph is a light figure on a dark ground. Dots go only where it is light, larger where lighter: the figure is made of density alone, drawn in ink on paper, and it walks because the board follows its source.',
          pseudo: `every frame of the walk:
  repeat n times
    (x, y) ← a random place
    v ← lightness at (x, y)
    if v is light enough: draw a dot there, larger where lighter`,
          code: `// Dots where it is light: the figure is density alone. The board follows the walk.
const s = source('walk')
const n = 12000 /* 1000..20000 */, light = 0.3 /* 0.1..0.9 */
for (const i of range(n)) {
  const x = random(), y = random(), v = s.value(x, y)
  if (v > light) point(x, y, { size: 2 + 8 * (v - light), color: '#1d1b19' })
}
` },
        { id: 'walkfeel', title: '8 · An expressionist walk', source: 'walk', w: 360, h: 640, follow: true, ground: '#1b2a6b',
          idea: 'The strokes of example 5 on the moving figure, with a stronger push: a grey photograph has no color to exaggerate, so lightness picks a place on a ramp from hot red to light yellow, and the ground itself is the cold blue. Strokes go only where the figure is, so it burns on a cold ground, frame after frame.',
          pseudo: `ramp ← hot red → light yellow;  paper ← cold blue
every frame of the walk:
  for each stroke (as in 5)
    skip it where the photograph is dark (the ground stays cold blue)
    follow the form for a few steps
    color it by the lightness where it starts, on the ramp`,
          code: `// Example 5 on a moving source: hot strokes on the figure, a cold ground. The board follows the walk.
const s = source('walk')
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
    }
  ]
};

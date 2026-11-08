/**
 * Pointillism, explained as a film (src/workbench/film.js): the sampling lesson's first idea, one sketch moved by keyframes.
 * A picture is a function from a place to a colour: ask it, and draw a dot there. The sketch below is written for the film and
 * is the whole lesson in thirty lines; its four controls (dots across, dot size, scatter, pure paints) are keyframed, so the grid
 * of big dots becomes the painting, then breaks into scattered dots, then is repainted in a handful of pure colours.
 * The painting is Georges Seurat's A Sunday on La Grande Jatte (1884–86), in the public domain (examples/lessons/sampling/RIGHTS.md).
 */
const SKETCH = `// Pointillism: a picture is a function from a place to a colour. Ask it, and draw a dot there.
let cols = 6 /* 3..120 */;      // dots across
let size = 1 /* 0.3..1.8 */;    // dot size, as a fraction of its cell
let scatter = 0 /* 0..1 */;     // 0 is a grid, 1 puts every dot at a random place
let pure = 0 /* 0..1 */;        // 0 keeps the painting's colours, 1 uses only eight pure paints
const PAINTS = [[246, 240, 220], [240, 200, 60], [228, 110, 40], [190, 45, 50], [70, 130, 205], [35, 60, 140], [70, 140, 70], [30, 40, 35]];
let img;
async function setup() { createCanvas(800, 600); img = await loadImage('seurat.jpg'); img.loadPixels(); noLoop(); }
// the sample: the colour of the painting at a place, x and y from 0 to 1
function colourAt(x, y) {
  const k = max(width / img.width, height / img.height), u = floor((x * width - (width - img.width * k) / 2) / k), v = floor((y * height - (height - img.height * k) / 2) / k);
  const i = 4 * (constrain(v, 0, img.height - 1) * img.width + constrain(u, 0, img.width - 1));
  return [img.pixels[i], img.pixels[i + 1], img.pixels[i + 2]];
}
// the nearest of the pure paints
const nearest = c => PAINTS.reduce((best, p) => (dist(p[0], p[1], p[2], c[0], c[1], c[2]) < dist(best[0], best[1], best[2], c[0], c[1], c[2]) ? p : best));
function draw() {
  background('#f3efe6'); randomSeed(1); noStroke();
  const rows = Math.round(cols * height / width), cell = width / cols;
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    // where to sample: the middle of the cell, or a random place
    const x = lerp((i + 0.5) / cols, random(), scatter), y = lerp((j + 0.5) / rows, random(), scatter);
    const c = colourAt(x, y), p = nearest(c), dark = 1 - (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
    fill(lerp(c[0], p[0], pure), lerp(c[1], p[1], pure), lerp(c[2], p[2], pure));
    circle(x * width, y * height, cell * size * (0.6 + 0.8 * dark));
  }
}`;

const T = 'Pointillism';
export const FILM = {
  id: 'pointillism-explainer',
  title: 'Pointillism: a picture is a function',
  summary: 'Seurat painted with dots; a program can too. Sample a painting at a place, draw a dot of that colour, and see what the grid, the scatter and the pure paints do. About three minutes.',
  credit: 'Painting: Georges Seurat, A Sunday on La Grande Jatte, 1884–86 (public domain, Wikimedia Commons). Sketch and film: Artist Model Studio.',
  lesson: 'sampling',
  camera: { w: 1280, h: 960 },
  fps: 25,
  boards: [{ title: T, kind: 'p5', code: SKETCH, width: 800, height: 600, ground: '#f3efe6' }],
  beats: [
    { board: 'Seurat: the painting', chapter: 'The painting', pose: { z: 1, dx: 0, dy: 0 }, to: { z: 1.5, dx: 0.12, dy: 0.1 }, title: 'Pointillism', sub: 'a picture is a function', titleDur: 2600,
      say: 'In 1884 Georges Seurat began a painting of an afternoon on an island in the Seine. He painted it with thousands of small dots of pure colour, and left the eye to mix them. A hundred and forty years later, a program can do the same.', hold: 900 },
    { board: T, chapter: 'A picture is a function', pose: { z: 1.35, dx: -0.12, dy: 0 }, to: { z: 1.5, dx: -0.12, dy: 0 }, set: [{ board: T, name: 'cols', from: 3, to: 7, over: 2500 }],
      say: 'The idea is small. A picture is a function: give it a place, and it gives you a colour. So to paint it in dots, choose a place, ask for the colour there, and draw a dot of that colour.',
      code: { from: 'function colourAt', to: 'return [img.pixels', note: 'ask the picture: what colour is here?', before: 0, after: 1 }, hold: 800 },
    { board: T, chapter: 'A grid of dots', pose: { z: 1.35, dx: -0.12, dy: 0 }, set: [{ board: T, name: 'cols', from: 7, to: 70, over: 7000, ease: 'ease' }],
      say: 'Start with a grid. Six dots across, and you can only just tell it is a painting. Twelve, thirty, seventy: each dot is smaller, there are more of them, and the picture comes out of the dots.',
      code: { from: 'const rows', to: 'circle(x * width', note: 'one dot for each place on a grid', before: 0, after: 1 }, hold: 800 },
    { board: T, chapter: 'Dot size', pose: { z: 1.35, dx: -0.12, dy: 0 }, set: [{ board: T, name: 'size', from: 1, to: 0.45, over: 3000 }, { board: T, name: 'size', from: 0.45, to: 1.4, at: 3600, over: 3000 }],
      say: 'The size of a dot is a choice too. Here it is a little bigger where the painting is dark. Make the dots small, and the paper shows between them and the colours go pale; make them big, and they touch, and the picture goes dense.',
      code: { from: 'circle(x * width', note: 'the size is a decision', before: 3, after: 1 }, hold: 800 },
    { board: T, chapter: 'Scattered dots', pose: { z: 1.35, dx: -0.12, dy: 0 }, set: [{ board: T, name: 'scatter', from: 0, to: 1, over: 4500 }],
      say: 'The grid is not the only way to choose places. Let each dot wander to a random place, and ask the painting there instead. The grid dissolves, and the picture is still there: it is only the density of the dots that carries it.',
      code: { from: 'const x = lerp', to: 'random(), scatter', note: 'a random place, or the grid', before: 1, after: 2 }, hold: 800 },
    { board: T, chapter: 'Pure paints', pose: { z: 1.35, dx: -0.12, dy: 0 }, set: [{ board: T, name: 'pure', from: 0, to: 1, over: 5000 }],
      say: 'Seurat did not mix on the palette. He put pure colours side by side. So here every dot is replaced by the nearest of eight pure paints: yellow, orange, red, two blues, a green, a cream and a near black. The colours are fewer, and the picture is still there.',
      code: { from: 'const PAINTS', to: 'const nearest', note: 'eight pure paints', before: 0, after: 3 }, hold: 800 },
    { board: T, chapter: 'The eye mixes', pose: { z: 1, dx: 0, dy: 0 }, to: { z: 0.72, dx: 0, dy: 0 }, set: [{ board: T, name: 'cols', from: 70, to: 110, over: 4000 }],
      say: 'And this is what he was counting on. Step back, and the dots go small, the pure colours run together, and the eye mixes them into the green of grass and the warm light of a late afternoon. The picture was never in any one dot.', hold: 1200 },
    { board: 'Seurat: the painting', chapter: 'Sample, then decide', pose: { z: 1.5, dx: 0.12, dy: 0.1 }, to: { z: 1, dx: 0, dy: 0 }, title: 'Sample a picture, decide what to draw there.', sub: 'Seurat decides: a dot of pure colour', titleDur: 4200,
      say: 'Sample a picture, and decide what to draw there. Seurat decided on a dot of pure colour. Next, someone else decides on a stroke, and the picture looks quite different.', hold: 1500 }
  ]
};

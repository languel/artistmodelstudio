/**
 * Use case 1, a lecture as boards: after Kandinsky's Point and Line to Plane (1926), four boards,
 * three with live code (their numbers are sliders on the page). Built with the same calls the
 * studio and agents use, then exported as a page.
 *
 *   npx vite-node scripts/point-line-plane-demo.mjs   →  exports/demos/point-line-plane.html
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { ProcessStore } from '../src/process/document.js';
import { runScript } from '../src/process/script.js';
import { sceneHtml } from '../src/process/page.js';
import { MAIN } from '../src/process/boards.js';

const s = new ProcessStore();
s.change('title', d => { d.title = 'Point, line, plane'; d.artboard = { width: 1600, height: 900, ground: '#f3efe6', title: 'The point' }; d.meta = { intro: 'A short lecture after Kandinsky’s *Point and Line to Plane* (1926), written as boards. Each board is drawn by its own code: move a slider and it redraws.' }; });

const board = (id, title, code, text) => {
  const b = id === MAIN ? { id: MAIN } : s.addBoard({ title, width: 1600, height: 900 });
  if (id === MAIN) s.updateBoard(MAIN, { title });
  const r = s.runBoardCode(b.id, code, runScript);
  if (r.error) throw new Error(`${title}: ${r.error}`);
  s.updateBoard(b.id, { text });
};

board(MAIN, 'The point', `// One point: where it sits is what it says.
const x = 0.62 /* 0..1 */
const y = 0.38 /* 0..1 */
const size = 90 /* 10..300 */
point(x, y, { size, color: '#c8664f', why: 'a point high and right feels light' })
`, `**The point** is the smallest form: silence and speech at once. Kandinsky: its tension depends on where it sits. High and right it rises; low and left it weighs. Move it.`);

board('points', 'Points, by an algorithm', `// A grid of points, loosened by noise: order and its undoing.
const n = 9 /* 2..24 */
const loose = 0.35 /* 0..1 */
seed(3)
for (const i of range(n)) for (const j of range(n)) {
  const u = (i + 0.5) / n, v = (j + 0.5) / n
  point(0.2 + 0.6 * u + loose * 0.05 * noise(i * 0.7, j * 0.7), 0.1 + 0.8 * v + loose * 0.05 * noise(j * 0.7, i * 0.7), { size: 10 + 10 * (1 - v), why: 'a field of points' })
}
`, `Many points are a **field**. A rule places them; a little noise loosens the rule. Where the order breaks, the eye starts to read.`);

board('line', 'The line: a point that moved', `// Klee: a line is a point going for a walk.
const turn = 9 /* 0..30 */
const steps = 90 /* 10..200 */
line(walk({ from: [0.1, 0.55], heading: -10, steps, step: 0.009, turn: i => sin(i / 7) * turn }), { brush: 'ink', width: 6, why: 'the walk' })
`, `**The line** is the trace of a moving point, so it carries time: its speed, its hesitations. Turn the walk up and it starts to loop.`);

board('plane', 'The plane', `// The basic plane: the ground everything sits on.
const w = 0.5 /* 0.1..0.9 */
const h = 0.55 /* 0.1..0.9 */
plane(rect(0.5 - w / 2, 0.5 - h / 2, w, h), { brush: 'hatch', angle: 30, spacing: 10, why: 'the basic plane' })
`, `**The plane** holds the work. Its edges already speak: above is lighter, below heavier, left freer, right more bound.`);

mkdirSync('exports/demos', { recursive: true });
const html = sceneHtml(s.doc, { byline: 'Artist Model Studio · a lecture as boards' });
writeFileSync('exports/demos/point-line-plane.html', html);
console.log(`boards: ${s.doc.boards.length + 1}, marks: ${s.doc.elements.length}, page: ${(html.length / 1024).toFixed(0)} KB`);

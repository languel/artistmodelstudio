/**
 * Lesson evals: can a small model reproduce a lesson's own board from a plain description?
 *
 * The lessons are the studio's own worked examples (examples/lessons). For each task a teacher's description of a board is given to the
 * model together with the studio's language reference; the code it writes is run on a blank board of the same size, and what
 * comes out is compared with the lesson's board: does it run, does it read the source it was told to, how many marks, and how alike
 * is the picture (1 is the same; the blank board is the floor).
 *
 *   (await import('/src/workbench/lessonEval.js')).run(app, { use: 'ask' | 'alt' })
 */
import { SCRIPT_REFERENCE } from '../process/script.js';

// Examples of the idioms (the loop, reading a picture, keeping only some marks), on other pictures and shapes than the tasks.
export const SYSTEM = `You write short programs in a drawing studio's own language (JavaScript). Reply with ONE fenced js code block and nothing else.
Only the things listed here exist; do not invent others (no brush(), stage(), walk(), defineLine(), classes, imports, or assigning to a call).
- The board: x and y are fractions from 0 to 1 (x to the right, y down). width and height are its size in units.
- Marks: point(x, y, { size, color }). line(points, { color, width }) with points like [[x, y], [x, y]]. plane(points, { color }) a closed shape; rect(x, y, w, h) and circle(cx, cy, r) give points for plane or line. note(x, y, text).
- Loops: for (const i of range(n)) { ... }. random() is 0 to 1; random(a, b). Math, sin, cos, PI, TAU work.
- Pictures: const s = source('name'). s.color(x, y) is the picture's color at a place, already a color string: pass it straight in, point(x, y, { color: s.color(x, y) }). s.value(x, y) is its brightness, 0 (dark) to 1 (light). A source can be read with source('name', { fit: 'contain' }).
- A number a person may want to change gets a range comment: const n = 60 /* 10..120 */.

Examples:
\`\`\`js
// A grid of squares, 8 across and 5 down, each the color of the picture 'photo' at its place.
const s = source('photo')
const cols = 8, rows = 5
for (const i of range(cols)) for (const j of range(rows)) {
  const x = (i + 0.5) / cols, y = (j + 0.5) / rows
  plane(rect(x - 0.04, y - 0.04, 0.08, 0.08), { color: s.color(x, y) })
}
\`\`\`
\`\`\`js
// 3000 points at random places, only where the picture 'map' is bright; darker gray where it is brighter.
const s = source('map')
for (const i of range(3000)) {
  const x = random(), y = random(), v = s.value(x, y)
  if (v > 0.5) point(x, y, { size: 2 + 6 * (v - 0.5), color: '#333333' })
}
\`\``;

export const TASKS = [
  { id: 'grid-dots', lesson: 'sampling', board: '1 · Sample: a color at a place', source: 'seurat',
    ask: 'Draw a grid of dots, 6 columns by 4 rows. Each dot has size 90 and takes its color from the painting named seurat at the dot\'s place.',
    alt: 'Make 6 across and 4 down of big round points (size 90), spaced evenly over the board, painted with whatever color the "seurat" picture has underneath each one.' },
  { id: 'dots-size', lesson: 'sampling', board: '2 · Dots on a grid', source: 'seurat',
    ask: 'A grid of dots: 60 columns, and as many rows as fit the board\'s shape. The color comes from the painting named seurat; the size is bigger where the painting is darker (cell size times 1.3 minus its brightness).',
    alt: 'Cover the board in a 60-column grid of dots, rows chosen so the cells are square. Sample the "seurat" image for each dot\'s color, and let darker places get larger dots.' },
  { id: 'scattered', lesson: 'sampling', board: '3 · Scattered dots', source: 'seurat',
    ask: 'Put 9000 dots at random places, each of size 7, each colored from the painting named seurat at its place.',
    alt: 'Scatter nine thousand little points (size 7) at random across the board, every one taking the color of the "seurat" picture where it lands.' },
  { id: 'light-walk', lesson: 'sampling', board: '7 · A pointillist walk', source: 'walk',
    ask: 'Using the source named walk (fit: contain), put 12000 dots at random places but keep one only where the picture is lighter than 0.3. Dot size is 2 plus 8 times how much lighter than 0.3 it is; color #1d1b19.',
    alt: 'Draw 12000 random candidate points; only where the "walk" picture (letterboxed) has brightness above 0.3 keep the dot, bigger for brighter places, in near-black #1d1b19.' }
];

const wait = ms => new Promise(r => setTimeout(r, ms));

/** The code in a reply: the first fenced block, else the text itself. */
export function codeOf(text) {
  const m = /```(?:js|javascript|ts|typescript)?\s*\n([\s\S]*?)```/i.exec(text) || /```(?:js|javascript)?\s*\n([\s\S]*)$/i.exec(text);
  return (m ? m[1] : String(text || '')).trim();
}

async function pixels(app, board, n = 48) {
  const { image } = await window.ams.callTool('ams_snapshot', { board, scale: 0.4, mode: 'picture' }, { quiet: true });
  const img = new Image(); img.src = image; await img.decode();
  const c = document.createElement('canvas'); c.width = c.height = n;
  const g = c.getContext('2d'); g.drawImage(img, 0, 0, n, n);
  return g.getImageData(0, 0, n, n).data;
}
const alike = (a, b) => { let d = 0; for (let i = 0; i < a.length; i += 4) d += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]); return 1 - d / ((a.length / 4) * 765); };

/** The board that holds the lesson's drawing code (the slide frame and the notes board have the same title). */
export const drawing = (app, title) => app.store.doc.boards.find(b => b.title === title && b.code && !b.kind);

export async function ensureLesson(app, id) {
  const have = () => drawing(app, TASKS.find(t => t.lesson === id).board);
  if (!have()) { const { buildLesson } = await import('./lessons.js'); await buildLesson(app, id); }
  await app.sources.whenReady?.(undefined, 15000);
  return have();
}

export async function runTask(app, task, { use = 'ask', maxTokens = 700, repairs = 2 } = {}) {
  await ensureLesson(app, task.lesson);
  const board = drawing(app, task.board);
  // (the lesson's own board is run first, so there is a picture to compare with)
  if (!app.store.doc.elements.some(e => e.board === board.id) && board.code) { await window.ams.callTool('ams_board', { action: 'code', id: board.id, source: board.code }, { quiet: true }); await wait(400); }
  const A = app.artists.get(window.__evalEngine || 'lfm3') || app.artists.get('lfm3');
  const t0 = performance.now();
  const out = { id: task.id, use, ran: false, usesSource: false, marks: 0, wanted: 0, alike: 0, blank: 0, ms: 0, error: null };
  out.wanted = app.store.doc.elements.filter(e => e.board === board.id).length;
  const fresh = (await window.ams.callTool('ams_board', { action: 'add', title: `eval · ${task.id}`, width: board.width, height: board.height }, { quiet: true }));
  const id = fresh.id || app.store.doc.boards.find(b => b.title === `eval · ${task.id}`)?.id;
  try {
    let reply = await A.complete({ system: SYSTEM, user: task[use], maxTokens });
    // Write, run, and when it fails show the model what the studio said and let it fix it (twice at most).
    for (out.tries = 1; ; out.tries++) {
      out.code = codeOf(reply); out.error = null; out.ran = false;
      try { await window.ams.callTool('ams_board', { action: 'code', id, source: out.code }, { quiet: true }); out.ran = true; } catch (err) { out.error = err.message; }
      if (out.ran || out.tries > repairs) break;
      reply = await A.complete({ system: SYSTEM, user: `${task[use]}\n\nYour code:\n\`\`\`js\n${out.code}\n\`\`\`\nThe studio says: ${out.error}\nFix it, using only the functions listed. Reply with the corrected code block.`, maxTokens });
    }
    out.usesSource = new RegExp(`source\\(\\s*['"\`]${task.source}['"\`]`).test(out.code);
    await wait(300);
    out.marks = app.store.doc.elements.filter(e => e.board === id).length;
    const [a, b] = [await pixels(app, board.id), await pixels(app, id)];
    out.alike = +alike(a, b).toFixed(3);
    // (what a board with nothing on it would score: the floor)
    const empty = (await window.ams.callTool('ams_board', { action: 'add', title: `eval · empty`, width: board.width, height: board.height }, { quiet: true }));
    out.blank = +alike(a, await pixels(app, empty.id || app.store.doc.boards.find(x => x.title === 'eval · empty')?.id)).toFixed(3);
    await window.ams.callTool('ams_board', { action: 'delete', id: empty.id || app.store.doc.boards.find(x => x.title === 'eval · empty')?.id, deleteMarks: true }, { quiet: true }).catch(() => {});
  } catch (err) { out.error = out.error || err.message; }
  out.ms = Math.round(performance.now() - t0);
  out.score = out.blank < 1 ? +Math.max(0, (out.alike - out.blank) / (1 - out.blank)).toFixed(2) : null;   // (0: as unlike as an empty board; 1: the same picture)
  out.pass = out.ran && out.usesSource && out.marks > 0 && out.marks >= out.wanted * 0.5 && out.marks <= out.wanted * 2;
  await window.ams.callTool('ams_board', { action: 'delete', id, deleteMarks: true }, { quiet: true }).catch(() => {});
  return out;
}

export async function run(app, { use = 'ask', only = null, repairs = 2 } = {}) {
  const results = [];
  for (const t of TASKS) { if (only && !only.includes(t.id)) continue; results.push(await runTask(app, t, { use, repairs })); }
  return { use, passed: results.filter(r => r.pass).length, of: results.length, results };
}

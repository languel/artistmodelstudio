/**
 * The Klee painterly experiment as a drawing with boards (one board per question), exported as a page and
 * as a document the studio opens as a scene.
 *
 *   npx vite-node scripts/klee-painterly-report.mjs
 *
 * Reads exports/klee-painterly (results.json and the snapshots the experiment saved) and writes
 * report.html (the page, with the drawing inside it) and report.doc.json (the drawing).
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { ProcessStore } from '../src/process/document.js';
import { MAIN } from '../src/process/boards.js';
import { sceneHtml } from '../src/process/page.js';

const DIR = 'exports/klee-painterly';
const read = p => JSON.parse(readFileSync(`${DIR}/${p}`, 'utf8'));
const R = read('results.json'), V4 = existsSync(`${DIR}/v4/results.json`) ? read('v4/results.json') : null;
const LIVE = existsSync(`${DIR}/live/results.json`) ? read('live/results.json') : null;
const img = p => `data:image/jpeg;base64,${readFileSync(`${DIR}/${p}`).toString('base64')}`;
const fmt = (v, d = 2) => (v == null ? '·' : Number(v).toFixed(d));
const res = tag => R.results[tag];
const at = (tag, t) => res(tag)?.snaps.find(s => s.t === t);

const store = new ProcessStore();
const marksStage = () => store.doc.stages.find(s => s.kind === 'marks')?.id || store.doc.stages[0].id;
const notesStage = () => store.doc.stages.find(s => s.kind === 'notes')?.id || marksStage();
store.change('title', d => { d.title = 'Klee, repainted continuously: an experiment'; d.artboard = { width: 1500, height: 560, ground: '#f3efe6', title: 'Klee, repainted continuously' }; });

const origin = id => (id === MAIN ? { x: 0, y: 0 } : store.doc.boards.find(b => b.id === id));

/** Pictures in a grid on a board, each with a caption under it. */
function sheet(title, items, { cols = 4, cell = 440, gap = 28, text, ground = '#ffffff', capH = 62 } = {}) {
  const aspect = items.map(i => i.aspect || 0.82);
  const rowH = Math.max(...aspect) * cell + capH;
  const rows = Math.ceil(items.length / cols);
  const width = cols * cell + (cols + 1) * gap, height = rows * (rowH + gap) + gap;
  const b = title === MAIN ? { id: MAIN, x: 0, y: 0 } : store.addBoard({ title, width, height, ground });
  if (title === MAIN) store.updateBoard(MAIN, { width, height, ground });
  const o = origin(b.id);
  items.forEach((it, i) => {
    const c = i % cols, r = Math.floor(i / cols), x = o.x + gap + c * (cell + gap), y = o.y + gap + r * (rowH + gap), h = cell * (it.aspect || 0.82);
    store.addElement({ role: 'image', stage: marksStage(), board: b.id === MAIN ? undefined : b.id, src: it.src, points: [[x, y, 0, 0.5], [x + cell, y, 0, 0.5], [x + cell, y + h, 0, 0.5], [x, y + h, 0, 0.5]], label: it.label || it.caption || 'picture', why: it.why || 'a snapshot of the run' });
    store.addElement({ role: 'note', stage: notesStage(), board: b.id === MAIN ? undefined : b.id, points: [[x, y + h + 8, 0, 0.5]], text: it.caption, note: { style: 'plain', font: 'sans', size: 15, width: cell }, color: '#2b2620', why: 'caption' });
  });
  const board = title === MAIN ? { title: store.doc.artboard.title, x: 0, y: 0, width, height } : { title, x: o.x, y: o.y, width, height };
  if (text) notesFor(board, text);
  return b;
}

/** About how tall a markdown board must be for its words (they wrap at its width). */
const mdHeight = (t, w) => {
  const cpl = Math.max(40, Math.floor(w / 8.5));
  let lines = 0;
  for (const l of t.split('\n')) lines += l.trim() === '' ? 0.6 : Math.max(1, Math.ceil(l.length / cpl));
  return Math.round(Math.min(1700, Math.max(240, 110 + lines * 27)));
};

/** A document board: words, as a markdown board on the canvas (a page section too). */
function words(title, text, { width = 900 } = {}) {
  const b = store.addBoard({ title, width, height: mdHeight(text, width), ground: '#ffffff' });
  store.updateBoard(b.id, { kind: 'markdown', code: text });
  return b;
}

/** Words for a board of pictures: a "<title> · notes" board under it (the page joins them). */
function notesFor(owner, text) {
  const width = Math.max(760, Math.min(1200, owner.width));
  const nb = store.addBoard({ title: `${owner.title} · notes`, width, height: mdHeight(text, width), x: owner.x, y: owner.y + owner.height + 60, ground: '#ffffff' });
  store.updateBoard(nb.id, { kind: 'markdown', code: text });
  return nb;
}

const nameOf = { castle: 'Castle and Sun', senecio: 'Senecio', twittering: 'Twittering Machine' };
const src = { castle: 'fixtures/references/klee/klee-1928-castle-and-sun.jpg', senecio: 'fixtures/references/klee/klee-1922-senecio.jpg', twittering: 'fixtures/references/klee/klee-1922-twittering-machine.jpg' };
const aspect = { castle: 840 / 1024, senecio: 1024 / 940, twittering: 1024 / 774 };
const asrc = n => `data:image/jpeg;base64,${readFileSync(`${DIR}/sources/${n}.jpg`).toString('base64')}`;   // (the sources at 480 px, saved by the experiment)
const base = n => R.baselines[n];

// ---- summary (the main board) ---------------------------------------------------------------------
const tbl = (head, rows) => `| ${head.join(' | ')} |\n|${head.map(() => '---').join('|')}|\n${rows.map(r => `| ${r.join(' | ')} |`).join('\n')}`;
const sum60 = ['castle', 'senecio', 'twittering'].map(n => {
  const s = at(`${n}-oil`, 60), b = base(n);
  return [nameOf[n], fmt(s.err, 1), fmt(s.ssim), fmt(s.cover), s.strokes, fmt(b['mosaic 24'].err, 1), fmt(b['mosaic 24'].ssim), fmt(b['mosaic 48'].err, 1), fmt(b['mosaic 48'].ssim)];
});
sheet(MAIN, ['castle', 'senecio', 'twittering'].map(n => ({ src: asrc(n), aspect: aspect[n] > 1 ? 0.82 : 0.82, caption: `${nameOf[n]}`, label: nameOf[n], why: 'the source' })).map((x, i) => x), {
  cols: 3, cell: 440, gap: 30, capH: 40, ground: '#f3efe6',
  text: `**Question.** Can *AMS* repaint a picture continuously, with strokes that draw themselves on, stay a while and fade as new ones arrive, using brushes that are code (the textured brushes and time envelopes built today), and how close does it get to the picture?

**What ran.** The *Painterly, fading strokes* demo (board menu → Draw from a source; plain board code) on three Klee paintings, 60 s each on a simulated clock at 12 redraws a second, same seed. Four layers of strokes, big to small; the code keeps a coarse model of what its live strokes show and paints where that differs from what each layer sees.

${tbl(['Source', 'error', 'SSIM', 'covered', 'strokes', 'mosaic 24 error', 'SSIM', 'mosaic 48 error', 'SSIM'], sum60)}

*At 60 s, oil brush. Error: mean RGB difference from the source (0 to 255, lower is closer); SSIM: structural similarity of light (1 is identical). A "mosaic" is the source itself cut to 24×24 or 48×48 blocks, for scale.*

**In short.** It works as a continuously repainting painting and, on the toned paper, holds its quality for as long as it runs (no decay over 60 s). It is about as close to the source as a 24×24 mosaic (better than one on Castle and Sun, a little behind on the other two), and not as close as a 48×48 one: it gets the tone, palette and large forms, not the small structure. The detail is on the next boards.`
});

// ---- how it works ---------------------------------------------------------------------------------
words('How it works, and how it was measured', `**The demo** is one page of board code (\`sourceDemos.js\`, id \`paint\`), after Hertzmann's painterly rendering, made continuous.

1. The source is read on a 64-cell grid. Each of four layers sees it blurred as much as its brush is broad (7, 5, 3 and 0 cells across).
2. The code keeps a **model**: the color each cell shows so far, made from its live strokes (weighted by how visible each is, given its time envelope).
3. Each run, each layer looks at the picture in blocks the size of its brush. Where a block differs from what the layer sees by more than a tolerance, and that layer has not painted there itself, a stroke starts at the worst place in the block. The first layer always paints (the underpainting); finer layers only where the coarser ones have.
4. A stroke follows the forms (a quarter turn from the change of light in the blurred picture), takes that picture's color, and stops where the color turns.
5. Each stroke carries a **time envelope**: it draws itself on, fades in, stays, then fades out over its last third. As strokes fade the model differs again and new ones arrive: the picture repaints itself, and follows a moving source.
6. The paper is toned to the source's mean color, so where nothing is painted it is not white.

**The experiment** runs the same code headless, in its own page, with a simulated clock (12 runs a second) and a seeded random, so a run can be repeated exactly. A picture is drawn at 5, 10, 20, 30, 45 and 60 s and measured against the source at 96 px across: mean RGB error, SSIM on luminance (8×8 blocks), and the share of pixels that are not bare paper. Files: \`exports/klee-painterly/\`.

**The brush** is *oil* (new today): a flat brush of many hairs packed into one body of paint, with streaks, a taper and ragged ends, painted through a cached layer with a light canvas grain (\`texture.js\`).`, { width: 1100 });

// ---- progressions ---------------------------------------------------------------------------------
const times = [5, 10, 20, 30, 45, 60];
for (const n of ['castle', 'senecio', 'twittering']) {
  const tag = `${n}-oil`;
  const items = [{ src: asrc(n), aspect: aspect[n] > 1 ? aspect[n] : 0.82, caption: 'the source', label: `${nameOf[n]}, the source`, why: 'the source' }];
  for (const t of times) { const s = at(tag, t); items.push({ src: img(s.file), aspect: R.results[tag].snaps ? undefined : undefined, caption: `${t} s · error ${fmt(s.err, 1)} · SSIM ${fmt(s.ssim)} · ${s.strokes} strokes`, label: `${nameOf[n]} at ${t} s` }); }
  const a = aspect[n];
  items.forEach(i => { i.aspect = a; });
  const rows = times.map(t => { const s = at(tag, t); return [`${t} s`, fmt(s.err, 1), fmt(s.ssim), fmt(s.cover), s.strokes, s.born5s]; });
  const b = base(n);
  sheet(`${nameOf[n]} · progression`, items, {
    cols: 4, cell: n === 'castle' ? 440 : 340, text: `${nameOf[n]} repainted by the oil brush, 60 s.\n\n${tbl(['time', 'error', 'SSIM', 'covered', 'strokes alive', 'born in the last 5 s'], rows)}\n\nFor scale, the source cut to 24×24 blocks has error ${fmt(b['mosaic 24'].err, 1)} and SSIM ${fmt(b['mosaic 24'].ssim)}; cut to 48×48, ${fmt(b['mosaic 48'].err, 1)} and ${fmt(b['mosaic 48'].ssim)}.`
  });
}

// ---- brushes and settings (Castle and Sun) --------------------------------------------------------
const brushItems = [{ src: asrc('castle'), aspect: aspect.castle, caption: 'the source', label: 'the source' }];
for (const [tag, cap] of [['castle-oil', 'oil'], ['castle-chalk', 'chalk'], ['castle-bristles', 'bristles'], ['castle-charcoal', 'charcoal']]) { const s = at(tag, 60); brushItems.push({ src: img(s.file), aspect: aspect.castle, caption: `${cap} · error ${fmt(s.err, 1)} · SSIM ${fmt(s.ssim)} · covered ${fmt(s.cover)}`, label: `Castle and Sun, ${cap}` }); }
sheet('Brushes · the same code, five brushes', brushItems, {
  cols: 3, cell: 440, text: `Castle and Sun at 60 s, the demo unchanged except for \`brushId\`. **Chalk** and **bristles** are the most faithful (SSIM 0.51): they fill their width. **Oil** (0.44) is the most painterly, ragged and streaked, and leaves the toned paper showing between its hairs; **charcoal** (0.45) is grainy and light. A brush is one word at the top of the code: yours works too.`
});

const setItems = [];
for (const [tag, cap] of [['castle-tol0.6', 'tolerance 0.6 (faithful)'], ['castle-oil', 'tolerance 1 (default)'], ['castle-tol1.6', 'tolerance 1.6 (loose)'], ['castle-five', 'five layers, tolerance 0.8']]) { const s = at(tag, 60); if (s) setItems.push({ src: img(s.file), aspect: aspect.castle, caption: `${cap} · error ${fmt(s.err, 1)} · SSIM ${fmt(s.ssim)} · ${s.strokes} strokes`, label: `Castle and Sun, ${cap}` }); }
sheet('Settings · tolerance and layers', setItems, {
  cols: 4, cell: 340, text: `Castle and Sun at 60 s, oil. **Tolerance** (how different the picture may be before it is painted over) barely matters now: SSIM 0.43, 0.44 and 0.42 for 0.6, 1 and 1.6. The toned paper and the always-repainted underpainting do the work, and the finer layers are limited by their brush, not by their threshold. **A fifth, finer layer** (a brush 0.9% of the width) is what helps: +0.06 SSIM here (Senecio: 0.53 to 0.59) for about double the marks, and so double the cost of drawing them.`
});

// ---- fidelity over time (a chart drawn from the data) ---------------------------------------------
{
  const W = 1500, H = 620, b = store.addBoard({ title: 'Fidelity over time', width: W, height: H, ground: '#ffffff' });
  const o = origin(b.id);
  const line = (pts, color, w = 3, dash) => store.addElement({ role: 'line', stage: marksStage(), board: b.id, points: pts.map(([x, y], i) => [o.x + x, o.y + y, i * 16, 0.5]), color, realize: { brush: 'pen', params: { width: w } }, why: dash || 'chart' });
  const text = (x, y, t, size = 14, color = '#2b2620', width = 200) => store.addElement({ role: 'note', stage: notesStage(), board: b.id, points: [[o.x + x, o.y + y, 0, 0.5]], text: t, note: { style: 'plain', font: 'sans', size, width }, color, why: 'chart label' });
  const plot = (x0, title, key, lo, hi, ticks, baselines) => {
    const pw = 600, ph = 420, y0 = 100, X = t => x0 + (t / 60) * pw, Y = v => y0 + ph - ((v - lo) / (hi - lo)) * ph;
    text(x0, 40, title, 20, '#2b2620', 600);
    line([[x0, y0], [x0, y0 + ph], [x0 + pw, y0 + ph]], '#2b2620', 2);
    for (const t of [0, 10, 20, 30, 40, 50, 60]) text(X(t) - 8, y0 + ph + 8, `${t}`, 13, '#6b645a', 40);
    text(x0 + pw - 60, y0 + ph + 30, 'seconds', 13, '#6b645a', 80);
    for (const v of ticks) { line([[x0 - 6, Y(v)], [x0, Y(v)]], '#2b2620', 2); text(x0 - 52, Y(v) - 8, `${v}`, 13, '#6b645a', 44); }
    for (const [label, v, c] of baselines) { line([[x0, Y(v)], [x0 + pw, Y(v)]], c, 1.5, 'baseline'); text(x0 + pw + 8, Y(v) - 9, label, 12, c, 130); }
    for (const [n, color] of [['castle', '#a83a2a'], ['senecio', '#3c5a8a'], ['twittering', '#5f8a4a']]) {
      const pts = [...res(`${n}-oil`).snaps.map(s => [X(s.t), Y(s[key])])];
      line(pts, color, 4);
      pts.forEach(([x, y]) => store.addElement({ role: 'point', stage: marksStage(), board: b.id, points: [[o.x + x, o.y + y, 0, 0.5]], color, realize: { brush: 'dot', params: { size: 9 } }, why: 'a snapshot' }));
    }
  };
  plot(90, 'Error (lower is closer)', 'err', 0, 30, [0, 10, 20, 30], [['24×24 mosaic of Castle', base('castle')['mosaic 24'].err, '#a83a2a'], ['24×24 mosaic of Senecio', base('senecio')['mosaic 24'].err, '#3c5a8a']]);
  plot(880, 'SSIM (higher is closer)', 'ssim', 0, 0.8, [0, 0.2, 0.4, 0.6, 0.8], [['24×24 mosaic, Castle', base('castle')['mosaic 24'].ssim, '#a83a2a'], ['24×24 mosaic, Senecio', base('senecio')['mosaic 24'].ssim, '#3c5a8a']]);
  text(90, 560, 'Red: Castle and Sun · blue: Senecio · green: Twittering Machine (oil, 60 s). Thin lines: the source cut to 24×24 blocks.', 14, '#6b645a', 1200);
  notesFor({ title: 'Fidelity over time', x: o.x, y: o.y, width: W, height: H }, `Each line is one run, measured at 5, 10, 20, 30, 45 and 60 s. **There is no decay**: the picture is as close at 60 s as at 5 s, which is the point of a continuous process: strokes fade and are replaced, and the whole holds. (Before the paper was toned, and the underpainting always repainted, quality fell steadily; see *How it got here*.)`);
}

// ---- how it got here ------------------------------------------------------------------------------
if (V4) {
  const v4 = V4.results['castle-oil'].snaps, v5 = res('castle-oil').snaps;
  const g = (a, t) => a.find(s => s.t === t);
  words('How it got here', `Castle and Sun, seed 1, simulated clock. Numbers are error and SSIM at the time shown.

${tbl(['version', 'what changed', '5 s', '30 s', 'what it showed'], [
    ['v1', 'random places where the model differs most; raw source; white paper (first commit today)', '43.2 · 0.26', '·', 'a muddy field, strokes clustered at the frame; it gets worse with time'],
    ['v2', 'each layer sees the source blurred as much as its brush is broad (Hertzmann)', '45.8 · 0.24', '64.8 · 0.16', 'the worst cells win again and again: strokes stack on the hardest zones and the rest stays bare'],
    ['v3', 'blocks as large as the brush; a stroke in each block that differs', '61.8 · 0.15', '87.2 · 0.14', 'worse: a block stays "wrong" after a stroke, so the same blocks are repainted over and over (hundreds stacked)'],
    ['v4', 'a layer paints a place only once per lifetime (its own coverage)', `${fmt(g(v4, 5).err, 1)} · ${fmt(g(v4, 5).ssim)}`, `${fmt(g(v4, 30).err, 1)} · ${fmt(g(v4, 30).ssim)}`, 'a dense painting in the source’s palette, but paper shows through and quality decays as the underpainting fades and is not replaced'],
    ['v5', 'paper toned to the mean; the first layer always repaints; longer strokes', `${fmt(g(v5, 5).err, 1)} · ${fmt(g(v5, 5).ssim)}`, `${fmt(g(v5, 30).err, 1)} · ${fmt(g(v5, 30).ssim)}`, 'stable for 60 s; the biggest single gain was the toned paper']
  ])}

Two lessons: **a process that repaints itself must be judged over time** (v4 looked fine at 5 s), and **the error a layer chases has to be one it can reach** (v2 and v3 chased error that a stroke of one color cannot remove).`, { width: 1200 });
}

// ---- AMS and p5 -----------------------------------------------------------------------------------
if (LIVE) {
  const items = [];
  for (const n of ['castle', 'senecio', 'twittering']) {
    items.push({ src: asrc(n), aspect: aspect[n], caption: `${nameOf[n]}: the source`, label: `${nameOf[n]}, the source` });
    for (const k of ['ams', 'p5']) { const s = LIVE.results[`${k}-${n}`]; if (s) items.push({ src: img(s.file), aspect: aspect[n], caption: `${k === 'ams' ? 'AMS' : 'p5'} after ${s.t} s · error ${fmt(s.err, 1)} · SSIM ${fmt(s.ssim)}`, label: `${nameOf[n]}, ${k}` }); }
  }
  sheet('AMS and p5 · the same code, the same sources', items, { cols: 3, cell: 360, text: LIVE.text || '' });
}

// ---- what this shows, and next --------------------------------------------------------------------
words('What this shows, and what next', `**What works.** Textured brushes (charcoal, chalk, pencil, bristles, oil, marker, wash) and time envelopes are ordinary code and compose with everything else: a repainting reconstruction is one page of board code, edited with sliders, and the brush is one word. The picture holds its quality while it fades and repaints itself. The same code runs as a p5.js sketch with the same brushes (see *AMS and p5*).

**What does not, yet.** It is as close as a 24×24 mosaic, not a 48×48 one: it gets tone, palette and large forms, and loses small structure (the Castle's blocks, the sun). Strokes are short (two to four points) and read as dabs; edges are soft because strokes stop on color and are not clipped to it.

**Next, in order of value.**
1. **Longer, edge-following strokes**: smooth the direction field, stop at edges by a mask instead of by color drift, let long strokes bend (more points).
2. **Cost**: a mark costs about 30 µs to draw even when cached (hashing its key); with 1400 marks that is 45 ms a frame. Keep a key per element, skip unchanged marks, or draw a layer's still marks once into a bitmap.
3. **Faces and structure**: seed detail strokes from the face tracker's landmarks; use the existing *Fit* shapes as an underpainting.
4. **Color variety inside a stroke**: paint hairs in two or three neighboring colors, not one.
5. **Recordings** (takes) should render timed marks at the frame's own clock.`, { width: 1100 });

store.change('page intro', d => { d.meta = { ...(d.meta || {}), intro: 'Artist Model Studio · 29 September 2026. A report on repainting Klee continuously with our own brushes, made as one drawing with a board per question.' }; });

const doc = store.doc;
writeFileSync(`${DIR}/report.doc.json`, JSON.stringify(doc));
const html = sceneHtml(doc, { byline: 'Artist Model Studio' });
writeFileSync(`${DIR}/report.html`, html);
console.log(`boards: ${doc.boards.length + 1}, marks: ${doc.elements.length}, page: ${(html.length / 1024).toFixed(0)} KB, doc: ${(JSON.stringify(doc).length / 1024).toFixed(0)} KB`);

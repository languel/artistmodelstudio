/**
 * The Senecio run report (exports/senecio-runs/index.html, written by hand) rebuilt as a drawing
 * with boards, and exported as a page. It uses the same calls the workbench and agents use: a
 * store, addBoard, marks placed on boards, board text, the page export.
 *
 *   npx vite-node scripts/senecio-report-scene.mjs
 *
 * Writes exports/senecio-runs/report-scene.html: the page, with the drawing inside it (open the
 * page in the studio, File → Open, to keep working on the drawing).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { ProcessStore, normalizeDocument, newId } from '../src/process/document.js';
import { docAt } from '../src/process/take.js';
import { runScript } from '../src/process/script.js';
import { boardDoc, boardById, MAIN } from '../src/process/boards.js';
import { sceneHtml } from '../src/process/page.js';

const DIR = 'exports/senecio-runs';
const take = n => JSON.parse(readFileSync(`${DIR}/${n}.take.json`, 'utf8'));
const dataUrl = (path, type) => `data:${type};base64,${readFileSync(path).toString('base64')}`;

const store = new ProcessStore();
store.change('title', d => { d.title = 'Senecio: one study, four ways'; d.artboard = { width: 920, height: 1000, ground: '#f3efe6', title: 'The task' }; });

/** Put a drawing (its main board) on a new board of the scene, with its stages and brushes. */
function place(title, source, text) {
  const src = boardDoc(normalizeDocument(source), MAIN);
  const b = store.addBoard({ title, width: src.artboard.width, height: src.artboard.height, ground: src.artboard.ground });
  const at = boardById(store.doc, b.id);
  store.change(`board ${title}`, d => {
    Object.assign(d.brushes, src.brushes || {});
    Object.assign(d.lines, src.lines || {});
    const stageId = new Map();
    for (const s of src.stages) {
      let t = d.stages.find(x => x.name === s.name);
      if (!t) { t = { ...s, id: newId('stage') }; d.stages.push(t); }
      stageId.set(s.id, t.id);
    }
    for (const e of src.elements) d.elements.push({ ...structuredClone(e), id: newId(e.role), stage: stageId.get(e.stage) || d.stages[0].id, board: b.id, points: e.points.map(([x, y, t, p]) => [x + at.x, y + at.y, t, p]) });
    for (const dec of src.decisions || []) d.decisions.push({ ...dec, id: newId('dec'), stage: stageId.get(dec.stage) || d.stages[0].id });
  });
  if (text) store.updateBoard(b.id, { text });
  return b;
}

// ---- the task: the painting ---------------------------------------------------------------------
const painting = dataUrl('fixtures/references/klee/klee-1922-senecio.jpg', 'image/jpeg');
store.addStage({ name: 'Reference', kind: 'analysis' });
const refStage = store.doc.stages.find(s => s.name === 'Reference').id;
store.addElement({ role: 'image', stage: refStage, board: undefined, src: painting, points: [[60, 60], [860, 60], [860, 940], [60, 940]], label: 'Paul Klee, Senecio (1922)', why: 'the painting studied' });
store.updateBoard(MAIN, { text: `The same task for each: study Paul Klee's *Senecio* (1922), reproduce it, then draw a lighthouse at dusk in its manner. Every session was recorded as a take; the drawings below are where each ended.

| Mode | Time |
|---|---|
| Claude (agent), the *Study: Senecio* walkthrough | 5:43 |
| Qwen 3.8 27B, local (Ollama), with the image | 9:36 |
| Gemma 4 12B, local (Ollama), with the image | 1:57 |
| lev 350M, Decide, trained on 750 rules decisions | 0:40 |` });

// ---- the sessions --------------------------------------------------------------------------------
const claude = take('claude-walkthrough'), qwen = take('qwen27b'), gemma = take('gemma12b'), lev = take('lev');

place('Claude · reproduction', docAt(claude, 288000), `Named four methods (a circle cut by a grid; paint rubbed over gauze; incised lines; three small accents), wrote them as two brushes (\`scumble\`, \`incised\`) and a staged score.`);
place('Claude · lighthouse', docAt(claude, claude.duration), `The methods carried over: the lamp room as the circle and grid, the neck's squares as the tower, the brow as a wave, the mouth-cross as a boat.`);
place('Qwen 27B · reproduction', docAt(qwen, 560000), `The best analysis of the models: **geometric grid**, **face floats on the ground**, **discrete cells**, **mid-range values with dark accents**. Built a warm grid of cells with red eyes, a violet mouth and a green brow, but no circle and no incised lines. Its cells came out rounded (the studio's flat brush smoothed outlines; fixed since). 299 s.`);
place('Qwen 27B · lighthouse', docAt(qwen, qwen.duration), `Sound decisions (the lamp as the head, one loud red beacon, scraped strokes; three brushes of its own: \`scrape\`, \`lay\`, \`net\`), but the picture became a literal dusk seascape; the manner did not carry. 266 s.`);
place('Gemma 12B · reproduction', docAt(gemma, 110000), `Symmetrical, geometric; wrote a \`gauzePaint\` brush. The result is faint: a hatched circle, an axis, a few hatched blocks, one dot. No color planes, no accents. 56 s.`);
place('Gemma 12B · lighthouse', docAt(gemma, gemma.duration), `A circle on a hatched column: the structural echo is there (head on neck), but thin. Wrote a \`klee_hatch\` brush. 50 s.`);
place('lev 350M · reproduction', docAt(lev, lev.duration), `Ten confident steps in the rules' order (look, block ×2, structure ×2, value ×3, accent, stop), value always on one region. Marks come from the Decide executors: blocked regions, hatching, stipple. No color, no circle. (The lighthouse was not possible: lev answers questions about an analyzed image; it has no subject input.)`);

// ---- what this shows: the comparison and the findings (text) -------------------------------------
const cmp = store.addBoard({ title: 'What this shows', width: 1746, height: 850, ground: '#ffffff' });
const c = boardById(store.doc, cmp.id);
store.addElement({ role: 'image', stage: refStage, board: cmp.id, src: dataUrl(`${DIR}/comparison.png`, 'image/png'), points: [[c.x, c.y], [c.x + 1746, c.y], [c.x + 1746, c.y + 850], [c.x, c.y + 850]], label: 'The four sessions side by side', why: 'comparison' });
store.updateBoard(cmp.id, { text: `**Seeing is ahead of making.** Qwen 27B's decisions read the painting almost as a teacher would; its score could not yet realize them (no circle, no incised structure), and its lighthouse drifted to the subject instead of the manner. Gemma saw the structure and drew very little of it.

**Methods written as code transfer.** The agent's study transferred because the methods were explicit (a grid cut from a circle, a rubbed paint brush, incised lines, three accents), not implied by a picture.

**lev is a pipeline, not yet a painter.** It learned the rules' plan; it needs human decisions (taste) and executors that use written methods.

Next: give models the observations as the brief (to separate seeing from writing code); let lev's executors use written methods; collect Decide labels from people.` });

store.change('page intro', d => { d.meta = { ...(d.meta || {}), intro: 'Artist Model Studio · September 2026. This page is the report on the Senecio runs, made as one drawing with a board per step and exported from the studio.' }; });

const doc = store.doc;
const html = sceneHtml(doc, { byline: 'Artist Model Studio' });
writeFileSync(`${DIR}/report-scene.html`, html);
console.log(`boards: ${doc.boards.length + 1}, marks: ${doc.elements.length}, page: ${(html.length / 1024).toFixed(0)} KB`);

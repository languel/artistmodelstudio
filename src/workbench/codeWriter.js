/**
 * Writing board code with a model: the studio's own language, from a plain description.
 *
 *   await writeCode(app, { request: 'a grid of dots colored from the painting seurat', board: 'Sketch' })
 *     → { ok, code, marks, tries, error, engine, model, ms }
 *
 * Which model writes it is the *Code model* setting (Settings › Model): a bigger model than the one that talks and draws, because writing
 * a program is where model size shows (measured, docs/quick-commands.md: a 9B coder reproduced the lessons 14/14, a 2B model 9/14).
 * Unset, the assistant's own model writes it. The flow is the one the lesson evals use: write, repair the mistakes that have one right
 * answer (`fixCode`), run it on the board, and when the studio says it failed (or drew nothing) show the model that and let it try again.
 */
import { SCRIPT_REFERENCE } from '../process/script.js';
import { fixCode } from './codeFix.js';
import { codeTarget, currentEngine } from './modelStore.js';

export const CODE_SYSTEM = `You write short programs in a drawing studio's own language (JavaScript). Reply with ONE fenced js code block and nothing else.
Only the things listed here exist; do not invent others (no brush(), stage(), walk(), defineLine(), classes, imports, or assigning to a call). The program already runs on its own board: never call board(), artboard() or stage().
- The board: x and y are fractions from 0 to 1 (x to the right, y down). width and height are its size in units.
- Marks: point(x, y, { size, color }). line(points, { color, width }) with points like [[x, y], [x, y]]. plane(points, { color }) a closed shape; rect(x, y, w, h) and circle(cx, cy, r) give points for plane or line. note(x, y, text).
- Loops: for (const i of range(n)) { ... }. random() is 0 to 1; random(a, b). Math, sin, cos, PI, TAU work.
- Pictures: const s = source('name'). s.color(x, y) is the picture's color at a place, already a color string: pass it straight in, point(x, y, { color: s.color(x, y) }). s.value(x, y) is its brightness, 0 (dark) to 1 (light). A source can be read with source('name', { fit: 'contain' }).
- Sizes (point size, line width) are in board units, like width and height (a board is often 800 wide). For a grid of square cells: cell = width / cols, rows = Math.round(cols * height / width), and a dot as big as its cell has size cell.
- "Lighter" or "brighter than t" means s.value(x, y) > t; "darker than t" means s.value(x, y) < t. "Darker gets bigger" means the size grows as 1 - s.value(x, y).
- Only read a picture (source) when the request names one; otherwise do not call source() at all.
- A number a person may want to change gets a range comment: const n = 60 /* 10..120 */.
Language reference:
${SCRIPT_REFERENCE}

Example:
\`\`\`js
// A grid of squares, 8 across and 5 down, each the color of the picture 'photo' at its place.
const s = source('photo')
const cols = 8, rows = 5
for (const i of range(cols)) for (const j of range(rows)) {
  const x = (i + 0.5) / cols, y = (j + 0.5) / rows
  plane(rect(x - 0.04, y - 0.04, 0.08, 0.08), { color: s.color(x, y) })
}
\`\`\``;

/** The code in a reply: the last fenced block (a model that thinks aloud may show drafts first), without any <think> section. */
export function codeOf(text) {
  text = String(text || '').replace(/<think>[\s\S]*?(<\/think>|$)/gi, '');
  const all = [...text.matchAll(/```(?:js|javascript|ts|typescript)?\s*\n([\s\S]*?)```/gi)];
  if (all.length) return all.at(-1)[1].trim();
  const open = /```(?:js|javascript)?\s*\n([\s\S]*)$/i.exec(text);   // (a block the model never closed)
  return (open ? open[1] : text).trim();
}

/** Who writes: the Code model if one is set, else the assistant's own model. → { engine, artist, model, label } */
export function codeModel(app) {
  const t = codeTarget(), engine = t?.engine || currentEngine(), artist = app.artists.get(engine);
  const model = t?.model || artist?.getModel?.() || '';
  return { engine, artist, model, label: `${engine}${model ? `: ${model}` : ''}`, own: !t };
}

const wait = ms => new Promise(r => setTimeout(r, ms));
/** Sampling that suits each engine: Ollama and LFM3 use the model's own (greedy for text); a transformers.js model needs a small temperature to sample at all. */
const sampling = engine => (engine === 'webgpu' ? { temperature: 0.1 } : {});

/**
 * Write code for a board and run it. board: an id or a title (made if there is none of that name); without it, the active board.
 * onStatus(text) says what is happening (loading, writing, running, fixing). Never throws: the result says what happened.
 */
export async function writeCode(app, { request, board = null, repairs = 2, maxTokens = 1400, signal = null, onStatus = () => {} } = {}) {
  const t0 = performance.now(), who = codeModel(app);
  const out = { ok: false, code: '', marks: 0, tries: 0, error: null, engine: who.engine, model: who.model, ms: 0 };
  if (!who.artist?.complete) { out.error = `${who.engine} cannot write code here (it has no way to be asked a question: pick an engine in Settings › Model)`; return out; }
  try {
    const id = await boardFor(app, board);
    // (a model that runs in this page may have to be fetched first: say how far it is, or a 2 GB download looks like a freeze)
    const say = text => { onStatus(text); try { window.dispatchEvent(new CustomEvent('ams-engine-status', { detail: text })); } catch { /* no window */ } };
    const prevProgress = who.artist.onProgress;
    if (who.engine === 'webgpu') who.artist.onProgress = p => { if (p?.status === 'progress_total' || p?.status === 'progress') say(`Loading ${String(who.model).split('/').pop()}: ${Math.round(p.progress || 0)}%`); prevProgress?.(p); };
    say(`Writing code with ${who.model || who.engine}…`);
    const ask = user => who.artist.complete({ system: CODE_SYSTEM, user, maxTokens, signal, model: who.own ? undefined : who.model, ...sampling(who.engine) });
    let reply = await ask(request);
    for (out.tries = 1; ; out.tries++) {
      signal?.throwIfAborted?.();
      const fixed = fixCode(codeOf(reply));
      out.code = fixed.code; out.error = null;
      onStatus(out.tries > 1 ? `Running the fixed code (try ${out.tries})…` : 'Running it…');
      let res;
      try { res = await window.ams.callTool('ams_board', { action: 'code', id, source: out.code }, { quiet: true }); } catch (err) { res = { error: err.message }; }
      // (the studio reports a broken program as { error, line } rather than throwing; a program that draws nothing has not done what was asked)
      if (res?.error) out.error = `${res.error}${res.line ? ` (line ${res.line})` : ''}`;
      else if (!res?.marks) out.error = 'It ran, but drew nothing: every mark needs point(), line() or plane(), and rect() and circle() only give points.';
      else { out.ok = true; out.marks = res.marks; break; }
      if (out.tries > repairs) break;
      onStatus(`It did not work (${out.error}). Asking for a fix…`);
      reply = await ask(`${request}\n\nYour code:\n\`\`\`js\n${out.code}\n\`\`\`\nThe studio says: ${out.error}\nFix it, using only the functions listed. Reply with the corrected code block.`);
    }
  } catch (err) { out.error = err.name === 'AbortError' ? 'Stopped.' : err.message; }
  if (who.engine === 'webgpu') who.artist.onProgress = null;
  out.ms = Math.round(performance.now() - t0);
  return out;
}

/** The board to write into: by id or title, made if named and new; else the one being worked on. */
async function boardFor(app, board) {
  const boards = app.store.doc.boards || [];
  if (board) {
    const hit = boards.find(b => b.id === board || b.title === board);
    if (hit) return hit.id;
    const made = await window.ams.callTool('ams_board', { action: 'add', title: String(board), width: 800, height: 600 }, { quiet: true });
    await wait(50);
    return made.id || (app.store.doc.boards || []).find(b => b.title === board)?.id;
  }
  return app.activeBoard && app.activeBoard !== 'main' ? app.activeBoard : (boards.find(b => b.id === app.activeBoard)?.id || (await boardFor(app, 'Code')));
}

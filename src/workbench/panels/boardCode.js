/**
 * Board code: the active board's own source, in the language of its kind.
 *   drawing   the studio's score: it runs with the board as its artboard (fractions of the board),
 *             and each run replaces the marks the last one made (edit, drag a slider: it redraws)
 *   markdown  a document (Obsidian-flavored: math, Mermaid, callouts, [[links]] to boards)
 *   html      a page, in a sandboxed frame
 *   p5        a p5.js sketch, running while the board is live (window.ams: the bridge to the studio)
 * The three document kinds show as you type.
 */
import { h } from '../ui.js';
import { icon } from '../icons.js';
import { createCodeEditor } from '../codeEditor.js';
import { controlStrip } from '../codeParams.js';
import { runScript } from '../../process/script.js';
import { boardById, boardKind, boardsInFrame, MAIN } from '../../process/boards.js';

const TEMPLATE = `// This board's code: it redraws the board's marks each time it runs.
// Coordinates are fractions of the board. Drag the slider, or Cmd-drag any number.
const n = 9 /* 1..40 */
for (const i of range(n)) {
  const x = 0.1 + 0.8 * i / max(1, n - 1)
  point(x, 0.5 + 0.25 * sin(i * 0.9), { size: 24, why: 'a point: a place, with tension' })
}
`;

const TEMPLATES = {
  drawing: TEMPLATE,
  markdown: `# A page on the canvas

Write in **Markdown**: math like $E = mc^2$, tables, callouts, diagrams.

> [!tip] Links
> [[Main]] goes to a board; ![[Main]] shows its picture.

| kind | where it runs |
| --- | --- |
| drawing | the studio |
| p5 | a frame, while live |
`,
  html: `<style>
  body { font: 16px/1.5 system-ui, sans-serif; color: #dadada; padding: 24px; }
</style>
<h1>A page</h1>
<p>Plain HTML in a sandboxed frame. <code>window.ams</code> reaches the studio.</p>
<button onclick="ams.call('ams_board', { action: 'list' }).then(r => out.textContent = r.boards.map(b => b.title).join(', '))">List the boards</button>
<p id="out"></p>
`,
  p5: `// A p5.js sketch on the board. ams.width, ams.height: the board; ams.call(tool, args), ams.mark(role, points),
// await ams.frame('source'): the bridge to the studio.
function setup() {
  createCanvas(ams.width, ams.height);
}

function draw() {
  background(20);
  noFill();
  stroke(220);
  const r = 0.35 * min(width, height) * (1 + 0.1 * sin(frameCount * 0.05));
  circle(width / 2, height / 2, 2 * r);
}
`
};
const LANGUAGE = { drawing: 'ams', markdown: 'markdown', html: 'html', p5: 'p5', frame: 'markdown' };
const KIND_LABELS = [['drawing', 'Drawing (studio code)'], ['markdown', 'Markdown'], ['html', 'HTML'], ['p5', 'p5.js'], ['frame', 'Frame (a slide)']];

export function mountBoardCode(root, app) {
  let id = null, timer = 0, loading = false;
  const head = h('div', { class: 'wb-row wb-row-actions' });
  const host = h('div', { class: 'wb-code-host' });
  const out = h('div', { class: 'wb-script-out' });
  const strip = h('div', { class: 'wb-preview-row wb-board-strip' });
  root.append(head, strip, host, out);
  let live = (() => { try { return localStorage.getItem('ams_board_live') !== '0'; } catch { return true; } })();

  const kindOf = () => boardKind(id && boardById(app.store.doc, id));
  // Documents (markdown, html, p5) are the board's code itself: kept as you type, shown at once.
  const save = () => { if (!id) return; const b = boardById(app.store.doc, id); if (b && (b.code || '') !== editor.value) app.store.updateBoard(id, { code: editor.value }); out.textContent = ''; out.classList.remove('error'); };
  const run = () => {
    if (!id) return;
    if (kindOf() !== 'drawing') { save(); if (kindOf() === 'p5') app.frames?.restart?.(id); return; }
    const res = app.store.runBoardCode(id, editor.value, runScript);
    if (res.error) { out.textContent = res.line ? `Line ${res.line}: ${res.error}` : res.error; out.classList.add('error'); editor.markError(res.line || 1, res.error); return; }
    out.classList.remove('error'); editor.markError(null);
    out.textContent = `${res.marks} mark${res.marks === 1 ? '' : 's'}${res.logs?.length ? ` · ${res.logs.join(' · ')}` : ''}`;
  };
  const editor = createCodeEditor(host, { value: '', onRun: run, onChange: () => {
    if (loading) return;
    clearTimeout(timer);
    if (kindOf() !== 'drawing') { timer = setTimeout(save, 400); return; }
    if (live) timer = setTimeout(run, 250);
  } });
  // Sliders beside the preview: here the board is the preview, so they sit above the code.
  strip.append(controlStrip(editor));

  const drawHead = () => {
    const b = id && boardById(app.store.doc, id);
    head.replaceChildren(
      h('span', { class: 'wb-muted wb-small', style: { flex: 1 } }, b ? b.title : 'Select a board (its title) or go to one'),
      b ? h('select', { class: 'wb-select', title: 'What the board holds: a drawing (studio code), a Markdown document, an HTML page or a p5.js sketch', onchange: e => setKind(e.target.value) }, ...KIND_LABELS.map(([k, l]) => h('option', { value: k, selected: boardKind(b) === k }, l))) : null,
      h('button', { class: `wb-icon-btn${live ? ' on' : ''}`, title: live ? 'Live: runs as you edit (click for Cmd+Enter only)' : 'Runs with Cmd+Enter (click to run as you edit)', html: '<svg viewBox="0 0 24 24" width="14" height="14"><path d="M13 3L5 14h6l-1 7 8-11h-6z" fill="currentColor"/></svg>', onclick: () => { live = !live; try { localStorage.setItem('ams_board_live', live ? '1' : '0'); } catch { /* ignore */ } drawHead(); } }),
      boardKind(b) !== 'drawing' ? null : h('button', { class: `wb-icon-btn${b?.follow ? ' on' : ''}`, title: b?.follow ? 'Following its sources: the code re-runs on each new frame (click to stop)' : 'Follow sources: re-run the code on each new frame of the sources it reads (source(\'…\'), fit(\'…\'))', html: icon('follow'), onclick: () => { if (b) app.setBoardFollow(b.id, !b.follow); } }),
      ['markdown', 'html', 'frame'].includes(boardKind(b)) ? null : h('button', { class: 'wb-btn primary', title: boardKind(b) === 'p5' ? 'Run (Cmd+Enter): restart the sketch' : 'Run (Cmd+Enter): the board is redrawn from its code', onclick: run }, 'Run'),
      boardKind(b) === 'frame' ? null : h('button', { class: 'wb-btn', title: 'Remove the marks the code made, and the code', onclick: () => { if (!id) return; app.store.change('clear board code', d => { d.elements = d.elements.filter(e => !(e.by?.kind === 'code' && e.by?.name === id)); if (id === MAIN) delete d.artboard.code; else delete d.boards.find(x => x.id === id).code; }); load(id, true); } }, 'Clear'));
  };

  // Change what the board holds; an empty board (or one still showing a template) gets the new template.
  const setKind = kind => {
    const b = id && boardById(app.store.doc, id);
    if (!b) return;
    const code = kind === 'frame' ? b.code : !b.code || Object.values(TEMPLATES).includes(b.code) ? (kind === 'drawing' ? undefined : TEMPLATES[kind]) : b.code;
    app.store.updateBoard(id, { kind, ...(code !== b.code ? { code: code ?? '' } : {}) });
    load(id, true);
  };

  const load = (next, force = false) => {
    if (!force && next === id) return;
    id = next;
    const b = id && boardById(app.store.doc, id);
    const kind = boardKind(b);
    // A frame has no code: it holds boards (listed here, each a link to it).
    host.style.display = strip.style.display = kind === 'frame' ? 'none' : '';
    if (kind === 'frame') {
      const inside = boardsInFrame(app.store.doc, b);
      out.classList.remove('error');
      out.replaceChildren(h('span', {}, `A frame (a slide): ${inside.length ? 'it holds ' : 'empty: boards whose centres lie inside it belong to it.'}`), ...inside.map((x, i) => h('a', { href: '#', class: 'wb-link', onclick: e => { e.preventDefault(); app.goToBoard(x.id, { animate: true }); } }, `${i ? ', ' : ''}${x.title}`)));
      drawHead();
      return;
    }
    editor.setLanguage(LANGUAGE[kind]);
    loading = true;
    editor.value = b ? (b.code || TEMPLATES[kind]) : '';
    loading = false;
    out.textContent = b && !b.code ? (kind === 'drawing' ? 'A template: Run (or edit it) to draw it on the board.' : 'A template: edit it and it shows on the board.') : '';
    out.classList.remove('error');
    drawHead();
  };

  app.on('board', () => load(app.canvas.selectedBoard || app.activeBoard || MAIN));
  app.on('document', reason => {
    if (/follow/.test(reason || '')) drawHead();
    else if ((reason === 'board code' || reason === 'undo' || reason === 'redo') && id) { const b = boardById(app.store.doc, id); if (b && (b.code || '') !== editor.value && (b.code || kindOf() === 'drawing')) load(id, true); }
  });
  app.on('frame-error', (bid, d) => { if (bid === id) { out.textContent = d.line ? `Line ${d.line}: ${d.message}` : d.message; out.classList.add('error'); } });
  app.boardCode = { open: bid => load(bid, true), run };
  load(app.activeBoard || MAIN);
}

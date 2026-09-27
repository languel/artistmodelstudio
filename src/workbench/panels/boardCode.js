/**
 * Board code: the active board's own score. It runs with the board as its artboard (coordinates
 * are fractions of the board), and each run replaces the marks the last one made, so the board is
 * live: edit the code, drag a slider (params, a range comment, Cmd-drag a number) and it redraws.
 */
import { h } from '../ui.js';
import { icon } from '../icons.js';
import { createCodeEditor } from '../codeEditor.js';
import { controlStrip } from '../codeParams.js';
import { runScript } from '../../process/script.js';
import { boardById, MAIN } from '../../process/boards.js';

const TEMPLATE = `// This board's code: it redraws the board's marks each time it runs.
// Coordinates are fractions of the board. Drag the slider, or Cmd-drag any number.
const n = 9 /* 1..40 */
for (const i of range(n)) {
  const x = 0.1 + 0.8 * i / max(1, n - 1)
  point(x, 0.5 + 0.25 * sin(i * 0.9), { size: 24, why: 'a point: a place, with tension' })
}
`;

export function mountBoardCode(root, app) {
  let id = null, timer = 0, loading = false;
  const head = h('div', { class: 'wb-row wb-row-actions' });
  const host = h('div', { class: 'wb-code-host' });
  const out = h('div', { class: 'wb-script-out' });
  const strip = h('div', { class: 'wb-preview-row wb-board-strip' });
  root.append(head, strip, host, out);
  let live = (() => { try { return localStorage.getItem('ams_board_live') !== '0'; } catch { return true; } })();

  const run = () => {
    if (!id) return;
    const res = app.store.runBoardCode(id, editor.value, runScript);
    if (res.error) { out.textContent = res.line ? `Line ${res.line}: ${res.error}` : res.error; out.classList.add('error'); editor.markError(res.line || 1, res.error); return; }
    out.classList.remove('error'); editor.markError(null);
    out.textContent = `${res.marks} mark${res.marks === 1 ? '' : 's'}${res.logs?.length ? ` · ${res.logs.join(' · ')}` : ''}`;
  };
  const editor = createCodeEditor(host, { value: '', onRun: run, onChange: () => { if (loading || !live) return; clearTimeout(timer); timer = setTimeout(run, 250); } });
  // Sliders beside the preview: here the board is the preview, so they sit above the code.
  strip.append(controlStrip(editor));

  const drawHead = () => {
    const b = id && boardById(app.store.doc, id);
    head.replaceChildren(
      h('span', { class: 'wb-muted wb-small', style: { flex: 1 } }, b ? `${b.title}: its own code` : 'Select a board (its title) or go to one'),
      h('button', { class: `wb-icon-btn${live ? ' on' : ''}`, title: live ? 'Live: runs as you edit (click for Cmd+Enter only)' : 'Runs with Cmd+Enter (click to run as you edit)', html: '<svg viewBox="0 0 24 24" width="14" height="14"><path d="M13 3L5 14h6l-1 7 8-11h-6z" fill="currentColor"/></svg>', onclick: () => { live = !live; try { localStorage.setItem('ams_board_live', live ? '1' : '0'); } catch { /* ignore */ } drawHead(); } }),
      h('button', { class: `wb-icon-btn${b?.follow ? ' on' : ''}`, title: b?.follow ? 'Following its sources: the code re-runs on each new frame (click to stop)' : 'Follow sources: re-run the code on each new frame of the sources it reads (source(\'…\'), fit(\'…\'))', html: icon('follow'), onclick: () => { if (b) app.setBoardFollow(b.id, !b.follow); } }),
      h('button', { class: 'wb-btn primary', title: 'Run (Cmd+Enter): the board is redrawn from its code', onclick: run }, 'Run'),
      h('button', { class: 'wb-btn', title: 'Remove the marks the code made, and the code', onclick: () => { if (!id) return; app.store.change('clear board code', d => { d.elements = d.elements.filter(e => !(e.by?.kind === 'code' && e.by?.name === id)); if (id === MAIN) delete d.artboard.code; else delete d.boards.find(x => x.id === id).code; }); load(id, true); } }, 'Clear'));
  };

  const load = (next, force = false) => {
    if (!force && next === id) return;
    id = next;
    const b = id && boardById(app.store.doc, id);
    loading = true;
    editor.value = b ? (b.code || TEMPLATE) : '';
    loading = false;
    out.textContent = b && !b.code ? 'A template: Run (or edit it) to draw it on the board.' : '';
    out.classList.remove('error');
    drawHead();
  };

  app.on('board', () => load(app.canvas.selectedBoard || app.activeBoard || MAIN));
  app.on('document', reason => { if (/follow/.test(reason || '')) drawHead(); else if (reason === 'board code' && id) { const b = boardById(app.store.doc, id); if (b?.code && b.code !== editor.value) load(id, true); } });
  app.boardCode = { open: bid => load(bid, true), run };
  load(app.activeBoard || MAIN);
}

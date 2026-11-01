/**
 * Board code: the active board's own source, in the language of its kind.
 *   drawing   the studio's score: it runs with the board as its artboard (fractions of the board),
 *             and each run replaces the marks the last one made (edit, drag a slider: it redraws)
 *   markdown  a document (Obsidian-flavored: math, Mermaid, callouts, [[links]] to boards)
 *   html      a page, in a sandboxed frame
 *   p5        a p5.js sketch, running while the board is live (window.ams: the bridge to the studio)
 * The three document kinds show as you type.
 */
import { h, editInPlace } from '../ui.js';
import { icon } from '../icons.js';
import { createCodeEditor } from '../codeEditor.js';
import { controlStrip } from '../codeParams.js';
import { runScript } from '../../process/script.js';
import { boardById, boardKind, boardsInFrame, MAIN } from '../../process/boards.js';
import { showMenu } from '../menu.js';
import { askConfirm } from '../dialog.js';
import { TEMPLATES, snippetsFor, saveSnippet, deleteSnippet, isBlank } from '../snippets.js';

const LANGUAGE = { drawing: 'ams', markdown: 'markdown', html: 'html', p5: 'p5', three: 'three', frame: 'markdown', playlist: 'p5' };
const KIND_LABELS = [['drawing', 'Drawing (studio code)'], ['markdown', 'Markdown'], ['html', 'HTML'], ['p5', 'p5.js'], ['three', 'three.js'], ['playlist', 'Playlist'], ['frame', 'Frame (a slide)']];

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
    if (kindOf() !== 'drawing') { save(); if (kindOf() === 'p5' || kindOf() === 'three') app.frames?.restart?.(id); return; }
    const res = app.store.runBoardCode(id, editor.value, runScript);
    if (res.error) { out.textContent = res.line ? `Line ${res.line}: ${res.error}` : res.error; out.classList.add('error'); editor.markError(res.line || 1, res.error); return; }
    out.classList.remove('error'); editor.markError(null);
    out.textContent = `${res.marks} mark${res.marks === 1 ? '' : 's'}${res.logs?.length ? ` · ${res.logs.join(' · ')}` : ''}`;
  };
  const editor = createCodeEditor(host, { value: '', onRun: run, onNotice: note => app.log?.(note), onChange: () => {
    if (loading) return;
    clearTimeout(timer);
    if (kindOf() !== 'drawing') { if (kindOf() === 'p5' || kindOf() === 'three') app.frames?.ctl?.(id, editor.value); timer = setTimeout(save, 400); return; }
    if (live) timer = setTimeout(run, 250);
  } });
  // Sliders beside the preview: here the board is the preview, so they sit above the code.
  strip.append(controlStrip(editor));

  // Snippets: a dropdown like the kind's. Choosing one starts the board from it (undo brings the code back); a board saves as
  // a snippet under its own name.
  const snippetSelect = b => {
    const kind = boardKind(b), { builtin, user } = snippetsFor(kind);
    const opt = (value, label) => h('option', { value }, label);
    const sel = h('select', { class: 'wb-select wb-snippets', title: 'Snippets: start this board from one (Cmd+Z undoes it). “Save” keeps this code as a snippet named after the board', onchange: async () => {
      const v = sel.value; sel.value = ''; sel.blur();
      if (v === 'save') { const text = editor.selectionText() || editor.value; if (text.trim()) { saveSnippet(kind, b.title, text); app.log?.(`Snippet “${b.title}” saved for ${kind} boards.`); drawHead(); } return; }
      if (v.startsWith('rm:')) { deleteSnippet(kind, v.slice(3)); drawHead(); return; }
      const sn = [...builtin, ...user].find(x => x.id === v);
      if (!sn) return;
      if (!isBlank(kind, editor.value) && !(await askConfirm(`Replace this board's code with “${sn.title}”? Cmd+Z brings it back.`))) return;
      editor.value = sn.code; editor.focus();
    } },
      opt('', '{ } Snippets'),
      builtin.length ? h('optgroup', { label: 'Built in' }, ...builtin.map(x => opt(x.id, x.title))) : null,
      user.length ? h('optgroup', { label: 'Yours' }, ...user.map(x => opt(x.id, x.title))) : null,
      h('optgroup', { label: 'Keep' }, opt('save', `Save as “${b.title}”`), ...user.map(x => opt(`rm:${x.id}`, `Remove “${x.title}”`))));
    return sel;
  };

  const drawHead = () => {
    const b = id && boardById(app.store.doc, id);
    head.replaceChildren(
      ['markdown', 'html', 'frame', 'playlist'].includes(boardKind(b)) ? null : h('button', { class: 'wb-icon-btn', title: boardKind(b) === 'p5' || boardKind(b) === 'three' ? 'Run (Cmd+Enter): restart the sketch' : 'Run (Cmd+Enter): the board is redrawn from its code', html: icon('play'), onclick: run }),
      h('button', { class: `wb-icon-btn${live ? ' on' : ''}`, title: live ? 'Live: runs as you edit (click for Cmd+Enter only)' : 'Runs with Cmd+Enter (click to run as you edit)', html: '<svg viewBox="0 0 24 24" width="14" height="14"><path d="M13 3L5 14h6l-1 7 8-11h-6z" fill="currentColor"/></svg>', onclick: () => { live = !live; try { localStorage.setItem('ams_board_live', live ? '1' : '0'); } catch { /* ignore */ } drawHead(); } }),
      boardKind(b) !== 'drawing' ? null : h('button', { class: `wb-icon-btn${b?.follow ? ' on' : ''}`, title: b?.follow ? 'Following its sources: the code re-runs on each new frame (click to stop)' : 'Follow sources: re-run the code on each new frame of the sources it reads (source(\'…\'), fit(\'…\'))', html: icon('follow'), onclick: () => { if (b) app.setBoardFollow(b.id, !b.follow); } }),
      h('span', { class: 'wb-muted wb-small wb-board-name', style: { flex: 1, cursor: b ? 'text' : '' }, title: b ? 'Double-click to rename the board (its snippet is saved under this name)' : '', ondblclick: e => { if (b) editInPlace(e.currentTarget, v => app.store.updateBoard(id, { title: v }), b.title, () => drawHead()); } }, b ? b.title : 'Select a board (its title) or go to one'),
      b ? h('select', { class: 'wb-select', title: 'What the board holds: a drawing (studio code), a Markdown document, an HTML page, a p5.js sketch or a three.js sketch', onchange: e => setKind(e.target.value) }, ...KIND_LABELS.map(([k, l]) => h('option', { value: k, selected: boardKind(b) === k }, l))) : null,
      ['frame', 'player'].includes(boardKind(b)) ? null : snippetSelect(b),
      b ? h('button', { class: 'wb-icon-btn', title: 'Keep this board in Assets: its picture (Cmd+Shift+S), its drawing or its code', html: icon('save'), onclick: e => showMenu(app.assetItems(id), e.clientX, e.clientY) }) : null,
      ['p5', 'three', 'html'].includes(boardKind(b)) ? h('button', { class: 'wb-icon-btn', title: 'Export this sketch as a standalone page', html: icon('export'), onclick: e => showMenu(app.sketchExportItems(id), e.clientX, e.clientY) }) : null);
  };

  // Change what the board holds; an empty board (or one still showing a template) gets the new template.
  const setKind = kind => {
    const b = id && boardById(app.store.doc, id);
    if (!b) return;
    const code = kind === 'frame' ? b.code : !b.code || Object.values(TEMPLATES).includes(b.code) ? (kind === 'drawing' ? undefined : TEMPLATES[kind]) : b.code;
    // A drawing's code made marks; a sketch does not, so they go with the change (undo brings them back).
    if (boardKind(b) === 'drawing' && kind !== 'drawing') app.store.change('change board kind', d => { d.elements = d.elements.filter(e => !(e.by?.kind === 'code' && e.by?.name === id)); });
    app.store.updateBoard(id, { kind, ...(code !== b.code ? { code: code ?? '' } : {}) });
    load(id, true);
  };

  const load = (next, force = false) => {
    // A code board has no code of its own: the panel shows the code it is on.
    const on = next && boardById(app.store.doc, next);
    if (on && boardKind(on) === 'code' && on.of) next = on.of;
    if (!force && next === id) return;
    id = next;
    const b = id && boardById(app.store.doc, id);
    const kind = boardKind(b);
    // A frame has no code: it holds boards (listed here, each a link to it).
    host.style.display = strip.style.display = kind === 'frame' || kind === 'player' ? 'none' : '';
    if (kind === 'player') {
      out.classList.remove('error');
      out.replaceChildren(h('span', {}, `A player: play, scrub, step and speed for the source “${b.source || '—'}”. It has no code.`));
      head.replaceChildren(h('span', { class: 'wb-muted wb-small' }, b.title));
      return;
    }
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

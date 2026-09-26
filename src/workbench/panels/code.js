/**
 * Code: everything in the studio as code, in one editor with modes.
 *   Score      the drawing's score (write, run, exercises)
 *   Brush      a brush's code, with a live preview
 *   Sculpt     a sculpt tool's code, with a preview sweep
 *   Selection  the selected marks as score code: edit and apply, they change in place
 *   Clip       a timeline clip as clip({ … })
 * Right-click a mark or a clip → Show code opens the matching mode.
 */
import { h } from '../ui.js';
import { mountScript } from './script.js';
import { mountBrushes } from './brushes.js';
import { mountSculpts } from './sculpts.js';
import { mountBoardCode } from './boardCode.js';
import { codeView, setCodeView, onCodeView } from '../codeView.js';
import { icon } from '../icons.js';
import { createCodeEditor } from '../codeEditor.js';
import { selectionCode, applySelectionCode, replaceElements, clipCode, applyClipCode } from '../../process/codegen.js';

const MODES = [['score', 'Score', 'The drawing as a score'], ['brush', 'Brush', 'Brushes are code'], ['sculpt', 'Sculpt', 'Sculpt tools are code'], ['board', 'Board', 'The active board’s own code: it redraws the board, live'], ['selection', 'Selection', 'The selected marks as code'], ['clip', 'Clip', 'The selected timeline clip as code']];

export function mountCode(root, app) {
  let mode = localStorage.getItem('ams_code_mode') || 'score';
  const bar = h('div', { class: 'wb-seg wb-code-modes' });
  const views = Object.fromEntries(MODES.map(([id]) => [id, h('div', { class: 'wb-code-view', 'data-mode': id })]));
  // Code view toggles (all editors): line numbers, and where param sliders go.
  const toggles = h('div', { class: 'wb-code-toggles' });
  const SLIDERS = [['code', 'slidersCode', 'Sliders on the code lines'], ['preview', 'slidersPreview', 'Sliders beside the preview'], ['off', 'slidersOff', 'No sliders (Cmd-drag numbers still works)']];
  const drawToggles = () => {
    const v = codeView();
    const i = SLIDERS.findIndex(s => s[0] === v.sliders);
    const [, ic, tip] = SLIDERS[Math.max(0, i)];
    toggles.replaceChildren(
      h('button', { class: `wb-icon-btn${v.lineNumbers ? ' on' : ''}`, title: v.lineNumbers ? 'Hide line numbers' : 'Show line numbers', html: icon('lineNumbers'), onclick: () => setCodeView({ lineNumbers: !v.lineNumbers }) }),
      h('button', { class: 'wb-icon-btn', title: `${tip} (click for the next)`, html: icon(ic), onclick: () => setCodeView({ sliders: SLIDERS[(i + 1) % SLIDERS.length][0] }) }));
    for (const el of Object.values(views)) el.classList.toggle('sliders-preview', v.sliders === 'preview');
  };
  onCodeView(drawToggles);
  drawToggles();
  root.classList.add('wb-code-panel');
  root.append(h('div', { class: 'wb-code-top' }, bar, toggles), ...Object.values(views));

  mountScript(views.score, app);
  mountBrushes(views.brush, app);
  mountSculpts(views.sculpt, app);
  mountBoardCode(views.board, app);
  const sel = objectView(views.selection, app, {
    empty: 'Select marks on the canvas (or right-click one → Show code).',
    get: () => { const els = app.selectedElements(); return els.length ? { key: els.map(e => e.id).join(), text: selectionCode(els, app.store.doc), title: `${els.length} mark${els.length === 1 ? '' : 's'}` } : null; },
    apply: src => {
      const ids = [...app.canvas.selected];
      const res = applySelectionCode(app.store.doc, ids, src);
      if (res.error) return res;
      app.store.change('edit as code', d => replaceElements(d, ids, res.elements, res.stages));
      app.canvas.select(res.elements.map(e => e.id));
      return { ok: `Applied: ${res.elements.length} mark${res.elements.length === 1 ? '' : 's'}.` };
    }
  });
  const clip = objectView(views.clip, app, {
    empty: 'Select a clip on the Timeline (or right-click it → Show code).',
    get: () => { const c = app.selectedClip; return c && app.player?.take?.clips.includes(c) ? { key: c.id, text: clipCode(c), title: `${c.track} clip` } : null; },
    apply: src => {
      const c = app.selectedClip;
      const res = applyClipCode(c, src);
      if (res.error) return res;
      Object.assign(c, res.fields);
      app.timelineEdited?.();
      return { ok: 'Applied to the clip.' };
    }
  });

  const setMode = m => {
    mode = m;
    try { localStorage.setItem('ams_code_mode', m); } catch { /* ignore */ }
    bar.replaceChildren(...MODES.map(([id, label, tip]) => h('button', { class: mode === id ? 'on' : '', 'data-guide': `code:${id}`, title: tip, onclick: () => setMode(id) }, label)));
    for (const [id, v] of Object.entries(views)) v.hidden = id !== mode;
    if (m === 'selection') sel.refresh(true);
    if (m === 'clip') clip.refresh(true);
  };
  // Only when the Code panel is showing (the editor is not cheap to refill).
  const visible = () => root.isConnected && root.offsetParent !== null;
  app.on('selection', () => { if (mode === 'selection' && visible()) sel.refresh(); });
  app.on('clip-select', () => { if (mode === 'clip' && visible()) clip.refresh(); });
  app.store.subscribe(() => { if (mode === 'selection' && visible()) sel.refresh(); });

  /** Open the Code panel in a mode: 'score' | 'brush' (id) | 'selection' | 'clip' (clip). */
  app.openCode = (m = 'score', arg) => {
    app.docks.open('script');
    if (m === 'clip' && arg) app.selectClip?.(arg);
    setMode(m);
    if (m === 'brush' && arg) app.brushesPanel?.open(arg);
    if (m === 'sculpt' && arg) app.sculptsPanel?.open(arg);
    if (m === 'board' && arg) app.boardCode?.open(arg);
  };
  app.codeMode = m => setMode(m);
  setMode(mode);
}

/** An editor on one object: shows its code, follows the selection until you edit, applies with Cmd+Enter. */
function objectView(el, app, { empty, get, apply }) {
  const info = h('div', { class: 'wb-muted wb-small' });
  const host = h('div', { class: 'wb-code-host' });
  const out = h('div', { class: 'wb-script-out' });
  let key = null, dirty = false, loading = false;
  const editor = createCodeEditor(host, { value: '', onRun: () => doApply(), onChange: () => { if (!loading) dirty = true; } });
  const doApply = () => {
    const res = apply(editor.value);
    if (res.error) { out.textContent = res.line ? `Line ${res.line}: ${res.error}` : res.error; out.classList.add('error'); editor.markError(res.line || 1, res.error); return; }
    out.textContent = res.ok; out.classList.remove('error'); editor.markError(null); dirty = false; key = null; refresh(true);
  };
  const refresh = (force = false) => {
    const o = get();
    if (!o) { info.textContent = empty; host.hidden = true; buttons.hidden = true; key = null; return; }
    host.hidden = false; buttons.hidden = false;
    if (!force && dirty && o.key !== key) { info.textContent = `${o.title} · your edits are kept (Revert loads the new selection)`; return; }
    if (!force && o.key === key && dirty) return;
    info.textContent = o.title;
    if (o.key !== key || force || !dirty) { loading = true; editor.value = o.text; loading = false; key = o.key; dirty = false; }
  };
  const buttons = h('div', { class: 'wb-row wb-row-actions' },
    h('button', { class: 'wb-btn primary', title: 'Apply the code (Cmd+Enter)', onclick: doApply }, 'Apply'),
    h('button', { class: 'wb-btn', title: 'Discard edits and show the current code', onclick: () => { dirty = false; key = null; out.textContent = ''; editor.markError(null); refresh(true); } }, 'Revert'));
  el.append(info, host, buttons, out);
  return { refresh };
}

/**
 * Brushes: every brush is code. Pick one to read it; fork a built-in, write a new one, or edit
 * yours. The preview redraws as you type (a walk that speeds up and slows down, and a plane).
 * Saved brushes go to your library (all drawings); a drawing carries the brushes it uses.
 */
import { askConfirm, askText } from '../dialog.js';
import { h, selectField } from '../ui.js';
import { BRUSHES, brushSource, compileBrush, saveLibraryBrush, deleteLibraryBrush, isBuiltin, resolveParams, mulberry32 } from '../../process/brushes.js';
import { controlStrip } from '../codeParams.js';
import { createCodeEditor } from '../codeEditor.js';

const TEMPLATE = id => `brush({
  id: '${id}',
  label: '${id[0].toUpperCase()}${id.slice(1)}',
  roles: ['line', 'gesture'],
  doc: 'What this line says, in one sentence.',
  params: {
    width: [0.25, 20, 1.5, 'Stroke width'],
    reach: [0, 60, 12, 'How far the marks reach, by speed']
  },
  draw(ctx, e, p, k) {
    k.beginInk(ctx, e, { width: p.width, opacity: 1 })
    for (const f of k.frames(e)) {
      const r = Math.min(p.reach, f.speed * 1.5)
      k.segment(ctx, f.x - f.nx * r, f.y - f.ny * r, f.x + f.nx * r, f.y + f.ny * r)
    }
    ctx.restore()
  }
})
`;

/** A sample walk that is slow, then fast, then lingers, and a plane to fill. */
function sample(w, h) {
  const pts = []; let x = w * 0.06, y = h * 0.42, hd = -15, t = 0;
  for (let i = 0; i < 90; i++) { const u = i / 89; hd += Math.sin(i / 6) * 8; x += Math.cos(hd * Math.PI / 180) * w * 0.0105; y += Math.sin(hd * Math.PI / 180) * w * 0.0105; t += u < 0.3 ? 60 : u < 0.7 ? 10 : 35; pts.push([x, y, t, 0.5 + 0.3 * Math.sin(i / 9)]); }
  const plane = Array.from({ length: 40 }, (_, i) => { const a = i / 40 * Math.PI * 2; return [w * 0.8 + Math.cos(a) * h * 0.28, h * 0.52 + Math.sin(a) * h * 0.3, 0, 0.5]; });
  return { line: { role: 'line', points: pts, closed: false, color: null, seed: 3 }, plane: { role: 'plane', points: plane, closed: true, color: null, seed: 5 } };
}

export function mountBrushes(root, app) {
  let current = 'ink';
  let def = null;
  const status = h('div', { class: 'wb-script-out' });
  const preview = h('canvas', { class: 'wb-brush-preview', width: 480, height: 130 });
  const previewRow = h('div', { class: 'wb-preview-row' }, preview);
  const host = h('div', { class: 'wb-code-host wb-brush-code' });
  const picker = h('div', { class: 'wb-row wb-row-actions' });
  const actions = h('div', { class: 'wb-row wb-row-actions' });
  root.append(picker, previewRow, host, status, actions);

  const scopeOf = id => (isBuiltin(id) ? 'built-in' : BRUSHES[id]?.scope === 'doc' ? 'this drawing' : 'library');
  const draw = () => {
    const ctx = preview.getContext('2d'), W = preview.width, H = preview.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = app.store.doc.artboard.ground || '#f3efe6'; ctx.fillRect(0, 0, W, H);
    if (!def) return;
    const s = sample(W, H), p = Object.fromEntries(def.params.map(q => [q.key, q.default]));
    try {
      const roles = def.roles || [];
      if (roles.includes('line') || roles.includes('gesture') || roles.includes('guide')) def.draw(ctx, s.line, p, { rng: mulberry32(3), scale: 1 });
      if (roles.includes('plane')) def.draw(ctx, s.plane, p, { rng: mulberry32(5), scale: 1 });
      if (roles.includes('point')) def.draw(ctx, { ...s.line, role: 'point', points: s.line.points.filter((_, i) => i % 15 === 0) }, p, { rng: mulberry32(3), scale: 1 });
    } catch (err) { status.textContent = `Draw: ${err.message}`; status.classList.add('error'); }
  };
  let timer = 0;
  const check = () => {
    try { def = compileBrush(editor.value); status.textContent = `${def.label} · ${scopeOf(current)} · ${def.params.length} params · roles ${def.roles.join(', ')}`; status.classList.remove('error'); editor.markError(null); }
    catch (err) { def = null; status.textContent = err.message; status.classList.add('error'); const m = String(err.stack || '').match(/<anonymous>:(\d+)/); editor.markError(m ? Math.max(1, Number(m[1]) - 3) : 1, err.message); }
    draw();
  };
  const editor = createCodeEditor(host, { value: brushSource(current), onChange: () => { clearTimeout(timer); timer = setTimeout(check, 250); }, onRun: () => save() });
  // Param sliders beside the preview (Code view: sliders in preview).
  previewRow.append(controlStrip(editor));

  // Param sliders act on the marks: the selected ones drawn with this brush, else the current tool's
  // defaults if it uses this brush; otherwise they rewrite the code's defaults (preview only).
  const targets = () => {
    const sel = (app.selectedElements?.() || []).filter(e => e.realize?.brush === current);
    if (sel.length) return { kind: 'sel', ids: sel.map(e => e.id), label: `${sel.length} selected mark${sel.length === 1 ? '' : 's'}` };
    const d = app.tool && app.defaults?.(app.tool);
    if (d?.realize?.brush === current && !(app.selectedElements?.() || []).length) return { kind: 'tool', label: `new ${app.tool} marks` };
    return null;
  };
  let before = null, commitTimer = 0, fromEditor = false;
  const live = {
    target: () => targets()?.label || null,
    get: key => {
      const t = targets();
      if (t?.kind === 'sel') return app.store.doc.elements.find(e => e.id === t.ids[0])?.realize.params?.[key];
      if (t?.kind === 'tool') return app.defaults(app.tool).realize.params?.[key];
      return undefined;
    },
    set: (key, v) => {
      const t = targets();
      if (!t) return false;
      fromEditor = true;
      if (t.kind === 'tool') app.setDefaults(app.tool, { realize: { params: { [key]: v } } });
      else {
        // Direct edits while dragging; one undo step when the slider rests.
        before ??= JSON.stringify(app.store.doc);
        for (const e of app.store.doc.elements) if (t.ids.includes(e.id)) e.realize.params = { ...(e.realize.params || {}), [key]: v };
        app.canvas.invalidate();
        clearTimeout(commitTimer);
        commitTimer = setTimeout(() => { const b = before; before = null; fromEditor = true; app.store.commitFrom(b, 'brush param'); fromEditor = false; }, 350);
      }
      fromEditor = false;
      return true;
    }
  };
  editor.setLive(live);
  const refreshLive = () => { if (!fromEditor) editor.setLive({ ...live }); };
  app.on('selection', refreshLive);
  app.on('tool', refreshLive);

  const open = id => { current = id; editor.value = brushSource(id) || TEMPLATE(id); renderBar(); check(); refreshLive(); };
  const save = () => {
    check();
    if (!def) return;
    if (isBuiltin(def.id)) { status.textContent = `"${def.id}" is built in: change the id to save your version`; status.classList.add('error'); return; }
    try {
      const saved = saveLibraryBrush(editor.value);
      // A drawing that uses it keeps its own copy up to date.
      if (app.store.doc.brushes?.[saved.id]) app.store.change('brush code', d => { d.brushes[saved.id] = editor.value; });
      app.canvas.invalidate();
      app.log(`Saved the brush “${saved.label}” to your library.`);
      current = saved.id; renderBar(); status.textContent = `Saved ${saved.label} to your library`;
    } catch (err) { status.textContent = err.message; status.classList.add('error'); }
  };
  const fork = () => {
    const base = def?.id || current;
    let id = `${base}-2`; for (let n = 2; BRUSHES[id]; n++) id = `${base}-${n}`;
    editor.value = editor.value.replace(/id:\s*(['"])[\w-]+\1/, `id: '${id}'`).replace(/label:\s*(['"])(.*?)\1/, (m, qq, l) => `label: '${l} (mine)'`);
    current = id; check(); renderBar();
  };
  const newBrush = () => { let id = 'mine'; for (let n = 2; BRUSHES[id]; n++) id = `mine-${n}`; current = id; editor.value = TEMPLATE(id); check(); renderBar(); };
  const use = () => {
    if (!def || !BRUSHES[def.id]) { save(); if (!BRUSHES[def?.id]) return; }
    const sel = app.selectedElements?.() || [];
    if (sel.length) app.store.change('brush', d => { for (const e of d.elements) if (sel.some(s => s.id === e.id)) e.realize = { brush: def.id, params: {} }; });
    else if (app.tool && app.setDefaults) app.setDefaults(app.tool, { realize: { brush: def.id } });
    app.log(sel.length ? `Brush “${def.label}” on ${sel.length} element(s).` : `Brush “${def.label}” for new ${app.tool} marks.`);
  };

  const renderBar = () => {
    const groups = [['Built-in', Object.keys(BRUSHES).filter(isBuiltin)], ['Library', Object.keys(BRUSHES).filter(id => BRUSHES[id].scope === 'library')], ['This drawing', Object.keys(BRUSHES).filter(id => BRUSHES[id].scope === 'doc' || (BRUSHES[id].custom && !BRUSHES[id].scope))]];
    const sel = h('select', { class: 'wb-select', title: 'Brush' }, ...groups.filter(([, ids]) => ids.length).map(([label, ids]) => h('optgroup', { label }, ...ids.map(id => h('option', { value: id, selected: id === current }, `${BRUSHES[id].label} · ${id}`)))));
    if (!BRUSHES[current]) sel.prepend(h('option', { value: current, selected: true }, `${current} (unsaved)`));
    sel.addEventListener('change', () => { open(sel.value); sel.blur(); });
    picker.replaceChildren(sel,
      h('button', { class: 'wb-btn', title: 'A new brush from a template', onclick: newBrush }, 'New'),
      h('button', { class: 'wb-btn', title: 'Copy this brush under a new id to make it yours', onclick: fork }, 'Fork'));
    const builtin = isBuiltin(current);
    actions.replaceChildren(
      h('button', { class: 'wb-btn primary', title: 'Save to your library (Cmd+Enter)', disabled: builtin, onclick: save }, 'Save'),
      h('button', { class: 'wb-btn', title: 'Use on the selection, or for the current tool', onclick: use }, 'Use'),
      !builtin && BRUSHES[current]?.scope === 'library' ? h('button', { class: 'wb-btn', title: 'Delete from your library (drawings keep their copies)', onclick: async () => { if (await askConfirm(`Delete the brush “${current}” from your library?`)) { deleteLibraryBrush(current); open('ink'); } } }, 'Delete') : null,
      h('span', { class: 'wb-muted wb-small', style: { marginLeft: 'auto' } }, builtin ? 'built-in · fork to edit' : scopeOf(current)));
  };
  app.brushesPanel = { open, editor, get source() { return editor.value; }, setSource: v => { editor.value = v; check(); }, save };
  renderBar(); check();
}

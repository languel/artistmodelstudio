/**
 * Brushes: every brush is code. Pick one to read it; fork a built-in, write a new one, or edit
 * yours. The preview redraws as you type (a walk that speeds up and slows down, and a plane).
 * Saved brushes go to your library (all drawings); a drawing carries the brushes it uses.
 */
import { askConfirm, askText } from '../dialog.js';
import { h, selectField } from '../ui.js';
import { BRUSHES, brushSource, compileBrush, saveLibraryBrush, deleteLibraryBrush, isBuiltin, resolveParams, mulberry32 } from '../../process/brushes.js';
import { controlStrip } from '../codeParams.js';
import { setToolIcon, iconFromCanvas } from '../icons.js';
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

/**
 * A sample walk that is slow, then fast, then lingers, and a plane to fill, fitted into the preview:
 * the walk in the left part (all of it when there is no plane), the plane on the right.
 */
function sample(W, H, { line = true, plane = true, pad = 10 } = {}) {
  const raw = []; let x = 0, y = 0, hd = -15, t = 0;
  for (let i = 0; i < 90; i++) { const u = i / 89; hd += Math.sin(i / 6) * 8; x += Math.cos(hd * Math.PI / 180); y += Math.sin(hd * Math.PI / 180); t += u < 0.3 ? 60 : u < 0.7 ? 10 : 35; raw.push([x, y, t, 0.5 + 0.3 * Math.sin(i / 9)]); }
  const box = { x0: pad, y0: pad, x1: (plane && line ? W * 0.66 : W) - pad, y1: H - pad };
  const xs = raw.map(q => q[0]), ys = raw.map(q => q[1]);
  const [mx, Mx, my, My] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const k = Math.min((box.x1 - box.x0) / ((Mx - mx) || 1), (box.y1 - box.y0) / ((My - my) || 1));
  const ox = box.x0 + ((box.x1 - box.x0) - (Mx - mx) * k) / 2, oy = box.y0 + ((box.y1 - box.y0) - (My - my) * k) / 2;
  const pts = raw.map(([px, py, pt, pp]) => [ox + (px - mx) * k, oy + (py - my) * k, pt, pp]);
  const r = Math.min(H / 2 - pad, (line ? W * 0.34 : W) / 2 - pad), cx = line ? W * 0.83 : W / 2, cy = H / 2;
  const planePts = Array.from({ length: 40 }, (_, i) => { const a = i / 40 * Math.PI * 2; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.92, 0, 0.5]; });
  return { line: { role: 'line', points: pts, closed: false, color: null, seed: 3 }, plane: { role: 'plane', points: planePts, closed: true, color: null, seed: 5 } };
}

export function mountBrushes(root, app) {
  let current = app.brush?.id || 'ink';
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
    // A fresh context each time: a brush that left state behind (alpha, transform) must not leak.
    if (ctx.reset) ctx.reset(); else { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.setLineDash([]); }
    ctx.fillStyle = app.store.doc.artboard.ground || '#f3efe6'; ctx.fillRect(0, 0, W, H);
    if (!def) return;
    // The values the sliders act on (the selected marks, or the tool's defaults), over the code's defaults.
    const p = { ...Object.fromEntries(def.params.map(q => [q.key, q.default])), ...(livePreviewParams() || {}) };
    const roles = def.roles || [];
    const hasLine = ['line', 'gesture', 'guide', 'point'].some(r => roles.includes(r)), hasPlane = roles.includes('plane');
    const s = sample(W, H, { line: hasLine, plane: hasPlane, pad: 6 + Math.min(H / 8, Number(p.width ?? p.size ?? 4) * 1.5) });
    // Drawn in the color of the marks the sliders act on (else the brush's own ink).
    const color = liveColor();
    if (color) { s.line.color = color; s.plane.color = color; }
    try {
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
    const all = app.selectedElements?.() || [];
    const sel = all.filter(e => e.realize?.brush === current);
    if (sel.length) return { kind: 'sel', ids: sel.map(e => e.id), label: `${sel.length} selected mark${sel.length === 1 ? '' : 's'}` };
    if (all.length) return null;
    const d = app.tool && app.defaults?.(app.tool);
    if (d?.realize?.brush === current) return { kind: 'tool', tool: app.tool, label: app.tool === 'brush' ? 'the active brush' : `new ${app.tool} marks` };
    // Nothing selected, another tool: the active brush, if it is this one.
    if (app.brush?.id === current) return { kind: 'tool', tool: 'brush', label: 'the active brush' };
    return null;
  };
  let before = null, commitTimer = 0, fromEditor = false;
  const liveColor = () => {
    const t = targets();
    if (t?.kind === 'sel') return app.store.doc.elements.find(e => e.id === t.ids[0])?.color || null;
    if (t?.kind === 'tool') return app.defaults(t.tool).color || null;
    return null;
  };
  const livePreviewParams = () => {
    const t = targets();
    if (t?.kind === 'sel') return app.store.doc.elements.find(e => e.id === t.ids[0])?.realize.params;
    if (t?.kind === 'tool') return app.defaults(t.tool).realize.params;
    return null;
  };
  const live = {
    target: () => targets()?.label || null,
    get: key => {
      const t = targets();
      if (t?.kind === 'sel') return app.store.doc.elements.find(e => e.id === t.ids[0])?.realize.params?.[key];
      if (t?.kind === 'tool') return app.defaults(t.tool).realize.params?.[key];
      return undefined;
    },
    set: (key, v) => {
      const t = targets();
      if (!t) return false;
      fromEditor = true;
      if (t.kind === 'tool') { app.setDefaults(t.tool, { realize: { params: { [key]: v } } }); requestAnimationFrame(draw); }
      else {
        // Direct edits while dragging; one undo step when the slider rests.
        before ??= JSON.stringify(app.store.doc);
        for (const e of app.store.doc.elements) if (t.ids.includes(e.id)) e.realize.params = { ...(e.realize.params || {}), [key]: v };
        app.canvas.invalidate();
        requestAnimationFrame(draw);
        clearTimeout(commitTimer);
        commitTimer = setTimeout(() => { const b = before; before = null; fromEditor = true; app.store.commitFrom(b, 'brush param'); fromEditor = false; }, 350);
      }
      fromEditor = false;
      return true;
    }
  };
  editor.setLive(live);
  const refreshLive = () => { if (!fromEditor) { editor.setLive({ ...live }); draw(); } };
  app.on('selection', refreshLive);
  app.on('tool', refreshLive);
  // Picking another active brush shows its code.
  app.on('brush', () => { if (app.brush.id !== current && BRUSHES[app.brush.id]) open(app.brush.id); else refreshLive(); });

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
      !isBuiltin(current) ? h('button', { class: 'wb-icon-btn', title: 'Use the preview as this brush’s icon (toolbar and menus)', html: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="6" width="18" height="13" rx="2"/><circle cx="12" cy="12.5" r="3.2"/><path d="M8 6l1.5-2h5L16 6"/></svg>', onclick: () => { setToolIcon('brush', current, iconFromCanvas(preview, app.store.doc.artboard.ground || '#f3efe6')); app.renderChrome(); status.textContent = 'Icon taken from the preview.'; } }) : null,
      !builtin && BRUSHES[current]?.scope === 'library' ? h('button', { class: 'wb-btn', title: 'Delete from your library (drawings keep their copies)', onclick: async () => { if (await askConfirm(`Delete the brush “${current}” from your library?`)) { deleteLibraryBrush(current); open('ink'); } } }, 'Delete') : null,
      h('span', { class: 'wb-muted wb-small', style: { marginLeft: 'auto' } }, builtin ? 'built-in · fork to edit' : scopeOf(current)));
  };
  app.brushesPanel = { open, editor, get source() { return editor.value; }, setSource: v => { editor.value = v; check(); }, save };
  renderBar(); check();
}

/**
 * Opt+right-click: the active tool's parameters as sliders, where the pointer is (the same
 * params the code declares). Sculpt: radius, strength and the tool's params. Select with a
 * selection: the selected marks' brush params. A drawing tool: its brush params for new marks.
 */
import { h } from './ui.js';
import { colorField } from './colorPicker.js';
import { boardsOf } from '../process/boards.js';
import { icon } from './icons.js';
import { rangeInput } from './rangeInput.js';
import { SCULPTS, sculptParams } from '../process/sculpt.js';
import { BRUSHES, resolveParams, brushesForRole } from '../process/brushes.js';
import { BLENDS } from '../process/document.js';
import { NOTE_FONTS, NOTE_STYLES, noteProps } from '../process/notes.js';
import { brushIcon } from './icons.js';

let open = null;

function slider({ label, min, max, step, value, doc, onInput }) {
  const out = h('span', { class: 'wb-tp-value' });
  const d = (String(step).split('.')[1] || '').length;
  const show = v => { out.textContent = String(+Number(v).toFixed(Math.min(4, d))); };
  const input = rangeInput({ min, max, step, value, title: doc || label });
  input.addEventListener('input', () => { show(input.value); onInput(Number(input.value)); });
  show(value);
  return h('label', { class: 'wb-tp-row', title: doc || '' }, h('span', { class: 'wb-tp-label' }, label), input, out);
}

const stepOf = p => p.step || Math.abs(p.max - p.min) / 100 || 0.01;

export function openToolParams(app, x, y) {
  open?.close();
  const pop = h('div', { class: 'wb-cp-pop wb-tp' });
  const rows = [];
  let title = '', code = null;
  const sel = app.selectedElements().filter(e => BRUSHES[e.realize?.brush]);
  const notes = app.selectedElements().filter(e => e.role === 'note');

  if (app.tool === 'sculpt') {
    const s = app.sculpt, t = SCULPTS[s.tool];
    const vals = sculptParams(s.tool, s.params[s.tool]);
    title = `Sculpt · ${t.label}`;
    code = () => app.openCode?.('sculpt', s.tool);
    const pick = h('select', { class: 'wb-select', title: 'The sculpt tool' }, ...Object.entries(SCULPTS).map(([id, st]) => h('option', { value: id, selected: id === s.tool }, st.label)));
    pick.addEventListener('change', () => { app.setSculpt({ tool: pick.value }); openToolParams(app, x, y); });
    pick.addEventListener('keydown', e => e.stopPropagation());
    rows.push(
      h('label', { class: 'wb-tp-row wb-tp-row2' }, h('span', { class: 'wb-tp-label' }, 'Tool'), pick),
      slider({ label: 'Radius', min: 4, max: 400, step: 1, value: Math.round(s.radius), doc: 'Brush radius in screen pixels ([ and ])', onInput: v => app.setSculpt({ radius: v }) }),
      slider({ label: 'Strength', min: 0.02, max: 1, step: 0.01, value: s.strength, doc: 'Shift+[ and Shift+]', onInput: v => app.setSculpt({ strength: v }) }),
      ...t.params.map(p => slider({ label: p.label, min: p.min, max: p.max, step: stepOf(p), value: vals[p.key], doc: p.doc, onInput: v => app.setSculpt({ params: { [p.key]: v } }) })));
  } else if (notes.length || app.tool === 'note') {
    // Notes: the lettering, size and style, for the selected notes (or for the next one).
    const ids = notes.map(e => e.id);
    const p = noteProps(notes[0] || { note: app.defaults('note').note, color: app.defaults('note').color, points: [] });
    title = notes.length ? `Note${notes.length > 1 ? `s · ${notes.length}` : ''}` : 'New note';
    const apply = patch => {
      if (!ids.length) { app.setDefaults('note', { note: { ...(app.defaults('note').note || {}), ...patch } }); return; }
      const before = JSON.stringify(app.store.doc);
      for (const e of app.store.doc.elements) if (ids.includes(e.id)) e.note = { ...(e.note || {}), ...patch };
      app.canvas.invalidate();
      app.store.commitFrom(before, 'note style');
      app.setDefaults('note', { note: { ...(app.store.doc.elements.find(e => e.id === ids[0])?.note || {}) } });
    };
    const pickOf = (options, value, onPick) => { const s = h('select', { class: 'wb-select' }, ...options.map(([k, l]) => h('option', { value: k, selected: k === value }, l))); s.addEventListener('change', () => onPick(s.value)); s.addEventListener('keydown', e => e.stopPropagation()); return s; };
    rows.push(
      h('label', { class: 'wb-tp-row wb-tp-row2' }, h('span', { class: 'wb-tp-label' }, 'Font'), pickOf(Object.entries(NOTE_FONTS).map(([k, [l]]) => [k, l]), p.font, v => apply({ font: v }))),
      slider({ label: 'Size', min: 6, max: 120, step: 1, value: Math.round(p.size), doc: 'Letter size in artboard units', onInput: v => apply({ size: v }) }),
      h('label', { class: 'wb-tp-row wb-tp-row2' }, h('span', { class: 'wb-tp-label' }, 'Style'), pickOf(Object.entries(NOTE_STYLES).map(([k, v]) => [k, v.split(':')[0]]), p.style, v => apply({ style: v, bg: undefined, font: undefined, size: undefined }))));
  } else if (sel.length) {
    const id = sel[0].realize.brush, b = BRUSHES[id];
    const ids = sel.filter(e => e.realize.brush === id).map(e => e.id);
    const vals = resolveParams(id, sel[0].realize.params);
    title = `${b.label} · ${ids.length} mark${ids.length === 1 ? '' : 's'}`;
    code = () => app.openCode?.('brush', id);
    let before = null, timer = 0;
    rows.push(...b.params.map(p => slider({ label: p.label, min: p.min, max: p.max, step: stepOf(p), value: vals[p.key], doc: p.doc, onInput: v => {
      before ??= JSON.stringify(app.store.doc);
      for (const e of app.store.doc.elements) if (ids.includes(e.id)) e.realize.params = { ...(e.realize.params || {}), [p.key]: v };
      app.canvas.invalidate();
      clearTimeout(timer);
      timer = setTimeout(() => { const bf = before; before = null; app.store.commitFrom(bf, 'brush param'); }, 350);
    } })));
  } else if (app.defaults && ['point', 'line', 'plane', 'circle', 'rect', 'gesture', 'guide', 'brush'].includes(app.tool)) {
    const role = app.toolRole();   // circle and rectangle make planes: they draw with the plane's looks
    const d = app.defaults(role), id = d.realize.brush, b = BRUSHES[id];
    const vals = resolveParams(id, d.realize.params);
    title = app.tool === 'brush' ? `Brush · ${b?.label || id}` : `New ${app.tool} · ${b?.label || id}`;
    code = () => app.openCode?.('brush', id);
    rows.push(...(b?.params || []).map(p => slider({ label: p.label, min: p.min, max: p.max, step: stepOf(p), value: vals[p.key], doc: p.doc, onInput: v => app.setDefaults(role, { realize: { params: { [p.key]: v } } }) })));
  }
  // Drawing tools: the lazy pen (an editor setting; it changes how strokes are drawn, not the marks).
  if (['line', 'plane', 'gesture', 'brush'].includes(app.tool) && app.lazy) {
    rows.push(h('div', { class: 'wb-tp-sub' }, 'Drawing'),
      slider({ label: 'Lazy', min: 0, max: 120, step: 1, value: app.lazy.radius, doc: 'The pen trails the cursor on a string this long (screen px); 0 = off', onInput: v => app.setLazy({ radius: v }) }),
      slider({ label: 'Smoothing', min: 0, max: 0.95, step: 0.01, value: app.lazy.smoothing, doc: 'Eases the pen further (0 = off)', onInput: v => app.setLazy({ smoothing: v }) }),
      slider({ label: 'Simplify', min: 0, max: 40, step: 0.5, value: app.lazy.simplify || 0, doc: 'On release, points the line does not need are dropped: how far (screen px) the shape may move. 0 = off', onInput: v => app.setLazy({ simplify: v }) }));
  }
  if (!rows.length) rows.push(h('div', { class: 'wb-muted wb-small' }, 'No parameters for this tool: select marks, or pick a drawing or sculpt tool.'));

  pop.append(
    h('div', { class: 'wb-tp-head' }, h('span', {}, title || 'Parameters'), code ? h('button', { class: 'wb-icon-btn', title: 'The same params in code', html: icon('script'), onclick: () => { close(); code(); } }) : null),
    ...rows);
  document.body.append(pop);
  const r = pop.getBoundingClientRect();
  pop.style.left = `${Math.max(8, Math.min(x, window.innerWidth - r.width - 8))}px`;
  pop.style.top = `${Math.max(8, Math.min(y, window.innerHeight - r.height - 8))}px`;

  const outside = e => { if (!pop.contains(e.target)) close(); };
  const esc = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  const close = () => { pop.remove(); window.removeEventListener('pointerdown', outside, true); window.removeEventListener('keydown', esc, true); open = null; };
  setTimeout(() => { window.addEventListener('pointerdown', outside, true); window.addEventListener('keydown', esc, true); });
  open = { close };
}

/** Right-click the grid button: the grid and the drawing settings, where you are. */
export function openGridParams(app, x, y) {
  open?.close();
  const pop = h('div', { class: 'wb-cp-pop wb-tp' });
  const g = app.canvas.grid;
  // the board under the pointer, else the active one, else the main artboard
  const [wx, wy] = app.canvas.toWorld(...app.canvas.local({ clientX: x, clientY: y }));
  const boards = boardsOf(app.store.doc);
  const board = boards.find(b => wx >= b.x && wx <= b.x + b.width && wy >= b.y && wy <= b.y + b.height) || boards.find(b => b.id === app.activeBoard) || boards[0];
  const workspaceColor = () => (app.background && app.background !== 'default' && app.background !== 'transparent' ? app.background : getComputedStyle(document.documentElement).getPropertyValue('--wb-canvas').trim() || '#1b1b1b');
  const seg = (options, value, onPick) => {
    const wrap = h('div', { class: 'wb-seg wb-tp-seg' });
    const draw = v => wrap.replaceChildren(...options.map(([id, label]) => h('button', { class: id === v ? 'on' : '', onclick: () => { onPick(id); draw(id); } }, label)));
    draw(value);
    return wrap;
  };
  const line = (label, control, doc) => h('label', { class: 'wb-tp-row wb-tp-row2', title: doc || '' }, h('span', { class: 'wb-tp-label' }, label), control);
  const snap = h('input', { type: 'checkbox', checked: Boolean(g.snap), onchange: e => app.canvas.setGrid({ snap: e.target.checked }) });
  pop.append(
    h('div', { class: 'wb-tp-head' }, h('span', {}, 'Canvas')),
    line('Show', seg([['off', 'Off'], ['paper', 'Paper'], ['everywhere', 'All']], g.show || 'paper', v => app.canvas.setGrid({ show: v }))),
    line('Names', (() => { const c = h('input', { type: 'checkbox', checked: Boolean(app.scoreView?.names), onchange: e => app.setScoreView({ names: e.target.checked }) }); return c; })(), 'Show the names of marks that play (the id when a mark has none) and the links between them (Alt+N)'),
    line('Style', seg([['lines', 'Lines'], ['dots', 'Dots']], g.style || 'lines', v => app.canvas.setGrid({ style: v }))),
    slider({ label: 'Spacing', min: 5, max: 400, step: 1, value: g.spacing, doc: 'Distance between major lines, in artboard units', onInput: v => app.canvas.setGrid({ spacing: v }) }),
    line('Auto', h('input', { type: 'checkbox', checked: Boolean(g.auto), onchange: e => app.canvas.setGrid({ auto: e.target.checked }) }), 'The grid follows the zoom: finer lines (and finer snapping) as you zoom in, coarser as you zoom out'),
    line('Grid', colorField(g.color, v => app.canvas.setGrid({ color: v }), { title: 'Grid color', fallback: '#8a837840', app })),
    line(board.main ? 'Paper' : `Paper · ${board.title || 'board'}`, colorField(board.ground, v => app.store.updateBoard(board.id, { ground: v }), { title: 'The paper of the board under the pointer (else the active one)', fallback: '#f3efe6', app })),
    line('Workspace', colorField(workspaceColor(), v => app.setBackground(v), { title: 'Workspace background (behind the boards)', fallback: '#1b1b1b', app })),
    slider({ label: 'Divisions', min: 1, max: 10, step: 1, value: g.subdivisions, doc: 'Minor lines between the major ones', onInput: v => app.canvas.setGrid({ subdivisions: v }) }),
    line('Snap', snap, 'Marks snap to the grid (Shift+Tab); Ctrl snaps while drawing, moving and scaling'),
    line('Snap to', seg([['points', 'Grid'], ['increments', 'Steps'], ['objects', 'Objects']], ['increments', 'objects'].includes(g.snapMode) ? g.snapMode : 'points', v => app.canvas.setGrid({ snapMode: v })), 'Grid: the grabbed point (or the dragged edge) lands on a grid point. Steps: moves in whole grid steps from where it started. Objects: the grabbed (or drawn) point lands on the nearest point of another mark'),
    h('div', { class: 'wb-tp-sub' }, 'Scores (glow, trails, blips)'),
    line('Highlight', colorField(app.scoreView.color || '', v => app.setScoreView({ color: v || '' }), { title: 'The colour of everything lit: travelers, trails, blips, nodes (empty: the theme\'s accent)', fallback: '#c8664f', app }), 'The colour of everything lit by a score'),
    slider({ label: 'Glow', min: 0, max: 1, step: 0.05, value: app.scoreView.glow, doc: 'The halo around a traveler: how strong (0 = off). A traveler can have its own in Properties', onInput: v => app.setScoreView({ glow: v }) }),
    slider({ label: 'Glow size', min: 1, max: 8, step: 0.1, value: app.scoreView.glowSize, doc: 'How far the halo reaches, in dots', onInput: v => app.setScoreView({ glowSize: v }) }),
    slider({ label: 'Trail', min: 0, max: 3, step: 0.05, value: app.scoreView.trail, doc: 'Seconds of tail behind a traveler (0 = none)', onInput: v => app.setScoreView({ trail: v }) }),
    slider({ label: 'Trail strength', min: 0, max: 1, step: 0.05, value: app.scoreView.trailAlpha, doc: 'How strong the tail is', onInput: v => app.setScoreView({ trailAlpha: v }) }),
    line('Blips', h('input', { type: 'checkbox', checked: Boolean(app.scoreView.blip), onchange: e => app.setScoreView({ blip: e.target.checked ? 1 : 0 }) }), 'A trigger swells and glows when it goes off'),
    h('div', { class: 'wb-tp-sub' }, 'Drawing'),
    slider({ label: 'Lazy', min: 0, max: 120, step: 1, value: app.lazy.radius, doc: 'The pen trails the cursor on a string this long (screen px). Small wobbles inside it never reach the line; corners get rounded. 0 = off', onInput: v => app.setLazy({ radius: v }) }),
    slider({ label: 'Smoothing', min: 0, max: 0.95, step: 0.01, value: app.lazy.smoothing, doc: 'Each step the pen covers only part of the way to where it is pulled (0.5 = half). Higher is smoother and lags more. 0 = off', onInput: v => app.setLazy({ smoothing: v }) }),
    slider({ label: 'Simplify', min: 0, max: 40, step: 0.5, value: app.lazy.simplify || 0, doc: 'On release, points the line does not need are dropped: how far (screen px) the shape may move. Higher = fewer points, looser shape. 0 = off', onInput: v => app.setLazy({ simplify: v }) }));
  document.body.append(pop);
  const r = pop.getBoundingClientRect();
  pop.style.left = `${Math.max(8, Math.min(x, window.innerWidth - r.width - 8))}px`;
  pop.style.top = `${Math.max(8, Math.min(y, window.innerHeight - r.height - 8))}px`;
  const outside = e => { if (!pop.contains(e.target) && !e.target.closest?.('.wb-cp-pop')) close(); };   // the color picker is its own popup
  const esc = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  const close = () => { pop.remove(); window.removeEventListener('pointerdown', outside, true); window.removeEventListener('keydown', esc, true); open = null; };
  setTimeout(() => { window.addEventListener('pointerdown', outside, true); window.addEventListener('keydown', esc, true); });
  open = { close };
}

/**
 * Right-click a drawing tool's button: what its new marks will be (brush and its settings, opacity,
 * blend, path). The same defaults as Properties; they stay until changed.
 */
export function openToolDefaults(app, tool, x, y, shape = null) {
  open?.close();
  const pop = h('div', { class: 'wb-cp-pop wb-tp' });
  const line = (label, control, doc) => h('label', { class: 'wb-tp-row wb-tp-row2', title: doc || '' }, h('span', { class: 'wb-tp-label' }, label), control);
  const seg = (options, value, onPick) => {
    const wrap = h('div', { class: 'wb-seg wb-tp-seg' });
    const draw = v => wrap.replaceChildren(...options.map(([id, label]) => h('button', { class: id === v ? 'on' : '', onclick: () => { onPick(id); draw(id); } }, label)));
    draw(value);
    return wrap;
  };
  // The shape tools' own settings (more shapes can add theirs here): the rows sit above the looks they share with the plane.
  const shapeRows = () => {
    const s = shape && app.shapes?.[shape];
    if (!s) return [];
    if (shape === 'circle') return [slider({ label: 'Sides', min: 3, max: 48, step: 1, value: s.sides, doc: 'Points on the circle. Straight, it is a polygon with this many sides; smooth, it is round (more points, rounder)', onInput: v => app.setShape('circle', { sides: Math.round(v) }) })];
    if (shape === 'rect') return [slider({ label: 'Rounded', min: 0, max: 1, step: 0.01, value: s.round, doc: 'Corner roundness: 0 is square corners, 1 is a pill (the corners take half the shorter side)', onInput: v => app.setShape('rect', { round: v }) })];
    return [];
  };
  // The pen: Lazy makes a stroke trail the cursor on a string; its length is the laziness, adjustable here.
  const lazyRows = d => {
    if (!['line', 'plane', 'gesture', 'brush'].includes(tool)) return [];
    const lz = d.lazy || {}, on = Boolean(lz.on), radius = lz.radius ?? 40, catchUp = lz.catch !== false;
    const pen = seg([['off', 'Off'], ['lazy', 'Lazy']], on ? 'lazy' : 'off', v => { app.setDefaults(tool, { lazy: { on: v === 'lazy', radius, catch: catchUp } }); render(); });
    return [line('Pen', pen, 'Off: the pen follows the cursor. Lazy: it trails the cursor on a string, so strokes come out smoother'),
      ...(on ? [slider({ label: 'Laziness', min: 0, max: 120, step: 1, value: radius, doc: 'Length of the string (screen px): the pen waits until the cursor is this far away. Same as Lazy in Settings → Drawing; Smoothing and Simplify still apply.', onInput: v => app.setLazy({ radius: Math.round(v) }) }),   // (the editor's Lazy: the same slider as Settings → Drawing and the grid popover)
        line('Catch up', seg([['off', 'Off'], ['on', 'On']], catchUp ? 'on' : 'off', v => { app.setDefaults(tool, { lazy: { on: true, radius, catch: v === 'on' } }); render(); }), 'On: when the pointer stops, the pen catches up to it, so the line reaches the cursor. Off: the line stops where the string leaves it')] : [])];
  };
  const render = () => {
    const d = app.defaults(tool), id = d.realize.brush, b = BRUSHES[id];
    const vals = resolveParams(id, d.realize.params);
    const brushSel = h('select', { class: 'wb-select', title: 'Brush for new marks' }, ...brushesForRole(tool, app.store.doc).map(x => h('option', { value: x.id, selected: x.id === id }, x.label)));
    brushSel.addEventListener('change', () => { app.setDefaults(tool, { realize: { brush: brushSel.value } }); render(); });
    brushSel.addEventListener('keydown', e => e.stopPropagation());
    pop.replaceChildren(
      h('div', { class: 'wb-tp-head' }, h('span', { class: 'wb-tp-title' }, h('span', { html: brushIcon(id) }), `New ${shape || tool}`), h('button', { class: 'wb-icon-btn', title: 'The brush in code', html: icon('script'), onclick: () => { close(); app.openCode?.('brush', id); } })),
      ...shapeRows(),
      ...lazyRows(d),
      line('Brush', brushSel),
      ...(b?.params || []).map(p => slider({ label: p.label, min: p.min, max: p.max, step: stepOf(p), value: vals[p.key], doc: p.doc, onInput: v => app.setDefaults(tool, { realize: { params: { [p.key]: v } } }) })),
      h('div', { class: 'wb-tp-sub' }, 'Look'),
      slider({ label: 'Opacity', min: 0, max: 1, step: 0.01, value: d.opacity ?? 1, doc: 'The whole mark’s opacity (on top of the brush’s own)', onInput: v => app.setDefaults(tool, { opacity: v }) }),
      line('Blend', (() => { const s = h('select', { class: 'wb-select' }, ...BLENDS.map(x => h('option', { value: x, selected: x === (d.blend || 'normal') }, x))); s.addEventListener('change', () => app.setDefaults(tool, { blend: s.value })); s.addEventListener('keydown', e => e.stopPropagation()); return s; })(), 'How the mark mixes with what is under it'),
      // (A point has no path; a rectangle keeps its corners.)
      ...(tool === 'point' || shape === 'rect' ? [] : [line('Path', seg([['smooth', 'Smooth'], ['straight', 'Straight']], d.path === 'straight' ? 'straight' : 'smooth', v => app.setDefaults(tool, { path: v })), 'Smooth: a curve through the points. Straight: segments between them')]));
  };
  render();
  document.body.append(pop);
  const r = pop.getBoundingClientRect();
  pop.style.left = `${Math.max(8, Math.min(x, window.innerWidth - r.width - 8))}px`;
  pop.style.top = `${Math.max(8, Math.min(y, window.innerHeight - r.height - 8))}px`;
  const outside = e => { if (!pop.contains(e.target)) close(); };
  const esc = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  const close = () => { pop.remove(); window.removeEventListener('pointerdown', outside, true); window.removeEventListener('keydown', esc, true); open = null; };
  setTimeout(() => { window.addEventListener('pointerdown', outside, true); window.addEventListener('keydown', esc, true); });
  open = { close };
}

/**
 * Opt+right-click a board (its title or corner, or bare paper): its switches and paper, where the pointer is.
 * Title and border off make a board purely structural: nothing visible, only where its marks live.
 */
export function openBoardParams(app, id, x, y) {
  open?.close();
  const b = boardsOf(app.store.doc).find(t => t.id === id);
  if (!b) return;
  const pop = h('div', { class: 'wb-cp-pop wb-tp' });
  const row = (label, control, doc) => h('label', { class: 'wb-tp-row wb-tp-row2', title: doc || '' }, h('span', { class: 'wb-tp-label' }, label), control);
  // A switch: on = shown. (Locked, hidden, mask and perf read the other way round: on = the flag is set.)
  const flag = (key, label, doc, { shown = false } = {}) => {
    const box = h('input', { type: 'checkbox', checked: shown ? !b[key] : Boolean(b[key]), onchange: e => app.setBoardFlag(id, key, shown ? !e.target.checked : e.target.checked) });
    return row(label, box, doc);
  };
  pop.append(
    h('div', { class: 'wb-tp-head' }, h('span', {}, b.title || 'Board')),
    flag('hideLabel', 'Title', 'The title above the board (selected, it always shows, so the board can be moved)', { shown: true }),
    flag('hideBorder', 'Border', 'The shadow and frame line. With title and border off a board is only structure', { shown: true }),
    row('Paper', colorField(b.ground, v => app.store.updateBoard(id, { ground: v }), { title: 'Paper', fallback: '#f3efe6', app })),
    flag('hidden', 'Hidden', 'Not drawn and not run (a dashed outline marks where it is)', { shown: true }),
    flag('locked', 'Locked', 'Its marks cannot be selected or changed, and it cannot be moved or resized'),
    flag('mask', 'Mask', 'Its marks are cropped to the board'),
    flag('perf', 'Performance', 'A performance line under the board'));
  document.body.append(pop);
  const r = pop.getBoundingClientRect();
  pop.style.left = `${Math.max(8, Math.min(x, window.innerWidth - r.width - 8))}px`;
  pop.style.top = `${Math.max(8, Math.min(y, window.innerHeight - r.height - 8))}px`;
  const outside = e => { if (!pop.contains(e.target) && !e.target.closest?.('.wb-cp-pop')) close(); };
  const esc = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  const close = () => { pop.remove(); window.removeEventListener('pointerdown', outside, true); window.removeEventListener('keydown', esc, true); open = null; };
  setTimeout(() => { window.addEventListener('pointerdown', outside, true); window.addEventListener('keydown', esc, true); });
  open = { close };
}

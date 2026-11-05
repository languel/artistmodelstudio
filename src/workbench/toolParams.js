/**
 * Opt+right-click: the active tool's parameters as sliders, where the pointer is (the same
 * params the code declares). Sculpt: radius, strength and the tool's params. Select with a
 * selection: the selected marks' brush params. A drawing tool: its brush params for new marks.
 */
import { h } from './ui.js';
import { colorField } from './colorPicker.js';
import { boardsOf } from '../process/boards.js';
import { openPropertiesPopup } from './propsPopup.js';
import { icon } from './icons.js';
import { rangeInput } from './rangeInput.js';
import { SCULPTS, sculptParams } from '../process/sculpt.js';
import { BRUSHES, resolveParams, brushesForRole } from '../process/brushes.js';
import { BLENDS, ensureFill } from '../process/document.js';
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

/** Properties at the pointer (see propsPopup.js): the marks, the board, or the tool's own settings (sculpt, brush, pen). */
export function openToolParams(app, x, y) { return openPropertiesPopup(app, x, y); }

/** The grid button's right-click: the grid (and whether marks show their points). Canvas settings are their own popup. */
export const openGridParams = (app, x, y) => canvasPopup(app, x, y, 'grid');
/** The canvas settings button: names of marks that play, the paper and workspace colours, how scores glow, how the pen draws. */
export const openCanvasParams = (app, x, y) => canvasPopup(app, x, y, 'canvas');
function canvasPopup(app, x, y, which) {
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
  const gridRows = [
    h('div', { class: 'wb-tp-head' }, h('span', {}, 'Grid')),
    line('Mark points', h('input', { type: 'checkbox', checked: Boolean(app.canvas.showPoints), onchange: () => app.togglePoints() }), "Show each mark's points (')"),
    line('Show', seg([['off', 'Off'], ['paper', 'Paper'], ['everywhere', 'All']], g.show || 'paper', v => app.canvas.setGrid({ show: v }))),
    line('Style', seg([['lines', 'Lines'], ['dots', 'Dots']], g.style || 'lines', v => app.canvas.setGrid({ style: v }))),
    slider({ label: 'Spacing', min: 5, max: 400, step: 1, value: g.spacing, doc: 'Distance between major lines, in artboard units', onInput: v => app.canvas.setGrid({ spacing: v }) }),
    line('Auto', h('input', { type: 'checkbox', checked: Boolean(g.auto), onchange: e => app.canvas.setGrid({ auto: e.target.checked }) }), 'The grid follows the zoom: finer lines (and finer snapping) as you zoom in, coarser as you zoom out'),
    line('Grid', colorField(g.color, v => app.canvas.setGrid({ color: v }), { title: 'Grid color', fallback: '#8a837840', app })),
    slider({ label: 'Divisions', min: 1, max: 10, step: 1, value: g.subdivisions, doc: 'Minor lines between the major ones', onInput: v => app.canvas.setGrid({ subdivisions: v }) }),
    line('Snap', snap, 'Marks snap to the grid (Shift+Tab); Ctrl snaps while drawing, moving and scaling'),
    line('Snap to', seg([['points', 'Grid'], ['increments', 'Steps'], ['objects', 'Objects']], ['increments', 'objects'].includes(g.snapMode) ? g.snapMode : 'points', v => app.canvas.setGrid({ snapMode: v })), 'Grid: the grabbed point (or the dragged edge) lands on a grid point. Steps: moves in whole grid steps from where it started. Objects: the grabbed (or drawn) point lands on the nearest point of another mark'),
  ];
  const canvasRows = [
    h('div', { class: 'wb-tp-head' }, h('span', {}, 'Canvas')),
    line('Names', (() => { const c = h('input', { type: 'checkbox', checked: Boolean(app.scoreView?.names), onchange: e => app.setScoreView({ names: e.target.checked }) }); return c; })(), 'Show the names of marks that play (the id when a mark has none) and the links between them (Alt+N)'),
    line(board.main ? 'Paper' : `Paper · ${board.title || 'board'}`, colorField(board.ground, v => app.store.updateBoard(board.id, { ground: v }), { title: 'The paper of the board under the pointer (else the active one)', fallback: '#f3efe6', app })),
    line('Workspace', colorField(workspaceColor(), v => app.setBackground(v), { title: 'Workspace background (behind the boards)', fallback: '#1b1b1b', app })),
    h('div', { class: 'wb-tp-sub' }, 'Scores (glow, trails, blips)'),
    line('Highlight', colorField(app.scoreView.color || '', v => app.setScoreView({ color: v || '' }), { title: 'The colour of everything lit: travelers, trails, blips, nodes (empty: the theme\'s accent)', fallback: '#c8664f', app }), 'The colour of everything lit by a score'),
    slider({ label: 'Glow', min: 0, max: 1, step: 0.05, value: app.scoreView.glow, doc: 'The halo around a traveler: how strong (0 = off). A traveler can have its own in Properties', onInput: v => app.setScoreView({ glow: v }) }),
    slider({ label: 'Glow size', min: 1, max: 8, step: 0.1, value: app.scoreView.glowSize, doc: 'How far the halo reaches, in dots', onInput: v => app.setScoreView({ glowSize: v }) }),
    slider({ label: 'Trail', min: 0, max: 3, step: 0.05, value: app.scoreView.trail, doc: 'Seconds of tail behind a traveler (0 = none)', onInput: v => app.setScoreView({ trail: v }) }),
    slider({ label: 'Trail strength', min: 0, max: 1, step: 0.05, value: app.scoreView.trailAlpha, doc: 'How strong the tail is', onInput: v => app.setScoreView({ trailAlpha: v }) }),
    line('Trails when paused', h('input', { type: 'checkbox', checked: app.scoreView.trailPaused !== 0 && app.scoreView.trailPaused !== false, onchange: e => app.setScoreView({ trailPaused: e.target.checked ? 1 : 0 }) }), 'Tails stay where they were when the transport stops (off: they show only while it plays)'),
    line('Blips', h('input', { type: 'checkbox', checked: Boolean(app.scoreView.blip), onchange: e => app.setScoreView({ blip: e.target.checked ? 1 : 0 }) }), 'An event lights up when it goes off: an area or a point swells and glows; a line blips where the traveler crossed it'),
    h('div', { class: 'wb-tp-sub' }, 'Drawing'),
    slider({ label: 'Lazy', min: 0, max: 120, step: 1, value: app.lazy.radius, doc: 'The pen trails the cursor on a string this long (screen px). Small wobbles inside it never reach the line; corners get rounded. 0 = off', onInput: v => app.setLazy({ radius: v }) }),
    slider({ label: 'Smoothing', min: 0, max: 0.95, step: 0.01, value: app.lazy.smoothing, doc: 'Each step the pen covers only part of the way to where it is pulled (0.5 = half). Higher is smoother and lags more. 0 = off', onInput: v => app.setLazy({ smoothing: v }) }),
    slider({ label: 'Simplify', min: 0, max: 40, step: 0.5, value: app.lazy.simplify || 0, doc: 'On release, points the line does not need are dropped: how far (screen px) the shape may move. Higher = fewer points, looser shape. 0 = off', onInput: v => app.setLazy({ simplify: v }) }),
  ];
  pop.append(...(which === 'grid' ? gridRows : canvasRows));
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

/** A board's settings at the pointer: the board's Properties. */
export function openBoardParams(app, id, x, y) { app.canvas.selectBoard(id); return openPropertiesPopup(app, x, y); }

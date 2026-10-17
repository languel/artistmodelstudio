/**
 * Shortcuts (after underscores): every keyboard command in one registry, with defaults you can
 * reassign in the Shortcuts panel. Combos are written like 'mod+shift+z' (mod = ⌘ on Mac, Ctrl
 * elsewhere); a command may have several. Your changes are kept in the browser.
 */
const KEY = 'ams_shortcuts_v1';
export const IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');

const cmd = (id, category, label, keys, run, opts = {}) => ({ id, category, label, keys, run, ...opts });

export function defaultCommands(app) {
  const sel = () => [...app.canvas.selected];
  return [
    cmd('tool.select', 'Tools', 'Select', ['v'], () => app.setTool('select')),
    cmd('tool.direct', 'Tools', 'Direct selection (edit points)', [], () => app.setTool('direct')),
    cmd('tool.cycle.select', 'Tools', 'Cycle select and direct', ['shift+v'], () => app.cycleStack('select')),
    cmd('tool.cycle.line', 'Tools', 'Cycle line, gesture and guide', ['shift+1'], () => app.cycleStack('line')),
    cmd('tool.cycle.brush', 'Tools', 'Cycle brushes', ['shift+b'], () => app.cycleStack('brush')),
    cmd('tool.cycle.sculpt', 'Tools', 'Cycle sculpt tools', ['shift+s'], () => app.cycleStack('sculpt')),
    cmd('tool.hand', 'Tools', 'Pan', ['h'], () => app.setTool('hand')),
    cmd('paint.pick', 'Tools', 'Stroke and fill together at the pointer (also Ctrl+right-click)', [], () => app.openPaintPicker()),
    cmd('view.gridmenu', 'View', 'Grid settings at the pointer (also Ctrl+Shift+right-click)', [], () => app.openGridMenu?.()),
    cmd('tool.radial', 'Tools', 'Radial menu of the current tools at the pointer (hold, move toward a tool, release)', ['shift+space'], () => app.openRadial()),
    cmd('tool.laser', 'Tools', 'Laser pointer (a fading trail, no mark)', ['k'], () => app.setTool('laser')),
    cmd('tool.point', 'Tools', 'Point (dimension 0)', ['0'], () => app.setTool('point')),
    cmd('tool.line', 'Tools', 'Line (dimension 1)', ['1'], () => app.setTool('line')),
    cmd('tool.plane', 'Tools', 'Plane (dimension 2)', ['2'], () => app.setTool('plane')),
    cmd('tool.circle', 'Tools', 'Circle (under plane)', [], () => app.setTool('circle')),
    cmd('tool.rect', 'Tools', 'Rectangle (under plane)', [], () => app.setTool('rect')),
    cmd('tool.cycle.plane', 'Tools', 'Cycle plane, circle and rectangle', ['shift+2'], () => app.cycleStack('plane')),
    cmd('tool.gesture', 'Tools', 'Gesture (under line)', [], () => app.setTool('gesture')),
    cmd('tool.guide', 'Tools', 'Guide (under line)', [], () => app.setTool('guide')),
    cmd('tool.note', 'Tools', 'Note', ['t'], () => app.setTool('note')),
    cmd('view.points', 'View', "Show marks' points", ["'"], () => app.togglePoints()),
    cmd('tool.brush', 'Tools', 'Brush', ['b'], () => app.setTool('brush')),
    cmd('tool.sculpt', 'Tools', 'Sculpt', ['s'], () => app.setTool('sculpt')),
    cmd('path.straight', 'Tools', 'Straight path (the stroke being drawn, the selection, or the tool)', ['`'], () => app.setPathChoice('straight')),
    cmd('path.smooth', 'Tools', 'Smooth path (the stroke being drawn, the selection, or the tool)', ['~'], () => app.setPathChoice('smooth')),
    cmd('sculpt.smaller', 'Tools', 'Sculpt radius smaller', ['['], () => app.setSculpt({ radius: app.sculpt.radius / 1.2 })),
    cmd('sculpt.larger', 'Tools', 'Sculpt radius larger', [']'], () => app.setSculpt({ radius: app.sculpt.radius * 1.2 })),
    cmd('sculpt.weaker', 'Tools', 'Sculpt strength down', ['{'], () => app.setSculpt({ strength: app.sculpt.strength - 0.1 })),
    cmd('sculpt.stronger', 'Tools', 'Sculpt strength up', ['}'], () => app.setSculpt({ strength: app.sculpt.strength + 0.1 })),
    cmd('edit.undo', 'Edit', 'Undo', ['mod+z'], () => app.store.undo()),
    cmd('edit.redo', 'Edit', 'Redo', ['mod+shift+z'], () => app.store.redo()),
    cmd('edit.selectAll', 'Edit', 'Select all', ['mod+a'], () => app.canvas.select(app.store.doc.elements.filter(el => app.canvas.editable(el)).map(el => el.id))),
    cmd('edit.delete', 'Edit', 'Delete selection', ['delete', 'backspace'], () => { if (sel().length) app.store.removeElements(sel()); }),
    cmd('edit.deselect', 'Edit', 'Deselect and select tool (also leaves a take being reviewed)', ['escape'], () => { app.canvas.select([]); app.setTool('select'); }),
    cmd('edit.group', 'Edit', 'Group', ['mod+g'], () => app.groupSelection()),
    cmd('edit.ungroup', 'Edit', 'Ungroup', ['mod+shift+g'], () => app.ungroupSelection()),
    cmd('edit.eyedropper', 'Edit', 'Eyedropper', ['i'], () => import('./colorPicker.js').then(m => m.eyedropToTarget(app))),
    cmd('view.fit', 'View', 'Fit the active board', ['f'], () => { app.canvas.fit(60, app.activeBoard); app.renderChrome(); }),
    cmd('view.frameBoard', 'View', 'Frame the active board', ['home'], () => app.canvas.animateTo(app.canvas.camFor(app.activeBoard || 'main'), 400)),
    cmd('view.frameSelection', 'View', 'Frame the selection', ['shift+home'], () => { if (!app.canvas.frameSelection()) app.canvas.animateTo(app.canvas.camFor(app.activeBoard || 'main'), 400); }),
    cmd('tool.board', 'Tools', 'Board', [';'], () => app.setTool('board')),
    cmd('view.present', 'View', 'Present the boards', ['mod+alt+p'], () => app.present()),
    cmd('ui.all', 'View', 'Zen mode: hide all the interface, leaving only the drawing (again to bring it back)', ['alt+z', 'mod+.'], () => app.toggleZen(), { global: true }),
    cmd('view.theme', 'View', 'Dark / light theme', [], () => app.toggleTheme()),
    cmd('ui.perf', 'View', 'Show / hide the performance readout (fps, redraw time)', [], () => app.togglePerf()),
    cmd('ui.boardPerf', 'View', 'Show / hide performance under boards (runs, code and fit time, source and sketch fps)', [], () => app.toggleBoardPerf()),
    cmd('ui.tools', 'View', 'Show / hide the tools', [], () => app.setUI({ tools: !(app.ui?.tools !== false) })),
    cmd('ui.view', 'View', 'Show / hide the view controls and menu', [], () => app.setUI({ view: !(app.ui?.view !== false) })),
    cmd('ui.zoom', 'View', 'Show / hide the zoom controls', [], () => app.setUI({ zoom: !(app.ui?.zoom !== false) })),
    cmd('ui.panels', 'View', 'Show / hide the panels', [], () => app.setUI({ panels: !(app.ui?.panels !== false) })),
    cmd('scene.next', 'View', 'Next scene', ['alt+pagedown'], () => app.scenes.step(1)),
    cmd('scene.prev', 'View', 'Previous scene', ['alt+pageup'], () => app.scenes.step(-1)),
    cmd('scene.new', 'File', 'New scene', ['mod+alt+n'], () => app.scenes.create()),
    cmd('board.next', 'View', 'Next board', ['alt+arrowright'], () => app.stepBoard(1)),
    cmd('board.prev', 'View', 'Previous board', ['alt+arrowleft'], () => app.stepBoard(-1)),
    cmd('view.toggle', 'View', 'Picture / process view', ['\\'], () => app.setViewMode(app.view.mode === 'picture' ? 'process' : 'picture')),
    cmd('view.reference', 'View', 'Reference on / off', ['r'], () => { if (app.reference) { app.reference.visible = !app.reference.visible; app.canvas.invalidate(); app.renderChrome(); } }),
    cmd('view.grid', 'View', 'Grid on / off', ["mod+'"], () => app.canvas.setGrid({ show: app.canvas.grid.show === 'off' ? 'paper' : 'off' })),
    cmd('view.snap', 'View', 'Snap to grid', ['shift+tab'], () => app.canvas.setGrid({ snap: !app.canvas.grid.snap })),
    cmd('view.zoomIn', 'View', 'Zoom in', ['mod+='], () => app.canvas.zoomAt(app.canvas.w / 2, app.canvas.h / 2, 1.2)),
    cmd('view.zoomOut', 'View', 'Zoom out', ['mod+-'], () => app.canvas.zoomAt(app.canvas.w / 2, app.canvas.h / 2, 1 / 1.2)),
    cmd('dock.left', 'Panels', 'Toggle left dock', ['mod+b'], () => app.docks.toggleDock('left')),
    cmd('dock.right', 'Panels', 'Toggle right dock', ['mod+alt+b'], () => app.docks.toggleDock('right')),
    cmd('dock.bottom', 'Panels', 'Toggle bottom dock', ['mod+shift+b'], () => app.docks.toggleDock('bottom')),
    cmd('app.palette', 'App', 'Command palette', ['mod+k'], () => import('./palette.js').then(m => m.openPalette(app)), { global: true }),
    cmd('app.settings', 'App', 'Settings', ['mod+,'], () => app.docks.open('settings'), { global: true }),
    cmd('app.shortcuts', 'App', 'Shortcuts', ['mod+shift+/'], () => app.docks.open('shortcuts'), { global: true }),
    cmd('app.docs', 'App', 'Docs', ['?'], () => app.openDocs()),
    cmd('file.save', 'File', 'Save to Assets', ['mod+s'], () => app.saveToAssets(), { global: true }),
    cmd('file.open', 'File', 'Open file', ['mod+o'], () => app.openFile()),
    cmd('score.run', 'Score', 'Run the score', [], () => app.scriptPanel?.run())
  ];
}

/** 'mod+shift+z' from a KeyboardEvent (null for bare modifiers). */
export function comboOf(e) {
  const k = e.key;
  if (['Meta', 'Control', 'Shift', 'Alt', 'CapsLock'].includes(k)) return null;
  const mods = [];
  if (IS_MAC ? e.metaKey : e.ctrlKey) mods.push('mod');
  if (IS_MAC && e.ctrlKey) mods.push('ctrl');
  if (e.altKey) mods.push('alt');
  // Shifted punctuation (?, +) is its own key; letters and digits keep shift as a modifier.
  let key = k.length === 1 ? k.toLowerCase() : k.toLowerCase();
  if (e.altKey && e.code?.startsWith('Key')) key = e.code.slice(3).toLowerCase();
  if (e.shiftKey && e.code?.startsWith('Digit')) key = e.code.slice(5);   // Shift+2 arrives as '@'; the digit is what is meant
  const withMod = mods.includes('mod') || mods.includes('ctrl');
  if (e.code === 'Slash' && withMod) key = '/';                       // ⌘? arrives as '/' on some layouts
  if (e.shiftKey && (/^[a-z0-9/]$/.test(key) && (withMod || /^[a-z0-9]$/.test(key)) || k.length > 1 || key === ' ')) mods.push('shift');
  if (key === ' ') key = 'space';
  if (key === 'del') key = 'delete';
  return [...mods, key].join('+');
}

const GLYPH = IS_MAC ? { mod: '⌘', shift: '⇧', alt: '⌥', ctrl: '⌃' } : { mod: 'Ctrl+', shift: 'Shift+', alt: 'Alt+', ctrl: 'Ctrl+' };
const KEYNAME = { tab: '⇥', escape: 'Esc', delete: 'Del', backspace: '⌫', enter: '↵', space: 'Space', arrowup: '↑', arrowdown: '↓', arrowleft: '←', arrowright: '→', '\\': '\\' };
/** '⇧⌘Z' (Mac) or 'Ctrl+Shift+Z'. */
export function formatCombo(c) {
  if (!c) return '';
  const parts = c.split('+').filter(Boolean);
  const key = parts.pop() ?? '+';
  const order = IS_MAC ? ['ctrl', 'alt', 'shift', 'mod'] : ['mod', 'ctrl', 'alt', 'shift'];
  const mods = order.filter(m => parts.includes(m)).map(m => GLYPH[m]).join('');
  return `${mods}${KEYNAME[key] || (key.length === 1 ? key.toUpperCase() : key)}`;
}

export class Shortcuts {
  constructor(app) {
    this.app = app;
    this.commands = defaultCommands(app);
    try { this.overrides = JSON.parse(localStorage.getItem(KEY)) || {}; } catch { this.overrides = {}; }
    this.listeners = new Set();
    this.capturing = null;
    window.addEventListener('keydown', e => this.onKey(e));
  }

  keysOf(id) { return this.overrides[id] ?? this.commands.find(c => c.id === id)?.keys ?? []; }
  isCustom(id) { return id in this.overrides; }
  label(id) { return this.keysOf(id).map(formatCombo).join(' · '); }

  save() { try { localStorage.setItem(KEY, JSON.stringify(this.overrides)); } catch { /* ignore */ } for (const f of this.listeners) f(); }

  /** Assign combos to a command; the same combo is taken off any other command. Returns the commands it was taken from. */
  assign(id, keys) {
    const taken = [];
    for (const c of this.commands) {
      if (c.id === id) continue;
      const k = this.keysOf(c.id);
      const left = k.filter(x => !keys.includes(x));
      if (left.length !== k.length) { this.overrides[c.id] = left; taken.push(c); }
    }
    const def = this.commands.find(c => c.id === id)?.keys || [];
    if (JSON.stringify(keys) === JSON.stringify(def)) delete this.overrides[id]; else this.overrides[id] = keys;
    this.save();
    return taken;
  }

  reset(id) { if (id) delete this.overrides[id]; else this.overrides = {}; this.save(); }

  find(combo) { return this.commands.find(c => this.keysOf(c.id).includes(combo)); }

  onKey(e) {
    if (this.capturing) return;
    const combo = comboOf(e);
    if (!combo) return;
    const typing = e.target.closest?.('input, textarea, select, [contenteditable], .cm-editor');
    const c = this.find(combo);
    if (!c) return;
    if (typing && !c.global) return;
    e.preventDefault();
    try { const r = c.run(); r?.catch?.(err => this.app.log(err.message, 'error')); } catch (err) { this.app.log(err.message, 'error'); }
  }
}

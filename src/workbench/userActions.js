/**
 * User actions (after Underscores' screencast input): a small overlay that shows what you press and
 * click, and what it did. For teaching, demos and recordings.
 *
 * Each cue is an input — a key chord (with the command it is bound to), a click, a drag or a scroll
 * (with its modifiers and where: the canvas, the Timeline, a panel) — and what followed it within a
 * moment: the drawing's change, a tool chosen, play or pause, the playhead moved, a selection, the
 * line logged. When nothing followed, the command's or the control's own name stands in.
 * Pointer moves are left out (a drag is one cue). The overlay ignores itself.
 *
 * Toggle: View → Show user actions (⌘⌥I / Ctrl+Alt+I), or the command palette. Drag its header to move
 * it; double-click its glyph for one line only; × hides it. Remembered in this browser.
 */
import { comboOf } from './shortcuts.js';

const KEY_VISIBLE = 'ams_user_actions';
const KEY_POS = 'ams_user_actions_pos';
const KEY_MIN = 'ams_user_actions_min';
const KEEP = 12, SHOWN = 4, WINDOW = 500;   // cues kept, earlier cues shown, how long effects are gathered (ms)
const read = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private window */ } };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const MODIFIERS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'AltGraph', 'OS', 'CapsLock']);
const mods = e => `${e.metaKey ? '⌘' : ''}${e.ctrlKey ? '⌃' : ''}${e.altKey ? '⌥' : ''}${e.shiftKey ? '⇧' : ''}`;
const KEY_NAMES = { ' ': 'Space', Escape: 'Esc', Backspace: '⌫', Delete: '⌦', Enter: '↵', Tab: '⇥', ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓' };
const keyName = e => KEY_NAMES[e.key] || (e.key.length === 1 ? e.key.toUpperCase() : e.key);
/** A control's name: its menu text, or the start of its title (titles here are sentences). */
const shortName = s => String(s || '').split(/[:(;—]|\. /)[0].trim().slice(0, 48);

/** The glyphs: a mouse with the pressed button filled, a keyboard, a wheel. */
const MOUSE = b => `<svg viewBox="0 0 24 26" width="18" height="20" fill="none" stroke="currentColor" stroke-width="1.6">${b === 'left' ? '<path d="M4 10V9a8 8 0 0 1 8-8v9Z" fill="currentColor"/>' : ''}${b === 'right' ? '<path d="M12 1a8 8 0 0 1 8 8v1h-8Z" fill="currentColor"/>' : ''}<rect x="4" y="1" width="16" height="24" rx="8"/><path d="M12 1v9M4.5 10h15"/>${b === 'scroll' || b === 'middle' ? '<path d="M12 4.5v5" stroke-width="2.4"/>' : ''}</svg>`;
const KEYBOARD = '<svg viewBox="0 0 24 18" width="20" height="16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1.5" y="2.5" width="21" height="13" rx="2"/><path d="M5 6h1M8 6h1M11 6h1M14 6h1M17 6h1M5 9h1M8 9h1M11 9h1M14 9h1M17 9h1M5 12h7M14 12h5"/></svg>';

/**
 * The input as keycaps. A key: each modifier its own cap, then the key. A pointer gesture is abbreviated to caps of the same size: the button (L, R, M; ✎ for a pen, ☝ for touch)
 * and what it did (click, drag; scroll with its direction, or zoom).
 */
const BUTTON = { left: 'L', right: 'R', middle: 'M', pen: '✎', touch: '☝' };
const ARROW = { up: '↑', down: '↓', left: '←', right: '→' };
const keycaps = c => {
  const m = /^([⌘⌃⌥⇧]*)\s*(.*)$/.exec(c.input) || [];
  const cap = t => `<kbd>${esc(t)}</kbd>`;
  const mods = [...(m[1] || '')].map(cap).join(''), rest = (m[2] || '').trim();
  if (!rest) return mods;
  if (c.kind === 'key') return `${mods}${cap(rest)}`;
  let g;
  if ((g = /^(left|right|middle|pen|touch) (click|drag)$/.exec(rest))) return `${mods}<kbd class="wide"><b>${esc(BUTTON[g[1]])}</b>${esc(g[2])}</kbd>`;
  if ((g = /^scroll \(zoom\)$/.exec(rest))) return `${mods}<kbd class="wide"><b>scroll</b>zoom</kbd>`;
  if ((g = /^scroll (up|down|left|right)$/.exec(rest))) return `${mods}<kbd class="wide"><b>scroll</b>${esc(ARROW[g[1]])}</kbd>`;
  return `${mods}<span class="wb-ua-gesture">${esc(rest)}</span>`;
};

/**
 * What a cue did, as lines. A selection that follows (a drag draws a mark and the new mark is selected; starting a stroke clears the selection) is
 * only the tool's own side effect when something else was done, so it is left out then; alone it is the point of the click: "Select 2 marks", "Deselect".
 */
export function effectsOf(effects = []) {
  const main = effects.filter(f => !/^Select /.test(f.text));
  return (main.length ? main : effects).map(f => (f.text === 'Select nothing' ? 'Deselect' : f.text));
}

/** A gesture in a few characters: "L click", "R drag", "scroll ↑" (the keycaps show the same). */
export const shortInput = c => {
  const g = /^([⌘⌃⌥⇧]*)\s*(left|right|middle|pen|touch) (click|drag)$/.exec(c.input);
  if (g) return `${g[1]}${BUTTON[g[2]]} ${g[3]}`;
  const w = /^([⌘⌃⌥⇧]*)\s*scroll (up|down|left|right)$/.exec(c.input);
  return w ? `${w[1]}scroll ${ARROW[w[2]]}` : c.input;
};

/** A dragged path, thinned (a point only when it moved a few pixels, at most ~100) and, for the canvas, in the drawing's own coordinates so it follows the view. [[x, y, ms], …] */
function pathOf(path, toWorld) {
  const out = [], keep = (x, y, t) => { const [a, b] = toWorld ? toWorld(x, y) : [x, y]; out.push([Math.round(a * 10) / 10, Math.round(b * 10) / 10, t]); };
  let last = null;
  for (const [x, y, t] of path) { if (!last || Math.hypot(x - last[0], y - last[1]) >= 3) { keep(x, y, t); last = [x, y]; } }
  const end = path.at(-1); if (end && last && (end[0] !== last[0] || end[1] !== last[1])) keep(end[0], end[1], end[2]);
  if (out.length > 120) { const k = out.length / 120; return Array.from({ length: 120 }, (_, i) => out[Math.min(out.length - 1, Math.round(i * k))]).concat([out.at(-1)]); }
  return out;
}

export class UserActions {
  constructor(app) {
    this.app = app;
    this.cues = [];
    this.minimal = read(KEY_MIN, true);   // (the earlier actions are folded away until asked for)
    this.el = null;
    this.open = null;   // the cue gathering effects, and until when
    this.listen();
    if (read(KEY_VISIBLE, false)) this.show();
  }

  get visible() { return Boolean(this.el?.isConnected); }
  toggle() { this.visible ? this.hide() : this.show(); }
  hide() { this.el?.remove(); write(KEY_VISIBLE, false); }
  show() {
    if (!this.el) this.build();
    document.body.append(this.el);
    write(KEY_VISIBLE, true);
    this.place(read(KEY_POS, null));
    this.render();
  }

  // ---- what happened ---------------------------------------------------------------------------
  listen() {
    const app = this.app, mine = t => t?.closest?.('[data-user-actions]');
    const downs = new Map();
    window.addEventListener('keydown', e => {
      if (e.repeat || MODIFIERS.has(e.key) || mine(e.target)) return;
      const typing = e.target.closest?.('input, textarea, select, [contenteditable], .cm-editor');
      if (typing && !(e.metaKey || e.ctrlKey || e.altKey) && e.key.length === 1) return;   // (typing is not an action)
      // (keys go to the body: where the pointer is says where they land)
      const where = this.where(e.target === document.body ? this.hoverTarget : e.target);
      // The command the key is bound to: the Timeline's own keys while it has the pointer, else the shortcuts'.
      const tl = where === 'Timeline' ? app.timelineKeyLabel?.(e) : null;
      const sc = app.shortcuts?.find(comboOf(e) || '');
      const held = e.key === ' ' && where === 'Canvas' && !sc ? 'Hold: pan' : '';
      this.cue({ kind: 'key', input: `${mods(e)}${keyName(e)}`, where, fallback: tl || shortName(sc?.label) || held, ui: { command: sc?.id || null, name: tl || shortName(sc?.label) || held || '', tool: this.toolName() } });
    }, true);
    window.addEventListener('pointermove', e => {
      this.hoverTarget = e.target;
      const d = downs.get(e.pointerId);   // (a press being dragged: where the pointer went, and when, so playback can follow it)
      if (d && d.path.length < 2000) d.path.push([e.clientX, e.clientY, Date.now() - d.at]);
    }, { capture: true, passive: true });
    window.addEventListener('pointerdown', e => {
      if (mine(e.target)) return;
      // (what a press does at once, the playhead moving, belongs to the click or drag it starts)
      downs.set(e.pointerId, { x: e.clientX, y: e.clientY, e, target: e.target, effects: [], at: Date.now(), path: [[e.clientX, e.clientY, 0]] });
      this.pending = downs.get(e.pointerId);
    }, true);
    window.addEventListener('pointerup', e => {
      const d = downs.get(e.pointerId); downs.delete(e.pointerId);
      if (!d || mine(d.target)) return;
      const de = d.e, drag = Math.hypot(e.clientX - d.x, e.clientY - d.y) > 4;
      const button = de.pointerType === 'pen' ? 'pen' : de.pointerType === 'touch' ? 'touch' : ['left', 'middle', 'right'][de.button] || 'left';
      if (this.pending === d) this.pending = null;
      const where = this.where(d.target);
      const g = d.target.closest?.('[data-guide]'), cv = app.canvas?.canvas?.getBoundingClientRect?.();
      const world = where === 'Canvas' && cv && app.canvas?.toWorld ? [[d.x, d.y], [e.clientX, e.clientY]].map(([x, y]) => app.canvas.toWorld(x - cv.left, y - cv.top).map(Math.round)) : null;
      this.cue({ kind: 'pointer', button, input: `${mods(de)}${mods(de) ? ' ' : ''}${button} ${drag ? 'drag' : 'click'}`, where, fallback: where === 'Canvas' ? this.toolName() : this.targetName(d.target),
        ui: { popup: d.target.closest?.('.wb-cp-pop') ? 'paint' : null, popupAt: (() => { const pop = d.target.closest?.('.wb-cp-pop'); if (!pop) return null; const b = pop.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top)]; })(), path: drag ? pathOf(d.path, where === 'Canvas' && cv && app.canvas?.toWorld ? (x, y) => app.canvas.toWorld(x - cv.left, y - cv.top) : null) : null, pathSpace: where === 'Canvas' && cv && app.canvas?.toWorld ? 'world' : 'screen', target: g?.getAttribute('data-guide') || null, name: this.targetName(d.target), tool: this.toolName(), drag, since: d.at, from: [Math.round(d.x), Math.round(d.y)], to: [Math.round(e.clientX), Math.round(e.clientY)], world, bar: Boolean(d.target.closest?.('.wb-tl-bar')) } }, d.effects);
    }, true);
    window.addEventListener('pointercancel', e => downs.delete(e.pointerId), true);
    let lastWheel = 0;
    window.addEventListener('wheel', e => {
      if (mine(e.target) || performance.now() - lastWheel < 400) return;
      lastWheel = performance.now();
      const zoom = e.ctrlKey || e.metaKey, dir = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? (e.deltaY > 0 ? 'down' : 'up') : (e.deltaX > 0 ? 'right' : 'left');
      this.cue({ kind: 'pointer', button: 'scroll', input: zoom ? `${mods(e)} scroll (zoom)` : `${mods(e)}${mods(e) ? ' ' : ''}scroll ${dir}`, where: this.where(e.target), fallback: zoom ? 'Zoom' : 'Scroll', ui: { name: zoom ? 'Zoom' : 'Scroll', tool: this.toolName() } });
    }, { capture: true, passive: true });

    // What follows an input, for a moment, is what it did.
    const later = () => {
      if (!app.store) return setTimeout(later, 50);
      app.store.subscribe((doc, reason) => this.effect(reason && reason !== 'change' ? String(reason) : 'Edit the drawing'));
      app.on('tool', () => this.effect(`Tool: ${this.toolName()}`));
      // The agent's own (shown) tool calls, in the same list: what it did, as a line you could follow by hand
      app.on('tool-call', (name, args, o) => { if (o?.quiet || o?.replay) return; this.cue({ kind: 'agent', button: 'agent', input: `Agent · ${String(name).replace(/^ams_/, '').replace(/_/g, ' ')}`, where: 'Agent', fallback: o?.summary || '', ui: { name: o?.summary || '', tool: this.toolName() } }); });
      app.on('selection', () => { const n = app.canvas?.selected?.size || 0; this.effect(n ? `Select ${n} mark${n === 1 ? '' : 's'}` : 'Select nothing'); });
      app.on('log', () => { const l = app.logLines?.at(-1); if (l && Date.now() - l.t < 100) this.effect(l.text.length > 90 ? `${l.text.slice(0, 88)}…` : l.text, 'log'); });
      const watchPlayer = () => {
        const p = app.player; if (!p) return setTimeout(watchPlayer, 100);
        let playing = p.playing, t = p.t;
        p.on(() => {
          if (p.playing !== playing) { playing = p.playing; this.effect(playing ? 'Play' : 'Pause'); }
          else if (!p.playing && Math.abs(p.t - t) > 1) this.effect(`Playhead to ${(p.t / 1000).toFixed(2)} s`, 'playhead');
          t = p.t;
        });
      };
      watchPlayer();
    };
    later();
  }

  /** The tool, by its short name. */
  toolName() { return shortName((this.app.toolList || []).find(t => t[0] === this.app.tool)?.[1] || this.app.tool || ''); }

  /** Where an input landed: the canvas, the Timeline, a panel (by its title), a menu, the bar. */
  where(t) {
    if (!t?.closest) return '';
    if (t.closest('.wb-cp-pop')) return 'Color picker';
    if (t.closest('.wb-menu')) return 'Menu';
    if (t.closest('.wb-tl')) return 'Timeline';
    if (this.app.canvas?.canvas && (t === this.app.canvas.canvas || this.app.canvas.canvas.parentElement?.contains(t) && t.tagName === 'CANVAS')) return 'Canvas';
    for (const p of this.app.docks?.panels?.values?.() || []) if (p.body?.contains(t)) return p.title;
    if (t.closest('.wb-dialog')) return 'Dialog';
    return '';
  }

  /** A control's own name (a menu item's text, a button's title or label). */
  targetName(t) {
    if (!t?.closest) return '';
    const item = t.closest('.wb-menu button');
    if (item) return (item.querySelector('span:not(.wb-menu-icon)')?.textContent || item.textContent || '').trim().slice(0, 48);
    const c = t.closest('[title], [aria-label], button');
    return shortName(c?.getAttribute?.('aria-label') || c?.getAttribute?.('title') || (c?.tagName === 'BUTTON' ? c.textContent : ''));
  }

  cue(c, effects = []) {
    c.id = (this.seq = (this.seq || 0) + 1);
    c.effects = effects;
    c.t = Date.now(); c.h0 = this.app.history?.entries.length ?? 0;   // (when, and where History stood: what it gains in the next moments is this cue's doing)
    setTimeout(() => this.app.interactions?.addCue(c), WINDOW + 120);
    this.cues.push(c);
    if (this.cues.length > KEEP) this.cues.shift();
    this.open = { cue: c, until: performance.now() + WINDOW };
    this.render();
  }

  /** Something happened: it belongs to the cue just before it (a playhead moving keeps one line, updated). */
  effect(text, kind = '') {
    if (!text) return;
    const o = this.open;
    const fx = this.pending ? this.pending.effects : o && performance.now() <= o.until ? o.cue.effects : null;
    if (!fx) return;
    if (kind && fx.some(f => f.kind === kind)) fx.find(f => f.kind === kind).text = text;
    else if (!fx.some(f => f.text === text)) fx.push({ text, kind });
    this.render();
  }

  // ---- the overlay -----------------------------------------------------------------------------
  build() {
    const el = document.createElement('aside');
    el.className = 'wb-ua';
    el.dataset.userActions = '';
    el.setAttribute('aria-label', 'User actions');
    el.innerHTML = '<button type="button" class="wb-ua-close" title="Hide (⌘⌥I)" aria-label="Hide">×</button><button type="button" class="wb-ua-more"></button><header class="wb-ua-head" title="Drag to move"><span class="wb-ua-glyph"></span><span class="wb-ua-input"></span><span class="wb-ua-what"></span></header><div class="wb-ua-list" aria-live="polite"></div>';
    el.querySelector('.wb-ua-close').addEventListener('click', () => this.hide());
    el.querySelector('.wb-ua-more').addEventListener('click', () => { this.minimal = !this.minimal; write(KEY_MIN, this.minimal); this.render(); });
    el.querySelector('.wb-ua-head').addEventListener('pointerdown', e => {
      if (e.button !== 0 || e.target.closest('.wb-ua-close')) return;
      e.preventDefault();
      const r = el.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
      const mv = ev => this.place({ x: ev.clientX - dx, y: ev.clientY - dy });
      const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); write(KEY_POS, { x: el.offsetLeft, y: el.offsetTop }); };
      window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
    });
    addEventListener('resize', () => this.visible && this.place({ x: el.offsetLeft, y: el.offsetTop }));
    this.el = el;
  }

  /** Placed inside the window (lower right at first). */
  place(pos) {
    const el = this.el, w = el.offsetWidth || 300, h = el.offsetHeight || 120;
    const p = pos || { x: innerWidth - w - 24, y: innerHeight - h - 90 };
    el.style.left = `${Math.max(8, Math.min(innerWidth - w - 8, p.x))}px`;
    el.style.top = `${Math.max(8, Math.min(innerHeight - h - 8, p.y))}px`;
  }

  render() {
    if (!this.visible) return;
    const el = this.el, cur = this.cues.at(-1), q = sel => el.querySelector(sel);
    const what = c => (c.effects.length ? effectsOf(c.effects).join(' · ') : c.fallback || '');
    const tag = c => (c.kind === 'key' ? 'key' : c.kind === 'agent' ? 'agent' : c.button === 'scroll' ? 'wheel' : c.button === 'pen' || c.button === 'touch' ? c.button : 'mouse');
    q('.wb-ua-glyph').innerHTML = !cur ? MOUSE('') : cur.kind === 'key' ? KEYBOARD : MOUSE(cur.button);
    // On top, always: the key or gesture (accent) and what it did. Under the line (the chevron folds it away): the same cue's kind and where, with the tool, then the earlier ones, dimmer.
    q('.wb-ua-input').innerHTML = cur ? keycaps(cur) : 'Ready';
    q('.wb-ua-what').textContent = cur ? what(cur) : '';
    q('.wb-ua-what').title = cur ? what(cur) : '';
    const tool = this.toolName(), earlier = this.cues.slice(0, -1).reverse().slice(0, SHOWN);
    const more = q('.wb-ua-more');
    more.innerHTML = `<svg viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="${this.minimal ? 'M2.5 4.5 6 8 9.5 4.5' : 'M2.5 7.5 6 4 9.5 7.5'}"/></svg>`;   // (an outline chevron, the size of the ×)
    more.title = this.minimal ? 'Show where, the tool and the earlier actions' : 'Hide them';
    const now = `<div class="wb-ua-row cur"><span>${esc(cur ? `${tag(cur)}${cur.where ? ` · ${cur.where}` : ''}` : 'keys, clicks and what they do')}</span><span title="The tool: ${esc(tool)}">${esc(tool)}</span></div>`;
    q('.wb-ua-list').innerHTML = this.minimal ? '' : now + earlier.map(c => `<div class="wb-ua-row"><b>${esc(shortInput(c))}</b><span>${esc(what(c) || c.where)}</span></div>`).join('');
    el.classList.toggle('minimal', this.minimal);
  }
}

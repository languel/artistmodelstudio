/**
 * Parameters in code, as controls in the editor (after underscores and Strudel's inline sliders):
 *
 *   params: { amount: [0, 1, 0.5, 'doc'] }    a param declaration gets a slider (on its line, or in a
 *                                            preview strip: controlStrip). With a
 *                                            live source (the Sculpt panel) it sets the value in use;
 *                                            otherwise it rewrites the default in the code.
 *   0.4 /* 0..1 *\/                          a number with a range comment gets a slider that
 *                                            rewrites the number (any number, anywhere).
 *   Cmd-drag any number                      scrubs it (Shift: fine).
 *
 * The code stays the truth: sliders that rewrite write plain numbers back into it.
 */
import { ViewPlugin, EditorView, Decoration, WidgetType } from '@codemirror/view';

import { NUM, decimalsOf, fmt, stepFor, findControls, literalOf } from '../process/controls.js';
export { findControls };

import { rangeInput, paintRange } from './rangeInput.js';
import { showMenu } from './menu.js';
import { openPicker, parseColor } from './colorPicker.js';

/** Any CSS colour (a name, #fa0, rgb(…), hsl(…)) as '#rrggbb'. */
function cssToHex(css) {
  try {
    const ctx = document.createElement('canvas').getContext('2d');
    ctx.fillStyle = '#000'; ctx.fillStyle = css;
    const v = ctx.fillStyle;
    return v[0] === '#' ? v : parseColor(v).hex;
  } catch { return parseColor(css).hex; }
}
export { rangeInput, paintRange };

/**
 * One control: a slider bound to a code control `c`. With `live` it drives the value in use,
 * else it rewrites the number in the code (found again by id, as positions move while typing).
 */
export function makeControl(c, view, liveSrc) {
  return c.kind === 'range' || c.kind === 'param' ? makeSlider(c, view, liveSrc) : makeChoice(c, view);
}

/** A toggle, a select or a colour: the code keeps the value as a literal (true, 'name', '#rrggbb'). */
function makeChoice(c, view) {
  let input;
  if (c.kind === 'toggle') { input = document.createElement('input'); input.type = 'checkbox'; input.checked = Boolean(c.value); }
  else if (c.kind === 'color') { // A round swatch that opens the studio's own picker.
    input = document.createElement('button'); input.type = 'button'; input.className = 'wb-color-input'; input.value = c.css || c.value; input.style.background = input.value;
    input.addEventListener('click', () => { const start = cssToHex(input.value).toLowerCase(); openPicker(input, { hex: start, alpha: 1 }, col => { if (col.hex.toLowerCase() === start) return; set(col.hex); fire(); }, null); });   // (a colour in another form, 'red', stays as it is until it is changed)
  }
  else {
    // A chip that opens the studio's menu (a native dropdown does not hold up inside the editor).
    input = document.createElement('button'); input.type = 'button'; input.className = 'wb-pick'; input.value = c.value;
    const text = document.createElement('span'); text.className = 'wb-pick-text'; text.textContent = c.value;
    const caret = document.createElement('span'); caret.className = 'wb-pick-caret'; caret.innerHTML = '<svg viewBox="0 0 10 10" width="100%" height="100%"><path d="M2.3 3.8 5 6.4 7.7 3.8" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    input.append(text, caret);
    input.addEventListener('click', () => { const r = input.getBoundingClientRect(); showMenu(c.options.map(o => ({ label: o, active: o === input.value, run: () => { set(o); fire(); } })), r.left, r.bottom + 2); });
  }
  const name = c.name || 'value';
  input.title = name;
  const read = () => (c.kind === 'toggle' ? input.checked : input.value);
  const listeners = [];
  const fire = () => {
    const v = read();
    for (const f of listeners) f(v);
    const cur = findControls(view.state.doc.toString()).find(x => x.id === c.id);
    if (cur) view.dispatch({ changes: { from: cur.from, to: cur.to, insert: literalOf(cur, v) } });
  };
  if (c.kind === 'toggle') input.addEventListener('change', fire);
  for (const ev of ['mousedown', 'pointerdown', 'keydown', 'click']) input.addEventListener(ev, e => e.stopPropagation());
  function set(v) { if (c.kind === 'toggle') input.checked = Boolean(v); else { input.value = String(v); if (c.kind === 'color') input.style.background = String(v); const t = input.querySelector('.wb-pick-text'); if (t) t.textContent = String(v); } }
  return { input, step: 1, name, onInput: f => listeners.push(f), value: read, set };
}

function makeSlider(c, view, liveSrc) {
  const step = c.step || stepFor(c.min, c.max);
  const target = liveSrc && c.kind === 'param' ? liveSrc.target?.() : null;
  const live = liveSrc && c.kind === 'param' && !(liveSrc.target && !target) ? liveSrc : null;
  const liveVal = live ? live.get(c.key) : undefined;
  const name = c.kind === 'param' ? c.key : c.name || 'value';
  const tip = v => (live ? `${name} = ${fmt(v, step)} on ${target || 'the tool in use'} (the code keeps the default)` : `${name} = ${fmt(v, step)} (${c.min}…${c.max})`);
  const input = rangeInput({ min: c.min, max: c.max, step, value: liveVal ?? c.value });
  input.title = tip(Number(input.value));
  if (live) input.classList.add('live');
  const listeners = [];
  input.addEventListener('input', () => {
    const v = Number(input.value);
    input.title = tip(v);
    for (const f of listeners) f(v);
    if (live && live.set(c.key, v) !== false) return;
    const cur = findControls(view.state.doc.toString()).find(x => x.id === c.id);
    if (cur) view.dispatch({ changes: { from: cur.from, to: cur.to, insert: fmt(v, step) } });
  });
  for (const ev of ['mousedown', 'pointerdown', 'keydown', 'click']) input.addEventListener(ev, e => e.stopPropagation());
  return { input, step, name, onInput: f => listeners.push(f), value: () => Number(input.value), set: v => { input.value = String(v); paintRange(input); } };
}

/** The sliders of one line, overlaid on the line's right side. */
class LineControls extends WidgetType {
  constructor(cs, view, live) { super(); this.cs = cs; this.view = view; this.live = live; }
  sig() { return `${this.live ? 'L' : ''}${this.cs.map(c => `${c.id}:${c.kind}:${c.min}:${c.max}:${c.options || ''}`).join('|')}`; }
  eq(o) { return this.sig() === o.sig() && o.cs.every((c, i) => c.value === this.cs[i].value); }
  toDOM() {
    const wrap = document.createElement('span');
    wrap.className = 'cm-param';
    wrap._sig = this.sig();
    wrap._ctls = this.cs.map(c => makeControl(c, this.view, this.live));
    for (const ctl of wrap._ctls) wrap.append(ctl.input);
    return wrap;
  }
  // The same controls with another value (an edit, an undo, a drag): keep the elements, show the value.
  updateDOM(dom) {
    if (dom._sig !== this.sig()) return false;
    this.cs.forEach((c, i) => { const ctl = dom._ctls[i]; const v = c.css ?? c.value; if (document.activeElement !== ctl.input && String(ctl.value()) !== String(v)) ctl.set(v); });
    return true;
  }
  ignoreEvent() { return true; }
}

const lineMark = Decoration.line({ class: 'cm-has-param' });
// Each control sits just before the value it sets (after the closing bracket for a params block).
function build(view, live) {
  const out = [], lines = new Set();
  for (const c of findControls(view.state.doc.toString())) {
    const pos = c.kind === 'param' ? c.at : c.from;
    const line = view.state.doc.lineAt(pos);
    if (!lines.has(line.from)) { lines.add(line.from); out.push(lineMark.range(line.from)); }
    out.push(Decoration.widget({ widget: new LineControls([c], view, live), side: c.kind === 'param' ? 1 : -1 }).range(pos));
  }
  return Decoration.set(out, true);
}

/**
 * A strip of the code's controls (for a preview area): label, slider, value. It follows the code:
 * rebuilt when controls appear or go, values refreshed when numbers change.
 */
export function controlStrip(editor) {
  const el = document.createElement('div');
  el.className = 'wb-ctl-strip';
  let sig = '', rows = [];
  const refresh = () => {
    const cs = findControls(editor.value);
    const live = editor.getLive?.();
    const next = cs.map(c => `${c.id}:${c.min}:${c.max}:${c.options || ''}`).join('|') + (live ? `#${live.target?.() || 'live'}` : '');
    if (next === sig) {
      // Same controls: only follow values changed in the code (not the one being dragged).
      rows.forEach((r, i) => { if (document.activeElement !== r.ctl.input && !r.live) { r.ctl.set(cs[i].css ?? cs[i].value); r.out.textContent = r.show(cs[i].value); } });
      return;
    }
    sig = next;
    el.replaceChildren();
    rows = cs.map(c => {
      const ctl = makeControl(c, editor.view, live);
      const num = c.kind === 'range' || c.kind === 'param';
      const show = v => (num ? fmt(v, ctl.step) : '');
      const out = document.createElement('span'); out.className = 'wb-ctl-value'; out.textContent = show(ctl.value());
      ctl.onInput(v => { out.textContent = show(v); });
      const lab = document.createElement('span'); lab.className = 'wb-ctl-label'; lab.textContent = c.kind === 'param' ? c.key : c.name || `line ${editor.view.state.doc.lineAt(c.from).number}`;
      const row = document.createElement('label'); row.className = `wb-ctl-row${c.kind === 'range' || c.kind === 'param' ? '' : ' wb-ctl-choice'}`; row.title = ctl.input.title;
      row.append(lab, ctl.input, out);
      el.append(row);
      return { ctl, out, show, live: ctl.input.classList.contains('live') };
    });
    el.hidden = !rows.length;
  };
  editor.onDocChange(refresh);
  editor.onLiveChange(() => { sig = ''; refresh(); });
  refresh();
  return el;
}

/** Cmd-drag a number literal to change it (Shift: fine steps). */
const scrub = EditorView.domEventHandlers({
  mousedown(e, view) {
    if (!(e.metaKey || e.ctrlKey) || e.button !== 0) return false;
    const pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
    if (pos == null) return false;
    const line = view.state.doc.lineAt(pos);
    const re = new RegExp(NUM, 'g');
    let m, hit = null;
    while ((m = re.exec(line.text))) { const a = line.from + m.index, b = a + m[0].length; if (pos >= a && pos <= b) { hit = { from: a, to: b, text: m[0] }; break; } }
    // Not part of a word (x1, id2…).
    if (!hit || /[\w$]/.test(view.state.doc.sliceString(hit.from - 1, hit.from))) return false;
    e.preventDefault();
    const v0 = Number(hit.text), d = decimalsOf(hit.text), step = d ? 10 ** -d : 1, x0 = e.clientX;
    let cur = { ...hit };
    document.body.style.cursor = 'ew-resize';
    const mv = ev => {
      const v = v0 + Math.round((ev.clientX - x0) / (ev.shiftKey ? 8 : 2)) * step;
      const insert = d ? v.toFixed(d) : String(Math.round(v));
      view.dispatch({ changes: { from: cur.from, to: cur.to, insert } });
      cur = { from: cur.from, to: cur.from + insert.length };
    };
    const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); document.body.style.cursor = ''; };
    window.addEventListener('mousemove', mv);
    window.addEventListener('mouseup', up);
    return true;
  }
});

/**
 * The extension. `getLive()`: { get(key), set(key, value), target?() } or null — param sliders
 * then drive the values in use instead of rewriting defaults. `overlay`: sliders on the lines.
 */
export function codeParams(getLive = () => null, { overlay = true } = {}) {
  if (!overlay) return [scrub];
  const plugin = ViewPlugin.fromClass(class {
    constructor(view) { this.live = getLive(); this.decorations = build(view, this.live); }
    update(u) {
      const live = getLive();
      if (u.docChanged || live !== this.live) { this.live = live; this.decorations = build(u.view, live); }
    }
  }, { decorations: v => v.decorations });
  return [plugin, scrub];
}

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

import { NUM, decimalsOf, fmt, stepFor, findControls } from '../process/controls.js';
export { findControls };

import { rangeInput, paintRange } from './rangeInput.js';
export { rangeInput, paintRange };

/**
 * One control: a slider bound to a code control `c`. With `live` it drives the value in use,
 * else it rewrites the number in the code (found again by id, as positions move while typing).
 */
export function makeControl(c, view, liveSrc) {
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
  return { input, step, name, onInput: f => listeners.push(f), value: () => Number(input.value) };
}

/** The sliders of one line, overlaid on the line's right side. */
class LineControls extends WidgetType {
  constructor(cs, view, live) { super(); this.cs = cs; this.view = view; this.live = live; }
  eq(o) { return o.live === this.live && o.cs.length === this.cs.length && o.cs.every((c, i) => c.id === this.cs[i].id && c.min === this.cs[i].min && c.max === this.cs[i].max); }
  toDOM() {
    const wrap = document.createElement('span');
    wrap.className = 'cm-param';
    for (const c of this.cs) wrap.append(makeControl(c, this.view, this.live).input);
    return wrap;
  }
  ignoreEvent() { return true; }
}

const lineMark = Decoration.line({ class: 'cm-has-param' });
function build(view, live) {
  const byLine = new Map();
  for (const c of findControls(view.state.doc.toString())) {
    const line = view.state.doc.lineAt(c.from);
    if (!byLine.has(line.from)) byLine.set(line.from, { line, cs: [] });
    byLine.get(line.from).cs.push(c);
  }
  const out = [];
  for (const { line, cs } of [...byLine.values()].sort((a, b) => a.line.from - b.line.from)) {
    out.push(lineMark.range(line.from), Decoration.widget({ widget: new LineControls(cs, view, live), side: 1 }).range(line.to));
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
    const next = cs.map(c => `${c.id}:${c.min}:${c.max}`).join('|') + (live ? `#${live.target?.() || 'live'}` : '');
    if (next === sig) {
      // Same controls: only follow values changed in the code (not the one being dragged).
      rows.forEach((r, i) => { if (document.activeElement !== r.ctl.input && !r.live) { r.ctl.input.value = String(cs[i].value); paintRange(r.ctl.input); r.out.textContent = fmt(cs[i].value, r.ctl.step); } });
      return;
    }
    sig = next;
    el.replaceChildren();
    rows = cs.map(c => {
      const ctl = makeControl(c, editor.view, live);
      const out = document.createElement('span'); out.className = 'wb-ctl-value'; out.textContent = fmt(ctl.value(), ctl.step);
      ctl.onInput(v => { out.textContent = fmt(v, ctl.step); });
      const lab = document.createElement('span'); lab.className = 'wb-ctl-label'; lab.textContent = c.kind === 'param' ? c.key : c.name || `line ${editor.view.state.doc.lineAt(c.from).number}`;
      const row = document.createElement('label'); row.className = 'wb-ctl-row'; row.title = ctl.input.title;
      row.append(lab, ctl.input, out);
      el.append(row);
      return { ctl, out, live: ctl.input.classList.contains('live') };
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

/**
 * Parameters in code, as controls in the editor (after underscores and Strudel's inline sliders):
 *
 *   params: { amount: [0, 1, 0.5, 'doc'] }    a param declaration gets a slider in the gutter. With a
 *                                            live source (the Sculpt panel) it sets the value in use;
 *                                            otherwise it rewrites the default in the code.
 *   0.4 /* 0..1 *\/                          a number with a range comment gets a slider that
 *                                            rewrites the number (any number, anywhere).
 *   Cmd-drag any number                      scrubs it (Shift: fine).
 *
 * The code stays the truth: sliders that rewrite write plain numbers back into it.
 */
import { ViewPlugin, EditorView, GutterMarker, gutter } from '@codemirror/view';
import { RangeSet } from '@codemirror/state';

const NUM = '-?(?:\\d+\\.?\\d*|\\.\\d+)';
const PARAM_RE = new RegExp(`(^|[\\s{,])([A-Za-z_$][\\w$]*)\\s*:\\s*\\[\\s*(${NUM})\\s*,\\s*(${NUM})\\s*,\\s*(${NUM})`, 'g');
const RANGE_RE = new RegExp(`(${NUM})(\\s*/\\*\\s*(${NUM})\\s*\\.\\.\\s*(${NUM})(?:\\s*(?:step|:)\\s*(${NUM}))?\\s*\\*/)`, 'g');

const decimalsOf = s => (String(s).split('.')[1] || '').length;
const fmt = (v, step) => { const d = Math.min(6, Math.max(decimalsOf(step), 0)); return String(+v.toFixed(d)); };
const stepFor = (min, max) => { const r = Math.abs(max - min) || 1; const e = Math.floor(Math.log10(r)) - 2; return 10 ** e; };

/** Where the params block(s) are: `params: {` … matching `}`. */
function paramBlocks(text) {
  const out = [];
  const re = /\bparams\s*:\s*\{/g;
  let m;
  while ((m = re.exec(text))) {
    let depth = 0, i = m.index + m[0].length - 1;
    for (; i < text.length; i++) { if (text[i] === '{') depth++; else if (text[i] === '}' && --depth === 0) break; }
    out.push([m.index + m[0].length, i]);
  }
  return out;
}

/** Every control in the text: { kind, id, from, to (the number to rewrite), at (widget pos), min, max, value, key }. */
export function findControls(text) {
  const out = [];
  for (const [a, b] of paramBlocks(text)) {
    const body = text.slice(a, b);
    PARAM_RE.lastIndex = 0;
    let m;
    while ((m = PARAM_RE.exec(body))) {
      const key = m[2], min = Number(m[3]), max = Number(m[4]), value = Number(m[5]);
      const vFrom = a + m.index + m[0].length - m[5].length;
      // The widget sits after the declaration's closing bracket.
      const close = text.indexOf(']', vFrom);
      let at = close < 0 ? vFrom + m[5].length : close + 1;
      if (text[at] === ',') at++;
      out.push({ kind: 'param', id: `p:${key}`, key, min, max, value, from: vFrom, to: vFrom + m[5].length, at });
    }
  }
  RANGE_RE.lastIndex = 0;
  let m, n = 0;
  while ((m = RANGE_RE.exec(text))) {
    const min = Number(m[3]), max = Number(m[4]);
    if (!(max > min)) continue;
    out.push({ kind: 'range', id: `r:${n++}`, min, max, step: m[5] ? Number(m[5]) : null, value: Number(m[1]), from: m.index, to: m.index + m[1].length, at: m.index });
  }
  return out;
}

/** The shared slider look (code, canvas popovers): the filled part follows the value. */
export function rangeInput({ min, max, step, value, title = '' }) {
  const input = document.createElement('input');
  input.type = 'range';
  input.className = 'wb-range';
  Object.assign(input, { min, max, step });
  input.value = String(value);
  input.title = title;
  paintRange(input);
  input.addEventListener('input', () => paintRange(input));
  return input;
}
export function paintRange(input) {
  const min = Number(input.min), max = Number(input.max);
  input.style.setProperty('--p', `${((Number(input.value) - min) / ((max - min) || 1)) * 100}%`);
}

/** The controls on one line, in the gutter: [slider] opacity: [0, 1, 1…]. */
class LineControls extends GutterMarker {
  constructor(cs, view, live) { super(); this.cs = cs; this.view = view; this.live = live; }
  eq(o) { return o.live === this.live && o.cs.length === this.cs.length && o.cs.every((c, i) => c.id === this.cs[i].id && c.min === this.cs[i].min && c.max === this.cs[i].max); }
  toDOM() {
    const wrap = document.createElement('span');
    wrap.className = 'cm-param';
    for (const c of this.cs) wrap.append(this.control(c));
    return wrap;
  }
  control(c) {
    const step = c.step || stepFor(c.min, c.max);
    const target = this.live && c.kind === 'param' ? this.live.target?.() : null;
    const live = this.live && c.kind === 'param' && !(this.live.target && !target) ? this.live : null;
    const liveVal = live ? live.get(c.key) : undefined;
    const name = c.kind === 'param' ? c.key : 'value';
    const tip = v => (live ? `${name} = ${fmt(v, step)} on ${target || 'the tool in use'} (the code keeps the default)` : `${name} = ${fmt(v, step)} (${c.min}…${c.max})`);
    const input = rangeInput({ min: c.min, max: c.max, step, value: liveVal ?? c.value });
    input.title = tip(Number(input.value));
    if (live) input.classList.add('live');
    input.addEventListener('input', () => {
      const v = Number(input.value);
      input.title = tip(v);
      if (live && live.set(c.key, v) !== false) return;
      // Rewrite the number in the code: find this control again (positions move as the text changes).
      const cur = findControls(this.view.state.doc.toString()).find(x => x.id === c.id);
      if (cur) this.view.dispatch({ changes: { from: cur.from, to: cur.to, insert: fmt(v, step) } });
    });
    for (const ev of ['mousedown', 'pointerdown', 'keydown', 'click']) input.addEventListener(ev, e => e.stopPropagation());
    return input;
  }
}

function build(view, live) {
  const byLine = new Map();
  for (const c of findControls(view.state.doc.toString())) {
    const line = view.state.doc.lineAt(c.from).from;
    if (!byLine.has(line)) byLine.set(line, []);
    byLine.get(line).push(c);
  }
  return RangeSet.of([...byLine].sort((a, b) => a[0] - b[0]).map(([at, cs]) => new LineControls(cs, view, live).range(at)));
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
 * The extension. `live` (optional): { get(key), set(key, value) } — param sliders then drive the
 * values in use instead of rewriting defaults.
 */
export function codeParams(getLive = () => null) {
  const plugin = ViewPlugin.fromClass(class {
    constructor(view) { this.live = getLive(); this.markers = build(view, this.live); }
    update(u) {
      const live = getLive();
      if (u.docChanged || live !== this.live) { this.live = live; this.markers = build(u.view, live); }
    }
  });
  return [plugin, gutter({ class: 'cm-param-gutter', markers: v => v.plugin(plugin)?.markers || RangeSet.empty }), scrub];
}

/**
 * A colour dot before every colour written in the code (#fa0, #e63946, rgb(…), hsl(…), 0xe63946): click it for the
 * studio's picker. Colours that already have a control (a `/* color *\/` or `/* palette *\/` comment) keep that one.
 */
import { ViewPlugin, Decoration, WidgetType } from '@codemirror/view';
import { openPicker, parseColor, formatColor } from './colorPicker.js';

const RE = /(?<![\w#&])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w])|\b(?:rgb|hsl)a?\([^()\n]{5,48}\)|(?<![\w.])0x[0-9a-fA-F]{6}(?![\w])/g;

/** The colours in the text: [{ from, to, text, fmt: 'hex' | 'fn' | 'num' }]. */
export function findColors(text) {
  const out = [];
  for (const m of text.matchAll(RE)) {
    const from = m.index, to = from + m[0].length;
    const rest = text.slice(to, text.indexOf('\n', to) < 0 ? text.length : text.indexOf('\n', to));
    if (/^['"]?\s*\/\*\s*colou?r\b/.test(rest) || /^[^\]\n]*\]\s*\/\*\s*palette\b/.test(rest)) continue;   // it has a control already
    out.push({ from, to, text: m[0], fmt: m[0][0] === '#' ? 'hex' : m[0].startsWith('0x') ? 'num' : 'fn' });
  }
  return out;
}

/** Any CSS colour as '#rrggbb' (through a canvas, so names and hsl() work too). */
function toHex(css) {
  try {
    const ctx = document.createElement('canvas').getContext('2d');
    ctx.fillStyle = '#000'; ctx.fillStyle = css;
    const v = ctx.fillStyle;
    return v[0] === '#' ? v : parseColor(v).hex;
  } catch { return parseColor(css).hex; }
}
const cssOf = c => (c.fmt === 'num' ? `#${c.text.slice(2)}` : c.text);

class Dot extends WidgetType {
  constructor(c, view) { super(); this.c = c; this.view = view; }
  eq(o) { return o.c.text === this.c.text && o.c.from === this.c.from; }
  toDOM() {
    const wrap = document.createElement('span'); wrap.className = 'cm-param cm-colordot';
    const dot = document.createElement('button'); dot.type = 'button'; dot.className = 'wb-color-input'; dot.title = 'Change the colour';
    dot.style.background = cssOf(this.c);
    wrap._c = this.c;
    dot.addEventListener('click', () => {
      const start = toHex(cssOf(wrap._c)).toLowerCase();
      openPicker(dot, { hex: start, alpha: parseColor(toHex(cssOf(wrap._c))).alpha }, col => {
        if (col.hex.toLowerCase() === start && col.alpha >= 0.999) return;   // (opening it changes nothing)
        const c = wrap._c, text = c.fmt === 'num' ? `0x${col.hex.slice(1)}` : formatColor(col.hex, col.alpha);
        dot.style.background = text.startsWith('0x') ? `#${text.slice(2)}` : text;
        this.view.dispatch({ changes: { from: c.from, to: c.to, insert: text } });
      }, null);
    });
    for (const ev of ['mousedown', 'pointerdown', 'keydown', 'click']) dot.addEventListener(ev, e => e.stopPropagation());
    wrap.append(dot);
    return wrap;
  }
  // The same dot after an edit: keep it (an open picker stays), and learn where its colour is now.
  updateDOM(dom) { dom._c = this.c; dom.firstChild.style.background = cssOf(this.c); return true; }
  ignoreEvent() { return true; }
}

const build = view => Decoration.set(findColors(view.state.doc.toString()).map(c => Decoration.widget({ widget: new Dot(c, view), side: -1 }).range(c.from)), true);

export const colorDots = () => ViewPlugin.fromClass(class {
  constructor(view) { this.decorations = build(view); }
  update(u) { if (u.docChanged) this.decorations = build(u.view); }
}, { decorations: v => v.decorations });

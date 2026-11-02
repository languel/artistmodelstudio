/**
 * Code as an exported page shows it: coloured, one line at a time, with the controls of the code (a `let fps = 8 /* 3..24 *\/` is a slider)
 * marked where they sit, so the page can put a widget before the value and keep the value's text in step with it.
 * Pure (no DOM): playerPage.js builds the lines, playerRuntime.js makes the widgets.
 */
import { findControls, stepFor } from '../process/controls.js';

const KEYWORDS = new Set('break case catch class const continue debugger default delete do else export extends finally for from function if import in instanceof let new of return static super switch this throw try typeof var void while with yield async await true false null undefined'.split(' '));
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The classes of the characters of one line: 'c' comment, 's' string, 'n' number, 'k' keyword, 'f' a call, '' plain. `state` says whether the line starts inside a block comment or a template. */
function classify(text, state) {
  const cls = new Array(text.length).fill('');
  let i = 0;
  const paint = (a, b, c) => { for (let k = a; k < b; k++) cls[k] = c; };
  while (i < text.length) {
    if (state.block) { const e = text.indexOf('*/', i); const end = e < 0 ? text.length : e + 2; paint(i, end, 'c'); if (e >= 0) state.block = false; i = end; continue; }
    if (state.tpl) { let j = i; while (j < text.length && text[j] !== '`') j += text[j] === '\\' ? 2 : 1; const end = Math.min(text.length, j + 1); paint(i, end, 's'); if (j < text.length) state.tpl = false; i = end; continue; }
    const ch = text[i], two = text.slice(i, i + 2);
    if (two === '//') { paint(i, text.length, 'c'); break; }
    if (two === '/*') { state.block = true; { const e = text.indexOf('*/', i + 2); if (e >= 0) { paint(i, e + 2, 'c'); state.block = false; i = e + 2; } else { paint(i, text.length, 'c'); i = text.length; } } continue; }
    if (ch === '`') { state.tpl = true; paint(i, i + 1, 's'); i++; continue; }
    if (ch === '"' || ch === "'") { let j = i + 1; while (j < text.length && text[j] !== ch) j += text[j] === '\\' ? 2 : 1; const end = Math.min(text.length, j + 1); paint(i, end, 's'); i = end; continue; }
    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(text[i + 1] || ''))) { let j = i + 1; while (j < text.length && /[0-9a-fA-FxX._]/.test(text[j])) j++; paint(i, j, 'n'); i = j; continue; }
    if (/[A-Za-z_$]/.test(ch)) {
      let j = i + 1; while (j < text.length && /[\w$]/.test(text[j])) j++;
      const w = text.slice(i, j);
      paint(i, j, KEYWORDS.has(w) ? 'k' : text[j] === '(' ? 'f' : ''); i = j; continue;
    }
    i++;
  }
  return cls;
}

/**
 * One HTML string for each line of `text`. A control (from findControls) that sits on a line gets, before its value, an empty `<i class="w">`
 * carrying what the page needs to make the widget, and its value is wrapped in `<span class="cv">` so it can follow the widget.
 * Returns { lines: [html], controls: [{ name, kind, min, max, step, value, options, q }] } (the controls that can be made live).
 */
export function highlightCode(text, { controls = true } = {}) {
  const found = controls ? findControls(text).filter(c => c.live && c.name) : [];
  const lines = text.split('\n'), state = { block: false, tpl: false };
  const out = []; let at = 0;
  for (const line of lines) {
    const cls = classify(line, state), start = at;
    const here = found.filter(c => c.from >= start && c.to <= start + line.length);
    let html = '', k = 0;
    while (k < line.length) {
      const c = here.find(x => x.from - start === k);
      if (c) {
        const attrs = `data-name="${esc(c.name)}" data-kind="${c.kind}"`;
        html += `<i class="w" ${attrs}></i><span class="cv" data-name="${esc(c.name)}">${esc(line.slice(k, c.to - start))}</span>`;
        k = c.to - start; continue;
      }
      let j = k + 1; while (j < line.length && cls[j] === cls[k] && !here.some(x => x.from - start === j)) j++;
      const seg = esc(line.slice(k, j));
      html += cls[k] ? `<span class="${cls[k]}">${seg}</span>` : seg;
      k = j;
    }
    out.push(html || ' ');
    at += line.length + 1;
  }
  return {
    lines: out,
    controls: found.map(c => ({ name: c.name, kind: c.kind, min: c.min, max: c.max, step: c.step ?? (c.kind === 'range' ? stepFor(c.min, c.max) : undefined), value: c.value, options: c.options, q: c.q || '' }))
  };
}

export const CODE_CSS = `
.ln .k{color:#c678dd}.ln .s{color:#98c379}.ln .n{color:#d19a66}.ln .c{color:#7f848e;font-style:italic}.ln .f{color:#61afef}
.ln i.w{display:inline-block;flex:none;width:auto;padding:0;text-align:left;vertical-align:middle;margin:0 .4em 0 .1em;line-height:1;user-select:none}
.ln .cv{color:#e0a030}
.ln .w input[type=range]{width:112px;height:16px;vertical-align:middle;accent-color:#e0a030;margin:0}
.ln i.w{border-radius:6px;transition:box-shadow .15s,background .15s}.ln i.w.live{box-shadow:0 0 0 2px #e0a030,0 0 12px 2px rgba(224,160,48,.65);background:rgba(224,160,48,.18)}
.ln .w input[type=checkbox]{vertical-align:middle;accent-color:#e0a030;margin:0}
.ln .w input[type=color]{width:22px;height:16px;padding:0;border:1px solid #555;border-radius:3px;background:none;vertical-align:middle}
.ln .w select{font:inherit;font-size:11px;background:#222;color:#e6e4de;border:1px solid #555;border-radius:3px;vertical-align:middle}
`;

/**
 * Controls in code: where a score's numbers can be played. Param declarations
 * (`key: [min, max, default, 'doc']` in a params block) and numbers with a range comment
 * (`0.4 /* 0..1 *\/`). Pure (no DOM): the code editor draws sliders from these, and so does
 * an exported page.
 */
export const NUM = '-?(?:\\d+\\.?\\d*|\\.\\d+)';
const PARAM_RE = new RegExp(`(^|[\\s{,])([A-Za-z_$][\\w$]*)\\s*:\\s*\\[\\s*(${NUM})\\s*,\\s*(${NUM})\\s*,\\s*(${NUM})`, 'g');
const RANGE_RE = new RegExp(`(${NUM})(\\s*/\\*\\s*(${NUM})\\s*\\.\\.\\s*(${NUM})(?:\\s*(?:step|:)\\s*(${NUM}))?\\s*\\*/)`, 'g');

export const decimalsOf = s => (String(s).split('.')[1] || '').length;
export const fmt = (v, step) => { const d = Math.min(6, Math.max(decimalsOf(step), 0)); return String(+v.toFixed(d)); };
export const stepFor = (min, max) => { const r = Math.abs(max - min) || 1; const e = Math.floor(Math.log10(r)) - 2; return 10 ** e; };

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
    // Named by what it is assigned to (const turn = 9 /* 0..30 */), if anything.
    const before = text.slice(text.lastIndexOf('\n', m.index) + 1, m.index);
    const name = (before.match(/([A-Za-z_$][\w$]*)\s*[:=]\s*$/) || [])[1];
    out.push({ kind: 'range', id: `r:${n++}`, ...(name ? { name } : {}), min, max, step: m[5] ? Number(m[5]) : null, value: Number(m[1]), from: m.index, to: m.index + m[1].length, at: m.index });
  }
  return out;
}

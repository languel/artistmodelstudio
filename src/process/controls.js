/**
 * Controls in code: where a score's numbers can be played. Param declarations
 * (`key: [min, max, default, 'doc']` in a params block) and numbers with a range comment
 * (`0.4 /* 0..1 *\/`). Pure (no DOM): the code editor draws sliders from these, and so does
 * an exported page.
 */
export const NUM = '-?(?:\\d+\\.?\\d*|\\.\\d+)';
const PARAM_RE = new RegExp(`(^|[\\s{,])([A-Za-z_$][\\w$]*)\\s*:\\s*\\[\\s*(${NUM})\\s*,\\s*(${NUM})\\s*,\\s*(${NUM})`, 'g');
const DOTS = '(?:\\.{2,3}|…)';   // 0..5, 0...5 or 0…5 (an editor turns .. and ... into other marks)
const RANGE_RE = new RegExp(`(${NUM})(\\s*/\\*\\s*(${NUM})\\s*${DOTS}\\s*(${NUM})(?:\\s*(?:step\\s*:?|:)\\s*(${NUM}))?\\s*\\*/)`, 'g');

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

const IDENT = '[A-Za-z_$][\\w$]*';
const TOGGLE_RE = /\b(true|false)(\s*\/\*\s*(?:toggle|on\/off|bool(?:ean)?)\s*\*\/)/g;
const COLOR_RE = /(['"])([^'"\n]+)\1(\s*\/\*\s*colou?r\s*\*\/)|\b(0x[0-9a-fA-F]{3,8})\b(\s*\/\*\s*colou?r\s*\*\/)|(?<![\w.])(\d{1,9})(\s*\/\*\s*colou?r\s*\*\/)/g;   // any CSS colour in quotes (#fa0, red, rgb(…), hsl(…)), or a number: 0xrrggbb (or the same in decimal, as a minifier writes it)
const PALETTE_RE = /\[([^\[\]\n]*)\](\s*\/\*\s*palette\s*\*\/)/g;   // ['#e63946', 'steelblue', 0xf1faee] /* palette */
const PALETTE_ITEM_RE = /(['"])([^'"\n]+)\1|\b0x[0-9a-fA-F]{3,8}\b/g;
const SELECT_RE = /(['"])([^'"\n]*)\1(\s*\/\*\s*([^*\n|]+(?:\|[^*\n|]+)+?)\s*\*\/)/g;
// underscores' form: // @param name = value (min..max step:s) | (color) | (boolean) | (a|b|c)
const PARAM_LINE_RE = new RegExp(`^([ \\t]*//[ \\t]*@param[ \\t]+)(${IDENT})([ \\t]*=[ \\t]*)(.*?)[ \\t]*\\(([^)\\n]*)\\)[ \\t]*$`, 'gm');

// A control declared at the start of a line (const name = <literal> followed by its comment), with nothing after it: it can be made live.
function declOf(text, from, end) {
  const ls = text.lastIndexOf('\n', from - 1) + 1;
  const m = new RegExp(`^(const|let|var)\\s+(${IDENT})\\s*=\\s*$`).exec(text.slice(ls, from));
  if (!m) return null;
  const le = text.indexOf('\n', end);
  if (!/^\s*(;\s*)?(\/\/.*)?$/.test(text.slice(end, le < 0 ? text.length : le))) return null;
  return { kw: m[1], name: m[2], kwFrom: ls, kwTo: ls + m[1].length, end };
}

/** Every control in the text: { kind: param|range|toggle|select|color, id, from, to (the value to rewrite), at (widget pos), value, name, live, … }. */
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
    const decl = declOf(text, m.index, m.index + m[0].length);
    out.push({ kind: 'range', id: `r:${n++}`, ...(name ? { name } : {}), min, max, step: m[5] ? Number(m[5]) : null, value: Number(m[1]), from: m.index, to: m.index + m[1].length, at: m.index, ...(decl ? { decl, live: true } : {}) });
  }
  const named = (id, kind, from, to, end, extra) => {
    const decl = declOf(text, from, end);
    out.push({ kind, id, ...(decl ? { name: decl.name, decl, live: true } : {}), from, to, at: from, ...extra });
  };
  n = 0;
  for (const t of text.matchAll(TOGGLE_RE)) named(`t:${n++}`, 'toggle', t.index, t.index + t[1].length, t.index + t[0].length, { value: t[1] === 'true' });
  n = 0;
  for (const t of text.matchAll(COLOR_RE)) {
    if (t[4] || t[6]) { const v = t[4] ? parseInt(t[4], 16) : Number(t[6]), w = t[4] || t[6]; named(`c:${n++}`, 'color', t.index, t.index + w.length, t.index + t[0].length, { value: v, css: `#${(t[4] ? t[4].slice(2).padStart(6, '0').slice(0, 6) : v.toString(16).padStart(6, '0').slice(-6))}`, num: true }); }
    else named(`c:${n++}`, 'color', t.index, t.index + t[2].length + 2, t.index + t[0].length, { value: t[2], css: t[2], q: t[1] });
  }
  n = 0;
  for (const t of text.matchAll(PALETTE_RE)) {
    const items = [...t[1].matchAll(PALETTE_ITEM_RE)].map(m => (m[0].startsWith('0x') ? { num: true, css: `#${m[0].slice(2).padStart(6, '0').slice(0, 6)}`, value: parseInt(m[0], 16) } : { q: m[1], css: m[2], value: m[2] }));
    if (!items.length) continue;
    named(`k:${n++}`, 'palette', t.index, t.index + t[0].length - t[2].length, t.index + t[0].length, { value: items.map(i => i.value), css: items.map(i => i.css), items });
  }
  n = 0;
  for (const t of text.matchAll(SELECT_RE)) {
    const options = t[4].split('|').map(x => x.trim()).filter(Boolean);
    if (options.length < 2 || /(?:\.{2,3}|…)\s*-?\d/.test(t[4])) continue;
    named(`s:${n++}`, 'select', t.index, t.index + t[2].length + 2, t.index + t[0].length, { value: t[2], q: t[1], options });
  }
  for (const t of text.matchAll(PARAM_LINE_RE)) {
    const [, head, name, eq, raw, spec] = t;
    const from = t.index + head.length + name.length + eq.length, to = from + raw.length, base = { id: `a:${name}`, name, from, to, at: from, live: true, line: true };
    const sp = spec.trim(), r = new RegExp(`^(${NUM})\\s*${DOTS}\\s*(${NUM})(?:\\s+step\\s*:\\s*(${NUM}))?$`).exec(sp), q = /^['"]/.test(raw) ? raw[0] : '';
    const bare = q ? raw.slice(1, -1) : raw;
    if (r && Number.isFinite(Number(raw))) out.push({ ...base, kind: 'range', min: Number(r[1]), max: Number(r[2]), step: r[3] ? Number(r[3]) : null, value: Number(raw) });
    else if (/^colou?r$/i.test(sp)) out.push({ ...base, kind: 'color', value: bare, q });
    else if (/^bool(ean)?$/i.test(sp)) out.push({ ...base, kind: 'toggle', value: /^(true|yes|on|1)$/i.test(bare) });
    else if (sp.includes('|')) out.push({ ...base, kind: 'select', value: bare, q, options: sp.split('|').map(x => x.trim()).filter(Boolean) });
  }
  return out;
}

/** The text a control's value is written as. */
const itemLiteral = (f, v) => (f.num ? `0x${String(v).replace('#', '')}` : `${f.q || "'"}${v}${f.q || "'"}`);
export const literalOf = (c, v) => (c.kind === 'palette' ? `[${v.map((x, i) => itemLiteral(c.items[i] || c.items[0], x)).join(', ')}]` : c.kind === 'toggle' ? String(Boolean(v)) : c.kind === 'range' ? String(v) : c.num ? `0x${String(v).replace('#', '')}` : `${c.q || ''}${v}${c.q || ''}`);

/** The values of the controls that can change without starting the sketch again: { name: value }. */
export function liveValues(text) {
  const o = {};
  for (const c of findControls(text)) if (c.live && c.name) o[c.name] = c.value;
  return o;
}

/**
 * A sketch's code for a frame: each live control declared at the top (const n = 6 with a range comment) is made
 * a `let` with a setter registered (`__ctl`), so the studio can change it while the sketch runs. `sig` is the
 * code with the live values blanked: the sketch starts again only when that changes.
 */
export function instrument(text) {
  const cs = findControls(text).filter(c => c.live && c.name);
  let sig = text, code = text;
  for (const c of [...cs].sort((a, b) => b.from - a.from)) sig = sig.slice(0, c.from) + '\0' + sig.slice(c.to);
  for (const c of [...cs].filter(c => c.decl).sort((a, b) => b.from - a.from)) {
    const d = c.decl;
    // (a palette is changed where it stands, so what the sketch already holds of it stays right)
    code = code.slice(0, d.end) + `; __ctl(${JSON.stringify(c.name)}, v => { ${c.kind === 'palette' ? `${c.name}.splice(0, ${c.name}.length, ...v)` : `${c.name} = v`}; });` + code.slice(d.end);
    code = code.slice(0, d.kwFrom) + 'let' + code.slice(d.kwTo);
  }
  return { code, sig, values: Object.fromEntries(cs.map(c => [c.name, c.value])) };
}

/**
 * The text with the control `name` set to `value`: what a sketch's panel sends (a number, a boolean, a string, an array of colours;
 * a colour written as a number comes as a number) written back as the literal in the code.
 */
export function rewriteControl(text, name, value) {
  const c = findControls(text).find(x => x.live && x.name === name);
  if (!c) return text;
  const hex = n => (typeof n === 'number' ? `#${n.toString(16).padStart(6, '0').slice(-6)}` : n);
  let v = value;
  if (c.kind === 'range') v = fmt(Number(value), c.step || stepFor(c.min, c.max));
  else if (c.kind === 'palette') v = (Array.isArray(value) ? value : []).map(hex);
  else if (c.kind === 'color') v = hex(value);
  return text.slice(0, c.from) + literalOf(c, v) + text.slice(c.to);
}

/**
 * `// @panel open | hidden | off` in a sketch: how its control panel starts. open: shown (on its board in the studio, in Perform,
 * on an exported page); hidden: only the gear, which comes up when the pointer is near; off: no panel. Without it a board in the
 * studio has no panel, Perform starts hidden and an exported page starts open. Returns 'open' | 'hidden' | 'off' | null.
 */
export function panelOf(text) {
  const m = /^[ \t]*\/\/[ \t]*@panel[ \t]+(open|hidden|off)\b/m.exec(String(text || ''));
  return m ? m[1] : null;
}

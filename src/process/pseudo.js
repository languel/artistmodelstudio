/**
 * Pseudocode as a paper sets it: numbered lines, indentation for blocks, bold keywords, ← for assignment,
 * real symbols (≠ ≤ ≥ → …), comments set apart, and $…$ as LaTeX (KaTeX) anywhere in a line.
 *
 *   Algorithm 1: Training
 *   repeat
 *     $x_0 \sim q(x_0)$                 # a picture from the data
 *     $t \leftarrow$ a random step
 *     $\hat\epsilon \leftarrow \epsilon_\theta(x_t, t)$
 *   until converged
 *
 * Written as plain text it stays readable: `<-` is ←, `!=` is ≠, `<=` is ≤, `>=` is ≥, `->` is →.
 * A `#` or `//` starts a comment. Indentation is two spaces per level.
 */
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const KEYWORDS = /\b(for each|for all|for|while|repeat|until|else if|if|else|then|return|function|procedure|input|output|require|ensure|end)\b/g;
const SYMBOLS = [[/<->/g, '↔'], [/<-/g, '←'], [/->/g, '→'], [/!=/g, '≠'], [/<=/g, '≤'], [/>=/g, '≥'], [/\.\.\./g, '…']];

/** One run of plain text (no math): escaped, keywords bold, operators as symbols. */
function plain(text, loop) {
  let s = text;
  for (const [re, to] of SYMBOLS) s = s.replace(re, to);
  s = esc(s).replace(KEYWORDS, '<b class="kw">$1</b>');
  if (loop) s = s.replace(/(\s)(do)(?=\s|:|$)/g, '$1<b class="kw">$2</b>');
  return s.replace(/←/g, '<span class="arrow">←</span>');
}

/** Split a line into its code and its trailing comment, ignoring # and // inside $…$. */
function splitComment(line) {
  let inMath = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '\\') { i++; continue; }
    if (c === '$') inMath = !inMath;
    else if (!inMath && (c === '#' || (c === '/' && line[i + 1] === '/')) && (i === 0 || /\s/.test(line[i - 1]))) return [line.slice(0, i), line.slice(i).replace(/^(#|\/\/)\s*/, '')];
  }
  return [line, ''];
}

/** A line's HTML: text runs and $…$ math in order. math(expr, displayMode) renders LaTeX. */
function inline(code, math, loop) {
  const out = [];
  let rest = code;
  for (let m; (m = /(?<!\\)\$([^$]+?)\$/.exec(rest));) {
    out.push(plain(rest.slice(0, m.index), loop), math(m[1], false));
    rest = rest.slice(m.index + m[0].length);
  }
  out.push(plain(rest, loop));
  return out.join('');
}

export function renderPseudo(source, math = e => esc(e)) {
  const lines = String(source ?? '').replace(/\t/g, '  ').replace(/\s+$/, '').split('\n');
  let caption = '';
  const head = /^\s*Algorithm\b\s*(\d*)\s*[:.]?\s*(.*)$/i.exec(lines[0] || '');
  if (head) { lines.shift(); caption = `<div class="pseudo-cap"><b>Algorithm${head[1] ? ` ${head[1]}` : ''}</b>${head[2] ? ` ${inline(head[2], math, false)}` : ''}</div>`; }
  const rows = lines.map(raw => {
    if (!raw.trim()) return '<li class="gap"></li>';
    const depth = Math.floor((raw.length - raw.trimStart().length) / 2);
    const [code, comment] = splitComment(raw.trim());
    const loop = /^(for|while)\b/.test(code);
    return `<li style="--d:${depth}"><span class="code">${inline(code.trimEnd(), math, loop)}</span>${comment ? `<span class="cm">${inline(comment, math, false)}</span>` : ''}</li>`;
  });
  return `<div class="pseudo">${caption}<ol>${rows.join('')}</ol></div>`;
}

/** Shared by the studio and exported pages; `scope` is the selector prefix (e.g. '.wb-md' or '.md'). */
export const pseudoCss = (scope, { fg = 'inherit', muted = 'rgba(127,127,127,0.9)', line = 'rgba(127,127,127,0.45)' } = {}) => `
${scope} .pseudo { margin: 0 0 1em; border-top: 2px solid ${line}; border-bottom: 2px solid ${line}; padding: 4px 0; font: 1em/1.55 'Latin Modern Roman', 'Computer Modern', KaTeX_Main, 'Times New Roman', Georgia, serif; color: ${fg}; }
${scope} .pseudo-cap { padding: 2px 10px 4px; border-bottom: 1px solid ${line}; margin-bottom: 4px; }
${scope} .pseudo ol { list-style: none; margin: 0; padding: 0; counter-reset: ln; }
${scope} .pseudo li { counter-increment: ln; display: flex; gap: 12px; align-items: baseline; padding: 0 10px 0 calc(2.2em + var(--d, 0) * 1.6em); position: relative; min-height: 1.55em; }
${scope} .pseudo li::before { content: counter(ln); position: absolute; left: 10px; width: 1.4em; text-align: right; color: ${muted}; font-size: 0.8em; }
${scope} .pseudo li.gap { counter-increment: none; min-height: 0.5em; } ${scope} .pseudo li.gap::before { content: none; }
${scope} .pseudo .kw { font-weight: 700; font-variant: small-caps; letter-spacing: 0.02em; }
${scope} .pseudo .arrow { padding: 0 0.1em; }
${scope} .pseudo .cm { margin-left: auto; color: ${muted}; font-style: italic; white-space: nowrap; }
${scope} .pseudo .cm::before { content: '▹ '; }
`;

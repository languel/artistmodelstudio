/**
 * The console: run studio tools (the MCP tools agents use) by hand, from the Assistant with a `!`.
 *
 *   !board list                          ams_board { action: 'list' }
 *   !add role=point points=[[10,20]] color=#c8664f
 *   !get format=p5code board="0.1 · Light into the eye"
 *   !snap {"ids": ["…"], "mode": "points"}
 *   !help            the tools          !help board   one tool's parameters
 *
 * The first word is the tool (ams_ may be left out); a bare word after it is the action; key=value
 * pairs are read as JSON where they can be (numbers, true, [arrays], {objects}), else as text.
 */

/** Split a command line into words, keeping "quoted text" and [brackets] / {braces} whole. */
export function words(line) {
  const out = [];
  let cur = '', depth = 0, quote = null;
  for (const ch of String(line)) {
    if (quote) { cur += ch; if (ch === quote) quote = null; continue; }
    if (ch === '"' || ch === "'") { quote = ch; cur += ch; continue; }
    if (ch === '[' || ch === '{') depth++;
    if (ch === ']' || ch === '}') depth--;
    if (/\s/.test(ch) && depth <= 0) { if (cur) out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

const value = raw => {
  const s = /^(["']).*\1$/s.test(raw) ? raw.slice(1, -1) : raw;
  if (s !== raw) return s;   // quoted: text
  try { return JSON.parse(s); } catch { return s; }
};

/** `!tool …` → { tool, args } (or { help: name | true }). */
export function parseCommand(line) {
  const text = String(line).trim().replace(/^!/, '').trim();
  if (!text || /^help\b/.test(text)) return { help: text.split(/\s+/)[1] || true };
  const [head, ...rest] = words(text);
  const tool = head.startsWith('ams_') ? head : `ams_${head}`;
  const tail = text.slice(text.indexOf(head) + head.length).trim();
  if (tail.startsWith('{')) return { tool, args: JSON.parse(tail) };
  const args = {};
  for (const w of rest) {
    const eq = w.indexOf('=');
    if (eq > 0 && /^[\w.-]+$/.test(w.slice(0, eq))) args[w.slice(0, eq)] = value(w.slice(eq + 1));
    else if (!('action' in args)) args.action = value(w);
    else throw new Error(`What is “${w}”? Use key=value.`);
  }
  return { tool, args };
}

/** A result, readable in the chat: images shortened, long text cut. */
export function brief(result, max = 4000) {
  const text = JSON.stringify(result ?? null, (k, v) => (typeof v === 'string' && v.startsWith('data:') ? `<${v.slice(5, v.indexOf(';'))}, ${Math.round(v.length / 1024)} KB>` : v), 2);
  return text.length > max ? `${text.slice(0, max)}\n… (${text.length - max} more characters)` : text;
}

/** Help: every tool with its parameters, or one tool in full. */
export function help(tools, name = true) {
  if (name === true) return tools.map(t => `!${t.name.replace(/^ams_/, '')}  ${Object.keys(t.inputSchema?.properties || {}).join(' ')}`).join('\n');
  const t = tools.find(x => x.name === name || x.name === `ams_${name}`);
  if (!t) return `No tool “${name}”.`;
  const props = Object.entries(t.inputSchema?.properties || {}).map(([k, v]) => `  ${k}${(t.inputSchema.required || []).includes(k) ? ' (required)' : ''}: ${v.description || v.type || ''}${v.enum ? ` [${v.enum.join(' | ')}]` : ''}`);
  return `${t.name}\n${t.description}\n${props.join('\n')}`;
}

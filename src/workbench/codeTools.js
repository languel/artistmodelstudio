/**
 * Format and minimize code (the editor's Alt+Shift+F and Alt+Shift+M): Prettier and Terser, loaded the first time
 * they are used. Both keep the comments that make controls (`0.4 /* 0..1 *\/`, `// @param …`, toggle, color, palette),
 * so a formatted or minimized sketch still has its sliders.
 */
const PARSER = { ams: 'babel', p5: 'babel', three: 'babel', markdown: 'markdown', html: 'html' };

/** A comment that is a control: kept by the minimizer. */
export const isControlComment = text => /^\s*(?:-?[\d.]+\s*(?:\.{2,3}|…)|toggle|on\/off|bool(?:ean)?|colou?r|palette|[^*\n|]+\|[^*\n]+\s*$|@param)/.test(text);

const errorOf = e => ({ message: String(e?.message || e).split('\n')[0].replace(/\s*\(\d+:\d+\)\s*$/, ''), line: e?.loc?.start?.line || e?.loc?.line || Number(/\((\d+):\d+\)/.exec(e?.message || '')?.[1]) || 0 });

/**
 * The text formatted. `range` ({ from, to }, offsets): only that part is formatted (Prettier widens it to whole statements).
 * Resolves { text } or { error: { message, line } }.
 */
export async function formatSource(text, language, range = null) {
  const parser = PARSER[language];
  if (!parser) return { error: { message: 'Nothing to format here.', line: 0 } };
  try {
    const [{ format }, plugins] = await Promise.all([import('prettier/standalone'), loadPlugins(parser)]);
    // Studio code is written without semicolons; keep whichever the text mostly uses.
    const lines = text.split('\n').filter(l => l.trim() && !/^\s*(\/\/|\/\*|\*)/.test(l));
    const semi = lines.filter(l => /;\s*(\/\/.*)?$/.test(l)).length * 2 >= lines.length;
    const out = await format(text, { parser, plugins, semi, singleQuote: true, tabWidth: 2, printWidth: 90, embeddedLanguageFormatting: 'off', ...(range ? { rangeStart: range.from, rangeEnd: range.to } : {}) });
    return { text: out };
  } catch (e) { return { error: errorOf(e) }; }
}
async function loadPlugins(parser) {
  if (parser === 'markdown') return [await import('prettier/plugins/markdown')];
  if (parser === 'html') return [await import('prettier/plugins/html'), await import('prettier/plugins/babel'), await import('prettier/plugins/estree')];
  return [await import('prettier/plugins/babel'), await import('prettier/plugins/estree')];
}

/** The code with whitespace and comments (but not control comments) removed. Resolves { text } or { error }. */
export async function minifySource(text, language) {
  if (!['ams', 'p5', 'three'].includes(language)) return { error: { message: 'Minimize works on code (studio, p5.js, three.js).', line: 0 } };
  try {
    const { minify } = await import('terser');
    const r = await minify(text, { module: /^\s*(import|export)\b/m.test(text), compress: false, mangle: false, parse: { bare_returns: true }, format: { quote_style: 3, comments: (_, c) => isControlComment(c.value) } });
    // A control stays on a line of its own (that is what lets it change while the sketch runs).
    const own = r.code.replace(/(?<=.)((?:const|let|var) [\w$]+=[^;\n]*?\/\*([^*]*)\*\/;?)/g, (m, decl, c) => (isControlComment(c) ? `\n${decl}\n` : m)).replace(/\n{2,}/g, '\n');
    return { text: own.replace(/;?\s*$/, '\n') };
  } catch (e) { return { error: { message: String(e?.message || e), line: e?.line || 0 } }; }
}

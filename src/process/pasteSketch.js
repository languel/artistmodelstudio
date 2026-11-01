/**
 * What a pasted text is, when it is a sketch from somewhere else: a three.js example's page (an import map and a module script), a CodePen
 * or Codevre file, a snippet that imports three.js from a CDN. Returns { kind: 'three' | 'p5' | 'html', code, note } for a board, or null
 * when the text is not one (the paste goes on as it was). The code is made to run here and anywhere else: CDN imports of three.js become the
 * bare names ('three', 'three/addons/…'), which the studio bundles and every project or import map resolves.
 */
import { cdnThree } from './threeModules.js';

/** Imports of three.js by CDN URL (from '…', import '…', import('…')) written as the bare names. */
export function bareThreeImports(code) {
  return String(code).replace(/(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(['"])(https?:\/\/[^'"\n]+)\2/g, (all, lead, q, url) => {
    const bare = cdnThree(url);
    return bare ? `${lead}${q}${bare}${q}` : all;
  });
}

const scriptsOf = html => [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)].map(m => ({ attrs: m[1], body: m[2] }));
const isCode = s => !/\bsrc\s*=/.test(s.attrs) && !/\btype\s*=\s*["']?(importmap|application\/json|text\/template|text\/html|x-shader)/i.test(s.attrs) && s.body.trim();
const usesThree = c => /\bfrom\s*['"]three(?:\/[^'"]*)?['"]/.test(c) || /\bTHREE\.[A-Z]/.test(c);
const usesP5 = c => /\b(createCanvas|function\s+setup\s*\(|function\s+draw\s*\()/.test(c);

export function sketchFromPaste(text, { addImport = true } = {}) {
  const t = String(text || '').trim();
  if (t.length < 30) return null;
  const page = /<\s*(?:!doctype|html|head|body|script)\b/i.test(t);
  if (page) {
    const scripts = scriptsOf(t);
    const code = scripts.filter(isCode).map(s => s.body.replace(/^\s*\n/, '').trimEnd()).join('\n\n');
    const srcs = scripts.map(s => (/\bsrc\s*=\s*["']([^"']+)/.exec(s.attrs) || [])[1] || '').join(' ');
    const rest = t.replace(/<script\b[\s\S]*?<\/script\s*>/gi, '').replace(/<!--[\s\S]*?-->/g, '').replace(/<!doctype[^>]*>/i, '');
    const markup = /<(style|div|canvas|button|input|p|h[1-6]|span|a|img|select|label)\b/i.test(rest);   // what the page has besides its scripts
    if (code) {
      const bare = bareThreeImports(code);
      if (usesThree(bare) || /three(?:\.min)?\.js|three@/.test(srcs)) {
        const withImport = !addImport || /\bimport\b[^;]*\bTHREE\b/.test(bare) || !/\bTHREE\./.test(bare) ? bare : `import * as THREE from 'three';\n\n${bare}`;
        return { kind: 'three', code: withImport, note: `Took the three.js script of the page${markup ? ' (its styles and markup were left out: a board has no page around the sketch)' : ''}; its import map is not needed here.` };
      }
      if (usesP5(code) || /p5(?:\.min)?\.js|p5@/.test(srcs)) return { kind: 'p5', code, note: `Took the p5.js script of the page${markup ? ' (its styles and markup were left out)' : ''}.` };
    }
    return { kind: 'html', code: t, note: 'Pasted a page as an HTML board.' };
  }
  const bare = bareThreeImports(t);
  if (usesThree(bare) && !/<\w+[^>]*>/.test(bare.slice(0, 200))) {
    const withImport = !addImport || /\bimport\b[^;]*\bTHREE\b/.test(bare) ? bare : `import * as THREE from 'three';\n\n${bare}`;
    return { kind: 'three', code: withImport, note: bare === t ? 'Pasted a three.js sketch.' : 'Pasted a three.js sketch (its CDN imports are the same three.js here, written as three and three/addons).' };
  }
  return null;
}

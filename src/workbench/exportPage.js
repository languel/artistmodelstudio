/**
 * A p5.js or three.js sketch as one HTML page that runs on its own (no studio, no network): the library is inside,
 * the page fills the window, and, if asked, the controls the code declares (sliders, toggles, selects, colours,
 * palettes: see process/controls.js) become a small panel that H shows and hides. For an installation: build in the
 * studio, export, open the file.
 */
import { collectThree, threeLoader } from '../process/threeModules.js';
import { instrument, panelOf } from '../process/controls.js';
import { controlSpecs, panelScript } from './controlsPanel.js';
export { controlSpecs };

const json = v => JSON.stringify(v).replace(/</g, '\\u003c');
const escHtml = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** The page's own bridge: the controls' values, `ams.params`, and the window's size as p5.js names it. */
export const shim = (vals, title, p5) => `(() => {
  const vals = ${json(vals)}, sets = {}, params = { ...vals };
  window.__ctl = (k, f) => { sets[k] = f; if (k in vals) f(vals[k]); };
  window.__set = (k, v) => { vals[k] = params[k] = v; try { sets[k] && sets[k](v); } catch (e) { console.error(e); } };
  const gone = () => Promise.reject(Error('The studio is not here: this page runs on its own'));
  window.ams = Object.freeze({ board: ${json(title)}, get width() { return innerWidth; }, get height() { return innerHeight; }, params, call: gone, mark: gone, frame: gone });
  ${p5 ? '' : 'Object.defineProperties(window, { windowWidth: { get: () => innerWidth, configurable: true }, windowHeight: { get: () => innerHeight, configurable: true } });'}
  addEventListener('keydown', e => { if (e.key === 'f' && !e.metaKey && !e.ctrlKey && !/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen && document.documentElement.requestFullscreen(); } });
})();`;

const head = (title, ground) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escHtml(title)}</title>
<style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:${/^#[0-9a-f]{3,8}$/i.test(ground || '') ? ground : '#000'}}canvas{display:block}</style></head><body>`;

/**
 * kind 'three' (needs `loadFile`, which reads a three.js file by its path under node_modules/three) or 'p5' (needs `p5Source`).
 * `controls`: add the panel. Resolves the HTML text.
 */
export async function sketchPage({ kind, title, code, ground, controls = false, loadFile, p5Source, files = {} }) {
  const inst = instrument(code);
  const specs = controlSpecs(code);
  const parts = [head(title, ground), `<script>${shim(inst.values, title, kind === 'p5')}</script>`];
  // the files the sketch reads by name (a model, a picture) are in the page as data: window.__amsFiles
  if (Object.keys(files).length) parts.push(`<script>window.__amsFiles = ${json(files)};</script>`);
  const mode = panelOf(code);   // // @panel open | hidden | off
  if (controls && mode !== 'off') parts.push(`<script>${panelScript(specs, code, mode === 'hidden' ? { start: 'hidden' } : {})}</script>`);
  if (kind === 'three') {
    const m = await collectThree(inst.code, loadFile);
    parts.push(`<script type="application/json" id="three-modules">${json(m.modules)}</script><script type="module">${threeLoader(null)}</script>`);
  } else {
    parts.push(`<script>${String(p5Source).replace(/<\/script/gi, '<\\/script')}</script><script>${inst.code.replace(/<\/script/gi, '<\\/script')}</script>`);
  }
  parts.push('</body></html>\n');
  return parts.join('\n');
}

/**
 * The sketch as a page for any other editor (CodePen, Codevre, a file on a server): the code unchanged, and the library from a CDN at the
 * version the studio runs: three.js by an import map (three and three/addons/), p5.js by a script tag. Small, readable, and it opens.
 * The control comments are only comments there; a line at the top says so.
 */
export function modulePage({ kind, title, code, ground, version, p5Version }) {
  const inst = instrument(code);
  const bg = /^#[0-9a-f]{3,8}$/i.test(ground || '') ? ground : '#141414';
  const note = '<!-- Made in Artist Model Studio. A comment like /* 0..4 */ makes a slider in the studio; in another editor it is only a comment, and the sketch runs with the values as written. -->';
  const shim = /\bams\./.test(code) ? `<script>window.ams = { width: innerWidth, height: innerHeight, board: ${json(title)}, params: ${json(inst.values)} };</script>\n` : '';
  const head = `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escHtml(title)}</title>\n${note}\n<style>html,body{margin:0;overflow:hidden;background:${bg}}canvas{display:block}</style>`;
  if (kind === 'three') {
    const cdn = `https://cdn.jsdelivr.net/npm/three@${version}`;
    return `${head}\n<script type="importmap">\n{ "imports": {\n  "three": "${cdn}/build/three.module.js",\n  "three/addons/": "${cdn}/examples/jsm/"\n} }\n</script>\n</head><body>\n${shim}<script type="module">\n${code.replace(/<\/script/gi, '<\\/script').trimEnd()}\n</script>\n</body></html>\n`;
  }
  return `${head}\n<script src="https://cdn.jsdelivr.net/npm/p5@${p5Version}/lib/p5.min.js"></script>\n</head><body>\n${shim}<script>\n${code.replace(/<\/script/gi, '<\\/script').trimEnd()}\n</script>\n</body></html>\n`;
}

/**
 * A three.js sketch as an app.js for a page whose import map only names `three` (Codevre's "Three.js" template:
 * <script type="importmap">{"imports":{"three":"https://esm.sh/three@latest"}}</script> and <script type="module" src="./app.js">).
 * The addons are imported from esm.sh with `three` left bare (?external=three), so they share the page's one three.js.
 */
export function appJsFor(code) {
  const swap = spec => {
    const addon = /^three\/(?:addons|examples\/jsm)\/(.+)$/.exec(spec);
    if (addon) return `https://esm.sh/three@latest/addons/${addon[1]}?external=three`;
    if (spec === 'lil-gui') return 'https://esm.sh/lil-gui';
    return spec;
  };
  return code.replace(/(\bfrom\s*|\bimport\s*\(?\s*)(['"])([^'"\n]+)\2/g, (all, pre, q, spec) => `${pre}${q}${swap(spec)}${q}`);
}

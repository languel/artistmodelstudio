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
const shim = (vals, title, p5) => `(() => {
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
export async function sketchPage({ kind, title, code, ground, controls = false, loadFile, p5Source }) {
  const inst = instrument(code);
  const specs = controlSpecs(code);
  const parts = [head(title, ground), `<script>${shim(inst.values, title, kind === 'p5')}</script>`];
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

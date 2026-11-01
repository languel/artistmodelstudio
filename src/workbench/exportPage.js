/**
 * A p5.js or three.js sketch as one HTML page that runs on its own (no studio, no network): the library is inside,
 * the page fills the window, and, if asked, the controls the code declares (sliders, toggles, selects, colours,
 * palettes: see process/controls.js) become a small panel that H shows and hides. For an installation: build in the
 * studio, export, open the file.
 */
import { collectThree, threeLoader } from '../process/threeModules.js';
import { findControls, instrument, stepFor } from '../process/controls.js';

const json = v => JSON.stringify(v).replace(/</g, '\\u003c');
const escHtml = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** The controls that can run in an exported page: the ones that change a value in a running sketch. */
export function controlSpecs(code) {
  return findControls(code).filter(c => c.live && c.name && ['range', 'toggle', 'select', 'color', 'palette'].includes(c.kind)).sort((a, b) => a.from - b.from).map(c => ({
    name: c.name, kind: c.kind, value: c.value, css: c.css ?? c.value,
    ...(c.kind === 'range' ? { min: c.min, max: c.max, step: c.step || stepFor(c.min, c.max) } : {}),
    ...(c.kind === 'select' ? { options: c.options } : {}),
    ...(c.kind === 'color' ? { num: Boolean(c.num) } : {}),
    ...(c.kind === 'palette' ? { nums: c.items.map(i => Boolean(i.num)) } : {})
  }));
}

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

/** The panel: one row for each control; the gear (or H) shows and hides it, ?ui=0 starts it hidden. */
const panel = specs => `(() => {
  const specs = ${json(specs)};
  const style = document.createElement('style');
  style.textContent = '#ams-ui{position:fixed;top:10px;right:10px;z-index:9;font:12px/1.4 system-ui,sans-serif;color:#e8e8e8;text-align:right}'
    + '#ams-ui button.g{width:28px;height:28px;border:0;border-radius:14px;background:rgba(20,20,22,.75);color:#e8e8e8;font-size:15px;cursor:pointer}'
    + '#ams-ui .p{margin-top:6px;padding:8px 10px;border-radius:8px;background:rgba(20,20,22,.82);backdrop-filter:blur(6px);display:grid;grid-template-columns:auto 130px auto;gap:6px 8px;align-items:center;text-align:left;max-height:80vh;overflow:auto}'
    + '#ams-ui .p[hidden]{display:none}#ams-ui .l{opacity:.7}#ams-ui .v{opacity:.55;min-width:34px;text-align:right;font:11px ui-monospace,monospace}'
    + '#ams-ui input[type=range]{width:100%;accent-color:#e0a030}#ams-ui input[type=color]{width:26px;height:20px;padding:0;border:0;background:none}#ams-ui select{width:100%;font:inherit}'
    + '#ams-ui .c{grid-column:2/4;display:flex;gap:4px}';
  document.head.append(style);
  const root = document.createElement('div'); root.id = 'ams-ui';
  const gear = document.createElement('button'); gear.className = 'g'; gear.textContent = '⚙'; gear.title = 'Controls (H)';
  const box = document.createElement('div'); box.className = 'p';
  root.append(gear, box); document.body.append(root);
  const toHex = css => { try { const g = document.createElement('canvas').getContext('2d'); g.fillStyle = '#000'; g.fillStyle = css; const v = g.fillStyle; if (v[0] === '#') return v; const m = v.match(/\\d+/g); return '#' + m.slice(0, 3).map(n => (+n).toString(16).padStart(2, '0')).join(''); } catch { return '#888888'; } };
  const out = (hex, num) => (num ? parseInt(hex.slice(1), 16) : hex);
  const add = (spec, ...cells) => { const l = document.createElement('span'); l.className = 'l'; l.textContent = spec.name; box.append(l, ...cells); };
  for (const s of specs) {
    if (s.kind === 'range') {
      const i = document.createElement('input'); i.type = 'range'; i.min = s.min; i.max = s.max; i.step = s.step; i.value = s.value;
      const v = document.createElement('span'); v.className = 'v'; v.textContent = s.value;
      i.oninput = () => { v.textContent = i.value; __set(s.name, +i.value); };
      add(s, i, v);
    } else if (s.kind === 'toggle') {
      const i = document.createElement('input'); i.type = 'checkbox'; i.checked = s.value; i.onchange = () => __set(s.name, i.checked);
      const w = document.createElement('span'); w.className = 'c'; w.append(i); add(s, w);
    } else if (s.kind === 'select') {
      const i = document.createElement('select');
      for (const o of s.options) { const op = document.createElement('option'); op.value = op.textContent = o; i.append(op); }
      i.value = s.value; i.onchange = () => __set(s.name, i.value);
      const w = document.createElement('span'); w.className = 'c'; w.append(i); add(s, w);
    } else if (s.kind === 'color') {
      const i = document.createElement('input'); i.type = 'color'; i.value = toHex(s.css); i.oninput = () => __set(s.name, out(i.value, s.num));
      const w = document.createElement('span'); w.className = 'c'; w.append(i); add(s, w);
    } else if (s.kind === 'palette') {
      const w = document.createElement('span'); w.className = 'c';
      const ins = s.css.map((c, k) => { const i = document.createElement('input'); i.type = 'color'; i.value = toHex(c); i.oninput = () => __set(s.name, ins.map((x, j) => out(x.value, s.nums[j]))); w.append(i); return i; });
      add(s, w);
    }
  }
  const show = on => { box.hidden = !on; };
  show(!/[?&]ui=0/.test(location.search) && location.hash !== '#noui');
  gear.onclick = () => show(box.hidden);
  addEventListener('keydown', e => { if ((e.key === 'h' || e.key === 'H') && !e.metaKey && !e.ctrlKey && !/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) show(box.hidden); });
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
  if (controls && specs.length) parts.push(`<script>${panel(specs)}</script>`);
  if (kind === 'three') {
    const m = await collectThree(inst.code, loadFile);
    parts.push(`<script type="application/json" id="three-modules">${json(m.modules)}</script><script type="module">${threeLoader(null)}</script>`);
  } else {
    parts.push(`<script>${String(p5Source).replace(/<\/script/gi, '<\\/script')}</script><script>${inst.code.replace(/<\/script/gi, '<\\/script')}</script>`);
  }
  parts.push('</body></html>\n');
  return parts.join('\n');
}

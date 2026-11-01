/**
 * The controls panel of a running sketch: one row for each control the code declares, a code glyph at the bottom (it shows the code over
 * the page and copies it), and a gear that only appears when the pointer is near its corner. Used by the exported page (the function's
 * text is embedded, so it must stay self-contained: nothing from outside) and by Perform in the studio.
 */
import { findControls, stepFor } from '../process/controls.js';

/** The controls that can run in a page: the ones that change a value in a running sketch. */
export function controlSpecs(code) {
  return findControls(code).filter(c => c.live && c.name && ['range', 'toggle', 'select', 'color', 'palette'].includes(c.kind)).sort((a, b) => a.from - b.from).map(c => ({
    name: c.name, kind: c.kind, value: c.value, css: c.css ?? c.value,
    ...(c.kind === 'range' ? { min: c.min, max: c.max, step: c.step || stepFor(c.min, c.max) } : {}),
    ...(c.kind === 'select' ? { options: c.options } : {}),
    ...(c.kind === 'color' ? { num: Boolean(c.num) } : {}),
    ...(c.kind === 'palette' ? { nums: c.items.map(i => Boolean(i.num)) } : {})
  }));
}

/**
 * Mount the panel. `set(name, value)` is called as a control changes. opts: { start: 'hidden' } (as if Shift+H had been pressed),
 * { keys: false } (the caller passes keys to the returned onKey), { zone: true } (a hot corner over whatever is under the page, such as
 * a frame, which would otherwise keep the pointer's movement from the page). Returns { onKey(e) → handled, destroy() }.
 *
 * H shows and hides the panel; Shift+H hides all of it (the gear still comes back when the pointer is near, and a click brings the
 * panel); Esc closes the code. Do not use anything from outside this function: its text is the exported page's script.
 */
export function mountPanel(specs, source, set, opts) {
  opts = opts || {};
  const rid = opts.id || 'ams-ui', cid = rid + '-code';
  // Light or dark: the studio's theme (a page of its own is dark).
  const light = (opts.theme || (document.documentElement.dataset && document.documentElement.dataset.theme)) === 'light';
  const P = light
    ? { bg: 'rgba(247,245,241,.92)', fg: '#1d1b19', soft: 'rgba(0,0,0,.08)', soft2: 'rgba(0,0,0,.16)', field: '#ffffff', line: '#bdb8ae', accent: '#c8664f', veil: 'rgba(247,245,241,.88)' }
    : { bg: 'rgba(20,20,22,.82)', fg: '#e8e8e8', soft: 'rgba(255,255,255,.1)', soft2: 'rgba(255,255,255,.2)', field: '#2a2a2e', line: '#4a4a50', accent: '#e0a030', veil: 'rgba(10,10,12,.84)' };
  const chevron = 'url("data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M2.3 3.8 5 6.4 7.7 3.8" fill="none" stroke="' + P.fg + '" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>') + '")';
  const style = document.createElement('style');
  style.textContent = '#ams-ui{position:fixed;top:10px;right:10px;z-index:2147483000;font:12px/1.4 system-ui,sans-serif;color:' + P.fg + ';text-align:right;color-scheme:' + (light ? 'light' : 'dark') + '}'
    + '#ams-ui .z{position:fixed;top:0;right:0;width:150px;height:150px}'
    + '#ams-ui button.g{position:relative;width:28px;height:28px;border:0;border-radius:14px;background:' + P.bg + ';color:' + P.fg + ';font-size:15px;cursor:pointer;opacity:0;transition:opacity .25s}'
    + '#ams-ui.near button.g,#ams-ui.open button.g,#ams-ui button.g:focus-visible{opacity:1}'
    + '#ams-ui .p{position:relative;margin-top:6px;padding:8px 10px;border-radius:8px;background:' + P.bg + ';backdrop-filter:blur(6px);display:grid;grid-template-columns:auto 130px auto;gap:6px 8px;align-items:center;text-align:left;max-height:80vh;overflow:auto}'
    + '#ams-ui .p[hidden]{display:none}#ams-ui .l{opacity:.7}#ams-ui .v{opacity:.55;min-width:34px;text-align:right;font:11px ui-monospace,monospace}'
    + '#ams-ui input[type=range]{width:100%;accent-color:' + P.accent + '}#ams-ui input[type=color]{width:26px;height:20px;padding:0;border:0;background:none}'
    + '#ams-ui select{width:100%;font:inherit;appearance:none;-webkit-appearance:none;background:' + P.field + ' ' + chevron + ' no-repeat right 6px center/10px;color:' + P.fg + ';border:1px solid ' + P.line + ';border-radius:5px;padding:2px 22px 2px 6px}'
    + '#ams-ui select option{background:' + P.field + ';color:' + P.fg + '}'
    + '#ams-ui .c{grid-column:2/4;display:flex;gap:4px}'
    + '#ams-ui .f{grid-column:1/-1;display:flex;justify-content:flex-end;gap:4px;margin-top:2px}'
    + '#ams-ui .f button{height:24px;min-width:28px;padding:0 9px;border:0;border-radius:12px;background:' + P.soft + ';color:' + P.fg + ';font:12px ui-monospace,monospace;cursor:pointer}'
    + '#ams-ui .f button:hover{background:' + P.soft2 + '}'
    + '#ams-code{position:fixed;inset:0;z-index:2147482999;background:' + P.veil + ';backdrop-filter:blur(8px);color:' + P.fg + ';display:flex}'
    + '#ams-code[hidden]{display:none}'
    + '#ams-code pre{flex:1;margin:0;padding:14px 56px 16px 16px;overflow:auto;font:12px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre;tab-size:2}';
  style.textContent = style.textContent.replace(/#ams-ui/g, '#' + rid).replace(/#ams-code/g, '#' + cid);
  document.head.append(style);
  const root = document.createElement('div'); root.id = rid;
  if (opts.zone) { const z = document.createElement('div'); z.className = 'z'; root.append(z); root.zone = z; }
  const gear = document.createElement('button'); gear.className = 'g'; gear.textContent = '⚙'; gear.title = 'Controls (H; Shift+H hides it all)';
  const box = document.createElement('div'); box.className = 'p';
  root.append(gear, box);
  const host = opts.container || document.body;
  if (opts.container) { root.style.position = 'absolute'; root.style.pointerEvents = 'auto'; root.style.zIndex = '5'; }   // (on a board: it lies on it, and takes the pointer)
  host.append(root);
  const toHex = css => { try { const g = document.createElement('canvas').getContext('2d'); g.fillStyle = '#000'; g.fillStyle = css; const v = g.fillStyle; if (v[0] === '#') return v; const m = v.match(/\d+/g); return '#' + m.slice(0, 3).map(n => (+n).toString(16).padStart(2, '0')).join(''); } catch (e) { return '#888888'; } };
  const out = (hex, num) => (num ? parseInt(hex.slice(1), 16) : hex);
  const add = (spec, ...cells) => { const l = document.createElement('span'); l.className = 'l'; l.textContent = spec.name; box.append(l, ...cells); };
  for (const s of specs) {
    if (s.kind === 'range') {
      const i = document.createElement('input'); i.type = 'range'; i.min = s.min; i.max = s.max; i.step = s.step; i.value = s.value;
      const v = document.createElement('span'); v.className = 'v'; v.textContent = s.value;
      i.oninput = () => { v.textContent = i.value; set(s.name, +i.value); };
      add(s, i, v);
    } else if (s.kind === 'toggle') {
      const i = document.createElement('input'); i.type = 'checkbox'; i.checked = s.value; i.onchange = () => set(s.name, i.checked);
      const w = document.createElement('span'); w.className = 'c'; w.append(i); add(s, w);
    } else if (s.kind === 'select') {
      const i = document.createElement('select');
      for (const o of s.options) { const op = document.createElement('option'); op.value = op.textContent = o; i.append(op); }
      i.value = s.value; i.onchange = () => set(s.name, i.value);
      const w = document.createElement('span'); w.className = 'c'; w.append(i); add(s, w);
    } else if (s.kind === 'color') {
      const i = document.createElement('input'); i.type = 'color'; i.value = toHex(s.css); i.oninput = () => set(s.name, out(i.value, s.num));
      const w = document.createElement('span'); w.className = 'c'; w.append(i); add(s, w);
    } else if (s.kind === 'palette') {
      const w = document.createElement('span'); w.className = 'c';
      const ins = s.css.map((c, k) => { const i = document.createElement('input'); i.type = 'color'; i.value = toHex(c); i.oninput = () => set(s.name, ins.map((x, j) => out(x.value, s.nums[j]))); w.append(i); return i; });
      add(s, w);
    }
  }
  // The code, over the page: the glyph at the bottom of the panel shows it (and copies it); the glyph again, or Esc, hides it.
  const code = document.createElement('div'); code.id = cid; code.hidden = true;
  if (opts.container) code.style.position = 'absolute';
  const pre = document.createElement('pre'); pre.textContent = source;
  code.append(pre); host.append(code);
  const foot = document.createElement('div'); foot.className = 'f';
  const cb = document.createElement('button'); cb.textContent = '</>'; cb.title = 'Show the code (and copy it)';
  foot.append(cb); if (opts.code !== false) box.append(foot);
  let timer = 0;
  const showCode = on => {
    code.hidden = !on;
    if (!on) return;
    try { navigator.clipboard.writeText(source).then(() => { cb.textContent = 'copied'; clearTimeout(timer); timer = setTimeout(() => { cb.textContent = '</>'; }, 1300); }, () => {}); } catch (e) { /* no clipboard here */ }
  };
  cb.onclick = () => showCode(code.hidden);
  // The panel and the hiding of it all.
  let stealth = false, wasOpen = true;
  const show = on => { box.hidden = !on; root.classList.toggle('open', on); };
  const hideAll = () => { wasOpen = !box.hidden; show(false); showCode(false); stealth = true; };
  gear.onclick = () => { stealth = false; show(box.hidden); };
  if (opts.start === 'hidden' || (!opts.container && (/[?&]ui=0/.test(location.search) || location.hash === '#noui'))) hideAll(); else show(true);
  // The gear shows when the pointer is near it (and stays while the panel is open).
  const near = e => { const r = root.getBoundingClientRect(); const d = Math.hypot(Math.max(r.left - e.clientX, 0, e.clientX - r.right), Math.max(r.top - e.clientY, 0, e.clientY - r.bottom)); root.classList.toggle('near', d < 90); };
  const leave = () => root.classList.remove('near');
  addEventListener('pointermove', near); addEventListener('pointerdown', near);
  document.documentElement.addEventListener('pointerleave', leave);
  if (root.zone) { root.zone.addEventListener('pointerenter', () => root.classList.add('near')); root.zone.addEventListener('pointermove', () => root.classList.add('near')); root.zone.addEventListener('pointerleave', leave); }
  const onKey = e => {
    if (/INPUT|SELECT|TEXTAREA/.test((e.target && e.target.tagName) || '') || e.metaKey || e.ctrlKey || e.altKey) return false;
    if (e.key === 'Escape' && !code.hidden) { showCode(false); return true; }
    if (e.key === 'H') { if (stealth) { stealth = false; show(wasOpen); } else hideAll(); return true; }
    if (e.key === 'h') { stealth = false; show(box.hidden); return true; }
    return false;
  };
  const listener = e => { onKey(e); };
  if (opts.keys !== false) addEventListener('keydown', listener);
  return {
    onKey,
    codeOpen: () => !code.hidden,
    isOpen: () => !box.hidden,
    destroy() { removeEventListener('keydown', listener); removeEventListener('pointermove', near); removeEventListener('pointerdown', near); document.documentElement.removeEventListener('pointerleave', leave); style.remove(); root.remove(); code.remove(); }
  };
}

/** The script of an exported page: the panel, mounted. */
export const panelScript = (specs, source, opts = {}) => `(${mountPanel.toString()})(${JSON.stringify(specs).replace(/</g, '\\u003c')}, ${JSON.stringify(source).replace(/</g, '\\u003c')}, __set, ${JSON.stringify(opts)});`;

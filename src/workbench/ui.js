/** Small shared controls, after underscores' UI guidelines (27px rows, quiet, dense). */

export const h = (tag, attrs = {}, ...children) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c !== null && c !== undefined && c !== false) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return el;
};

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * Number field: type a value, or drag horizontally (Shift = fine), Shift+Backspace resets.
 * onChange(value, { final }) — final is true on commit (blur/enter/pointer up).
 */
export function numberField({ value, min = -Infinity, max = Infinity, step = 1, def = value, title = '', onChange }) {
  const input = h('input', { type: 'number', class: 'wb-num', value: String(value), min, max, step, title });
  const clamp = v => Math.min(max, Math.max(min, v));
  const round = v => Math.round(v / step) * step;
  const set = (v, final) => { const x = +clamp(round(v)).toFixed(6); input.value = String(x); onChange?.(x, { final }); };
  input.addEventListener('change', () => { const v = Number(input.value); if (Number.isFinite(v)) set(v, true); });
  input.addEventListener('keydown', e => { if (e.key === 'Backspace' && e.shiftKey) { e.preventDefault(); set(def, true); } if (e.key === 'Enter' || e.key === 'Escape') input.blur(); e.stopPropagation(); });
  input.addEventListener('pointerdown', e => {
    if (document.activeElement === input) return;
    e.preventDefault();
    const sx = e.clientX, v0 = Number(input.value) || 0;
    let dragged = false;
    const mv = ev => {
      const dx = ev.clientX - sx;
      if (!dragged && Math.abs(dx) < 3) return;
      dragged = true;
      set(v0 + dx * step * (ev.shiftKey ? 0.1 : 1), false);
    };
    const up = () => {
      window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up);
      if (dragged) onChange?.(Number(input.value), { final: true }); else { input.focus(); input.select(); }
    };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
  });
  return input;
}

export function selectField(options, value, onChange, title = '') {
  const sel = h('select', { class: 'wb-select', title });
  for (const [v, label] of options) sel.append(h('option', { value: v, selected: v === value }, label));
  sel.addEventListener('change', () => { onChange(sel.value); sel.blur(); });
  return sel;
}

export const row = (label, control, title = '') => h('label', { class: 'wb-row', title }, h('span', { class: 'wb-row-label' }, label), control);

export function section(title, open = true, ...children) {
  const d = h('details', { class: 'wb-section', open });
  d.append(h('summary', {}, title), ...children.filter(c => c !== null && c !== undefined && c !== false));
  return d;
}

export function download(data, name, type) {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}


/** A canvas as a PNG blob, made synchronously (toBlob can stall in background tabs). */
export function canvasBlob(c, type = 'image/png', quality) {
  const url = c.toDataURL(type, quality);
  const bin = atob(url.slice(url.indexOf(',') + 1));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

/**
 * Any number box: hold Cmd (Ctrl) and drag horizontally to change the value (Shift = fine).
 * Fires input while dragging and change on release, like typing would.
 */
if (typeof document !== 'undefined' && !globalThis.__amsNumDrag) {
  globalThis.__amsNumDrag = true;
  document.addEventListener('pointerdown', e => {
    const input = e.target;
    if (!(e.metaKey || e.ctrlKey) || !(input instanceof HTMLInputElement) || input.type !== 'number' || input.disabled) return;
    e.preventDefault(); e.stopImmediatePropagation();
    const num = (v, d) => (v === '' || !Number.isFinite(Number(v)) ? d : Number(v));
    const min = num(input.min, -Infinity), max = num(input.max, Infinity);
    const step = input.step === 'any' ? 0.01 : num(input.step, 1);
    const decimals = (String(step).split('.')[1] || '').length;
    const sx = e.clientX, v0 = num(input.value, 0);
    let moved = false;
    document.body.style.cursor = 'ew-resize';
    const mv = ev => {
      const dx = ev.clientX - sx;
      if (!moved && Math.abs(dx) < 2) return;
      moved = true;
      const v = Math.min(max, Math.max(min, Math.round((v0 + dx * step * (ev.shiftKey ? 0.1 : 1)) / step) * step));
      input.value = String(+v.toFixed(decimals + 1));
      input.dispatchEvent(new Event('input', { bubbles: true }));
    };
    const up = () => {
      window.removeEventListener('pointermove', mv, true); window.removeEventListener('pointerup', up, true);
      document.body.style.cursor = '';
      if (moved) input.dispatchEvent(new Event('change', { bubbles: true }));
    };
    window.addEventListener('pointermove', mv, true);
    window.addEventListener('pointerup', up, true);
  }, true);
}

// Optional children: `cond ? h(…) : null` in append / replaceChildren leaves nothing (not the text "null").
if (typeof Element !== 'undefined' && !Element.prototype.__amsSkipEmpty) {
  Element.prototype.__amsSkipEmpty = true;
  for (const name of ['append', 'replaceChildren', 'prepend']) {
    const orig = Element.prototype[name];
    Element.prototype[name] = function (...kids) { return orig.apply(this, kids.filter(k => k !== null && k !== undefined && k !== false)); };
  }
}

/**
 * Rename in place: the label's text becomes editable where it is. Enter (or clicking away) keeps
 * it, Esc puts it back. onCommit(value) gets the new text when it changed and is not empty.
 */
export function editInPlace(el, onCommit, value = el.textContent, onEnd = null) {
  if (!el || el.isContentEditable) return;
  const before = value;
  el.textContent = value;
  el.contentEditable = 'plaintext-only';
  el.spellcheck = false;
  el.classList.add('wb-editing');
  el.focus();
  const r = document.createRange(); r.selectNodeContents(el);
  const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
  let done = false;
  const finish = keep => {
    if (done) return; done = true;
    el.contentEditable = 'false'; el.classList.remove('wb-editing');
    el.removeEventListener('keydown', key); el.removeEventListener('blur', blur);
    const v = el.textContent.replace(/\s+/g, ' ').trim();
    if (keep && v && v !== before) onCommit(v); else el.textContent = before;
    onEnd?.();
  };
  const key = e => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); finish(true); } else if (e.key === 'Escape') { e.preventDefault(); finish(false); } };
  const blur = () => finish(true);
  el.addEventListener('keydown', key);
  el.addEventListener('blur', blur);
  for (const ev of ['pointerdown', 'mousedown', 'click', 'dblclick', 'dragstart']) el.addEventListener(ev, e => { if (el.isContentEditable) e.stopPropagation(); });
}

/**
 * Shift+double-click renames anything registered here, in place. Lists redraw on a click, so the
 * browser's own dblclick often never arrives: two Shift-presses on the same key within 450 ms count,
 * and the field opens on the element that has that key after the redraw.
 *   editable(el, key, get, set)  e.g. editable(span, 'board:b2', () => b.title, v => rename(v))
 */
const EDITABLE = new Map();
export function editable(el, key, get, set) {
  el.dataset.editKey = key;
  EDITABLE.set(key, { get, set });
  if (!el.title) el.title = 'Shift+double-click to rename';
  return el;
}
if (typeof document !== 'undefined' && !globalThis.__amsEditable) {
  globalThis.__amsEditable = true;
  let last = { key: null, t: 0 }, pending = null;
  document.addEventListener('pointerdown', e => {
    const el = e.target.closest?.('[data-edit-key]');
    if (!el || !e.shiftKey || el.isContentEditable) { last = { key: null, t: 0 }; return; }
    const key = el.dataset.editKey, now = performance.now();
    if (last.key === key && now - last.t < 450) { pending = key; last = { key: null, t: 0 }; e.preventDefault(); }
    else last = { key, t: now };
  }, true);
  const open = e => {
    if (!pending) return;
    const key = pending; pending = null;
    e.stopPropagation(); e.preventDefault();
    const reg = EDITABLE.get(key);
    const el = document.querySelector(`[data-edit-key="${CSS.escape(key)}"]`);
    if (reg && el) editInPlace(el, v => reg.set(v), reg.get());
  };
  document.addEventListener('click', open, true);
  document.addEventListener('dblclick', e => { if (e.target.closest?.('[data-edit-key]') && e.shiftKey) { e.stopPropagation(); e.preventDefault(); } }, true);
}

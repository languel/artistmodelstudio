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

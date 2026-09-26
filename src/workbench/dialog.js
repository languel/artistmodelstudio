/**
 * In-app dialogs (the host may block window.confirm / prompt). Both return promises:
 *   askConfirm(message, { ok, danger }) → true | false
 *   askText(label, value) → string | null
 */
function modal(build) {
  return new Promise(resolve => {
    const back = document.createElement('div'); back.className = 'wb-dialog-back';
    const box = document.createElement('div'); box.className = 'wb-dialog';
    back.append(box); document.body.append(back);
    const done = v => { back.remove(); window.removeEventListener('keydown', key, true); resolve(v); };
    const key = e => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); done(null); } };
    window.addEventListener('keydown', key, true);
    back.addEventListener('pointerdown', e => { if (e.target === back) done(null); });
    build(box, done);
  });
}

const btn = (label, cls, onclick) => { const b = document.createElement('button'); b.className = `wb-btn ${cls || ''}`; b.textContent = label; b.onclick = onclick; return b; };

export function askConfirm(message, { ok = 'OK', danger = false } = {}) {
  return modal((box, done) => {
    const p = document.createElement('p'); p.textContent = message;
    const row = document.createElement('div'); row.className = 'wb-dialog-row';
    const yes = btn(ok, danger ? 'danger' : 'primary', () => done(true));
    row.append(btn('Cancel', '', () => done(false)), yes);
    box.append(p, row);
    setTimeout(() => yes.focus());
  }).then(v => v === true);
}

export function askText(label, value = '') {
  return modal((box, done) => {
    const p = document.createElement('p'); p.textContent = label;
    const input = document.createElement(String(value).length > 60 || String(value).includes('\n') ? 'textarea' : 'input');
    input.className = 'wb-inline wb-dialog-input'; input.value = value;
    input.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter' && (input.tagName === 'INPUT' || e.metaKey || e.ctrlKey)) { e.preventDefault(); done(input.value); } if (e.key === 'Escape') done(null); });
    const row = document.createElement('div'); row.className = 'wb-dialog-row';
    row.append(btn('Cancel', '', () => done(null)), btn('OK', 'primary', () => done(input.value)));
    box.append(p, input, row);
    setTimeout(() => { input.focus(); input.select?.(); });
  });
}

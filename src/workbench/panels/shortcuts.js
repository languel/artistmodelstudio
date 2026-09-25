/**
 * Shortcuts panel (after underscores): every command and its keys, searchable. Click a key to
 * record a new one (Esc cancels, Backspace clears), + adds another, ↺ restores the default.
 * A key taken from another command is moved, and the panel says so.
 */
import { h } from '../ui.js';
import { comboOf, formatCombo } from '../shortcuts.js';

export function mountShortcuts(root, app) {
  const sc = () => app.shortcuts;
  let query = '';
  let note = '';
  const search = h('input', { type: 'search', class: 'wb-inline wb-docs-search', placeholder: 'Search commands or keys' });
  const list = h('div', { class: 'wb-sc-list' });
  const status = h('div', { class: 'wb-muted wb-small wb-sc-status' });
  root.append(h('div', { class: 'wb-row wb-row-actions' }, search,
    h('button', { class: 'wb-btn', title: 'Restore every default', onclick: () => { if (confirm('Restore all default shortcuts?')) { sc().reset(); note = 'Defaults restored.'; render(); } } }, 'Reset all')), status, list);

  const record = (cmd, index, chip) => {
    chip.textContent = 'Press keys…';
    chip.classList.add('recording');
    sc().capturing = true;
    const onKey = e => {
      e.preventDefault(); e.stopPropagation();
      if (e.key === 'Escape') return done();
      const keys = [...sc().keysOf(cmd.id)];
      if (e.key === 'Backspace' && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey && keys.length) { keys.splice(index, 1); sc().assign(cmd.id, keys); note = `${cmd.label}: key removed.`; return done(); }
      const combo = comboOf(e);
      if (!combo) return;
      if (index >= keys.length) keys.push(combo); else keys[index] = combo;
      const taken = sc().assign(cmd.id, [...new Set(keys)]);
      note = `${cmd.label}: ${formatCombo(combo)}${taken.length ? ` (taken from ${taken.map(t => t.label).join(', ')})` : ''}`;
      done();
    };
    const done = () => { window.removeEventListener('keydown', onKey, true); setTimeout(() => { sc().capturing = null; }); render(); };
    window.addEventListener('keydown', onKey, true);
  };

  const render = () => {
    if (!sc()) { setTimeout(render, 30); return; }
    status.textContent = note;
    const q = query.toLowerCase();
    const cats = new Map();
    for (const c of sc().commands) {
      const keys = sc().keysOf(c.id);
      const hay = `${c.label} ${c.category} ${c.id} ${keys.map(formatCombo).join(' ')} ${keys.join(' ')}`.toLowerCase();
      if (q && !q.split(/\s+/).every(t => hay.includes(t))) continue;
      if (!cats.has(c.category)) cats.set(c.category, []);
      cats.get(c.category).push(c);
    }
    list.replaceChildren(...[...cats].map(([cat, cmds]) => h('div', { class: 'wb-sc-cat' }, h('h4', {}, cat), ...cmds.map(c => {
      const keys = sc().keysOf(c.id);
      const chips = keys.map((k, i) => { const chip = h('button', { class: 'wb-sc-key', title: 'Click and press new keys (Backspace removes)' }, formatCombo(k)); chip.onclick = () => record(c, i, chip); return chip; });
      const add = h('button', { class: 'wb-sc-key wb-sc-add', title: keys.length ? 'Add another key' : 'Assign a key' }, keys.length ? '+' : 'Set');
      add.onclick = () => record(c, keys.length, add);
      return h('div', { class: `wb-sc-row${sc().isCustom(c.id) ? ' custom' : ''}` },
        h('span', { class: 'wb-sc-label', title: c.id }, c.label),
        h('span', { class: 'wb-sc-keys' }, ...chips, add,
          sc().isCustom(c.id) ? h('button', { class: 'wb-icon-btn wb-sc-reset', title: 'Restore the default', onclick: () => { sc().reset(c.id); note = `${c.label}: default restored.`; render(); } }, '↺') : null));
    }))), cats.size ? '' : h('p', { class: 'wb-muted' }, 'Nothing found.'));
  };
  search.addEventListener('input', () => { query = search.value; render(); });
  search.addEventListener('keydown', e => e.stopPropagation());
  setTimeout(() => sc()?.listeners.add(render));
  render();
}

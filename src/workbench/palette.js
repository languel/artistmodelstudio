/**
 * Command palette (Cmd+K), after underscores: every action by name. Type to filter; Enter runs.
 * Anything that matches nothing can be asked of the Assistant.
 */
import { h } from './ui.js';
import { EXERCISES } from '../process/exercises.js';
import { createDocument } from '../process/document.js';

export function buildCommands(app) {
  const cmd = (category, name, run, keys = '', hint = '') => ({ id: `${category}:${name}`, category, name, run, keys, hint });
  const out = [
    cmd('File', 'New drawing (a new scene)', () => app.scenes.create()),
    cmd('File', 'Open file…', () => app.openFile()),
    cmd('File', 'Save to Assets', () => app.saveToAssets(), '⌘S'),
    cmd('Edit', 'Undo', () => app.store.undo(), '⌘Z'),
    cmd('Edit', 'Redo', () => app.store.redo(), '⇧⌘Z'),
    cmd('Edit', 'Pick a color (eyedropper)', () => import('./colorPicker.js').then(m => m.eyedropToTarget(app)), 'I'),
    cmd('Edit', 'Select all', () => app.canvas.select(app.store.doc.elements.filter(e => app.canvas.editable(e)).map(e => e.id)), '⌘A'),
    ...[['png', 'Picture (PNG)'], ['svg', 'SVG with process record'], ['p5', 'p5.js sketch (zip)'], ['sheet', 'Process sheet (PNG)'], ['json', 'Process document (JSON)'], ['excalidraw', 'Excalidraw']]
      .map(([k, l]) => cmd('Export', l, () => app.exportAs(k))),
    cmd('View', 'Picture view', () => app.setViewMode('picture'), '\\'),
    cmd('View', 'Process view', () => app.setViewMode('process'), '\\'),
    cmd('View', 'Fit artboard', () => { app.canvas.fit(); app.renderChrome(); }, 'F'),
    cmd('View', 'Toggle reference', () => { if (app.reference) { app.reference.visible = !app.reference.visible; app.canvas.invalidate(); app.renderChrome(); } }, 'R'),
    cmd('View', 'Toggle grid', () => app.canvas.setGrid({ show: app.canvas.grid.show === 'off' ? 'paper' : 'off' })),
    cmd('View', 'Toggle snap to grid', () => { app.canvas.setGrid({ snap: !app.canvas.grid.snap }); app.log(`Snap ${app.canvas.grid.snap ? 'on' : 'off'}.`); }),
    cmd('Record', 'Start recording', () => app.recorder.start()),
    cmd('Record', 'Stop recording', () => app.recorder.stop()),
    cmd('Record', 'Timeline', () => app.docks.open('timeline')),
    cmd('View', 'Reset layout', () => app.docks.reset()),
    cmd('View', 'Classic studio', () => { window.location.href = '/classic.html'; })
  ];
  for (const [id, label, key] of app.toolList || []) out.push(cmd('Tool', label, () => app.setTool(id), key));
  for (const p of app.docks.panels.values()) out.push(cmd('Panel', p.title, () => app.docks.open(p.id)));
  for (const e of EXERCISES) out.push(cmd('Exercise', e.title, () => { app.docks.open('script'); app.scriptPanel?.setSource(e.source); app.scriptPanel?.run(); }, '', e.brief));
  for (const w of app.walkthroughs.list()) out.push(cmd('Walkthrough', w.title, () => app.walkthroughs.start(w.id), '', w.summary));
  for (const t of app.docsTopics?.() || []) out.push(cmd('Docs', t.title, () => app.openDocs(t.id), '', t.summary));
  out.push(
    cmd('Decide', 'Analyze reference', () => { app.docks.open('decide'); app.decidePanel?.analyze(); }),
    cmd('Decide', 'Propose step', () => { app.docks.open('decide'); app.decidePanel?.propose(); }),
    cmd('Agent', 'How did you do that? (replay last agent session)', () => window.ams.callTool('ams_sessions', { action: 'replay' }))
  );
  // Show the keys as currently assigned (Shortcuts panel), not the defaults.
  const K = { 'File:Save to Assets': 'file.save', 'Edit:Undo': 'edit.undo', 'Edit:Redo': 'edit.redo', 'Edit:Select all': 'edit.selectAll', 'Edit:Pick a color (eyedropper)': 'edit.eyedropper', 'View:Picture view': 'view.toggle', 'View:Process view': 'view.toggle', 'View:Fit artboard': 'view.fit', 'View:Toggle reference': 'view.reference', 'View:Toggle grid': 'view.grid', 'View:Toggle snap to grid': 'view.snap' };
  for (const c of out) {
    const id = K[c.id] || (c.category === 'Tool' ? `tool.${(app.toolList || []).find(t => t[1] === c.name)?.[0]}` : null);
    if (id && app.shortcuts) c.keys = app.shortcuts.label(id);
  }
  out.push({ id: 'Panel:Shortcuts', category: 'App', name: 'Shortcuts', hint: 'Search and reassign keys', keys: app.shortcuts?.label('app.shortcuts') || '', run: () => app.docks.open('shortcuts') });
  return out;
}

const score = (c, terms) => {
  const hay = `${c.name} ${c.category} ${c.hint}`.toLowerCase();
  if (!terms.every(t => hay.includes(t))) return -1;
  const name = c.name.toLowerCase();
  return (name.startsWith(terms[0]) ? 3 : 0) + (name.includes(terms.join(' ')) ? 2 : 0) + (c.category.toLowerCase().startsWith(terms[0]) ? 1 : 0);
};

export function openPalette(app) {
  document.querySelector('.wb-palette-overlay')?.remove();
  const all = buildCommands(app);
  let list = all, index = 0;
  const input = h('input', { class: 'wb-palette-input', placeholder: 'Command, panel, exercise, doc… or ask', spellcheck: 'false' });
  const results = h('div', { class: 'wb-palette-results', role: 'listbox' });
  const overlay = h('div', { class: 'wb-palette-overlay', onpointerdown: e => { if (e.target === overlay) close(); } },
    h('div', { class: 'wb-palette-card' }, input, results));
  const close = () => overlay.remove();
  const ask = q => ({ id: 'ask', category: 'Assistant', name: `Ask: ${q}`, hint: '', keys: '↵', run: () => { app.docks.open('assistant'); setTimeout(() => app.assistantAsk?.(q), 50); } });
  const render = () => {
    const q = input.value.trim().toLowerCase();
    const terms = q.split(/\s+/).filter(Boolean);
    list = terms.length ? all.map(c => [c, score(c, terms)]).filter(([, s]) => s >= 0).sort((a, b) => b[1] - a[1]).map(([c]) => c) : all;
    if (q) list = [...list.slice(0, 40), ask(input.value.trim())];
    index = Math.min(index, list.length - 1);
    results.replaceChildren(...list.slice(0, 60).map((c, i) => h('div', {
      class: `wb-palette-item${i === index ? ' active' : ''}`, title: c.hint || '',
      onpointerenter: () => { index = i; mark(); }, onclick: () => runIt(c)
    }, h('span', { class: 'wb-palette-name' }, c.name), h('span', { class: 'wb-palette-cat' }, c.category), c.keys ? h('kbd', {}, c.keys) : null)));
    if (!list.length) results.append(h('div', { class: 'wb-palette-empty' }, 'Nothing matches'));
  };
  const mark = () => results.querySelectorAll('.wb-palette-item').forEach((el, i) => el.classList.toggle('active', i === index));
  const runIt = c => { close(); try { const r = c.run(); r?.catch?.(e => app.log(e.message, 'error')); } catch (e) { app.log(e.message, 'error'); } };
  input.addEventListener('input', () => { index = 0; render(); });
  input.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'ArrowDown') { e.preventDefault(); index = (index + 1) % list.length; mark(); results.children[index]?.scrollIntoView({ block: 'nearest' }); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); index = (index - 1 + list.length) % list.length; mark(); results.children[index]?.scrollIntoView({ block: 'nearest' }); }
    else if (e.key === 'Enter') { e.preventDefault(); if (list[index]) runIt(list[index]); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
  });
  document.body.append(overlay);
  render();
  input.focus();
}

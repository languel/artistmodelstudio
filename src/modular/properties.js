/**
 * Properties → Module (a module of the modular synth on the canvas: its settings, a preset, its cables, a note to hear
 * it) and Properties → Cable (where it goes, which slot, how much it modulates). Kept on the mark, under play.mod and
 * play.cable: one undo step each. A slider is heard while it is dragged; ◆ keys a setting on the Timeline
 * ('patch:<mark id>.<setting>').
 */
import { h, row, selectField, section } from '../workbench/ui.js';
import { editPlay } from '../workbench/panels/playSection.js';
import { keyframeDot } from '../workbench/keyframeDot.js';
import { KINDS, settingsOf, isInstrument, isSequencer, isModSlot, cableAllowed, parseGrid, gridText } from '../audio/modular/patch.js';
import { FACTORY_PRESETS } from '../audio/modular/presets.js';
import { isModule, isCable, portsOf, patchOfDoc, cableType } from './model.js';

const label = k => k.replace(/_/g, ' ');
const slotName = s => (s === 'notes' ? 'notes' : isModSlot(s) ? `${s.slice(4)} (modulation)` : s.replace(/_/g, ' '));

/** Change some settings of a module (only what differs from the default is kept). */
export function setModSettings(app, id, values, what = 'module setting') {
  editPlay(app, id, play => {
    const kind = play.mod?.kind, spec = KINDS[kind]?.params || {};
    const next = { ...(play.mod.settings || {}), ...values };
    for (const [k, v] of Object.entries(next)) if (!spec[k] || v === spec[k].def) delete next[k];
    play.mod = { ...play.mod, settings: next };
  }, what);
}

function sampleField(app, value, onSet) {
  const sel = h('select', { class: 'wb-select', title: 'A recording from the Media library (Assets): sounds, the Voyager record, Edison…' }, h('option', { value }, value || '(none)'));
  const slug = t => String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  app.assetStore?.all().then(all => {
    const audio = all.filter(a => a.kind === 'audio' || /^audio\//.test(a.blob?.type || ''));
    sel.replaceChildren(h('option', { value: '' }, '(none)'), ...audio.map(a => h('option', { value: slug(a.title), selected: slug(a.title) === value }, a.title)));
    if (value && !audio.some(a => slug(a.title) === value)) sel.append(h('option', { value, selected: true }, value));
  }).catch(() => {});
  sel.addEventListener('change', () => onSet(sel.value));
  return sel;
}

function moduleSection(app, e) {
  const kind = e.play.mod.kind, k = KINDS[kind], s = settingsOf(e.play.mod), pp = app.patch;
  const set = (key, v) => setModSettings(app, e.id, { [key]: v }, `${kind} ${label(key)}`);
  const rows = [h('div', { class: 'wb-muted wb-small' }, k.doc)];
  const presets = FACTORY_PRESETS[kind];
  if (presets) rows.push(row('Preset', selectField([['', '…'], ...Object.keys(presets).map(n => [n, n])], '', v => { if (v) setModSettings(app, e.id, presets[v], `${kind} preset`); })));
  for (const [key, spec] of Object.entries(k.params)) {
    if (kind === 'Mixer' && /_(\d)$/.test(key) && /^(pan|solo)_/.test(key)) continue;   // (levels and mutes here; the rest in the Patch panel)
    const v = s[key];
    if (kind === 'Sampler' && key === 'sample') { rows.push(row('Sample', sampleField(app, v, x => set(key, x)))); continue; }
    if (spec.options) { rows.push(row(label(key), selectField(spec.options.map(o => [String(o), String(o)]), String(v), x => set(key, x)))); continue; }
    if (spec.bool) { rows.push(row(label(key), h('input', { type: 'checkbox', checked: v, onchange: ev => set(key, ev.target.checked) }))); continue; }
    if (spec.text) {
      const ta = h('textarea', { class: 'wb-pt-text', rows: Math.min(10, spec.rows || 3), spellcheck: false, title: k.doc });
      ta.value = v;
      ta.addEventListener('change', () => set(key, ta.value));
      rows.push(h('label', { class: 'wb-pt-row is-text' }, h('span', {}, label(key)), ta));
      continue;
    }
    const step = spec.step || (spec.max - spec.min > 50 ? 1 : spec.max - spec.min > 5 ? 0.01 : 0.001);
    const out = h('span', { class: 'wb-pt-val' }, String(v));
    const input = h('input', { type: 'range', class: 'wb-range', min: spec.min, max: spec.max, step, value: v });
    input.addEventListener('input', () => { out.textContent = input.value; pp?.preview(e.id, key, Number(input.value)); });
    input.addEventListener('change', () => set(key, Number(input.value)));
    input.addEventListener('dblclick', () => set(key, spec.def));
    rows.push(h('label', { class: 'wb-pt-row', title: `${label(key)} (double-click: ${spec.def}; ◆ keys it on the Timeline)` }, h('span', {}, label(key)), input, h('span', { class: 'wb-pt-val' }, out, keyframeDot(`patch:${e.id}.${key}`))));
  }
  // quick edits for the grids
  if (kind === 'Grid') {
    const cells = parseGrid(s.cells), W = Math.max(1, ...cells.map(r => r.length));
    const put = rowsNext => set('cells', gridText(rowsNext));
    rows.push(h('div', { class: 'wb-row wb-mod-actions' },
      h('button', { class: 'wb-btn', title: 'Every cell off', onclick: () => put(cells.map(r => r.map(() => 0))) }, 'Clear'),
      h('button', { class: 'wb-btn', title: 'A random melody: about one note a step, sometimes a rest', onclick: () => put(cells.map(() => Array(W).fill(0)).map((r, i, all) => r.map((_, j) => (Math.random() < 0.8 / all.length * (j % 2 ? 0.8 : 1.3) ? 1 : 0)))) }, 'Random'),
      h('button', { class: 'wb-btn', title: 'Shift the pattern one step later', onclick: () => put(cells.map(r => [r.at(-1) || 0, ...r.slice(0, -1)])) }, '⟶'),
      h('button', { class: 'wb-btn', title: 'Twice as many steps (the pattern repeated)', onclick: () => put(cells.map(r => [...r, ...r])) }, '×2')));
  }
  if (isInstrument(kind) || isSequencer(kind)) rows.push(h('div', { class: 'wb-row' }, h('button', { class: 'wb-btn', title: 'Hear it: a note now (a sequencer: on what it is cabled to)', onclick: () => pp?.audition(e.id, kind === 'DrumSynth' || kind === 'DrumKit' ? 36 : 60) }, '♪ Play a note')));
  // its cables
  const doc = app.store.doc, mine = doc.elements.filter(x => isCable(x) && (x.play.cable.from === e.id || x.play.cable.to === e.id));
  if (mine.length) {
    const name = id => { const m = doc.elements.find(x => x.id === id); return m ? m.label || m.play.mod.kind : id; };
    rows.push(h('div', { class: 'wb-muted wb-small' }, 'Cables'), ...mine.map(c => h('div', { class: 'wb-row wb-mod-cable' },
      h('span', {}, c.play.cable.from === e.id ? `→ ${name(c.play.cable.to)} · ${slotName(c.play.cable.slot)}` : `← ${name(c.play.cable.from)} · ${slotName(c.play.cable.slot)}`),
      h('button', { class: 'wb-pt-x', title: 'Unplug (remove the cable)', onclick: () => app.store.change('unplug', d => { d.elements = d.elements.filter(x => x.id !== c.id); }) }, '×'))));
  }
  return section(`Module: ${kind}`, true, ...rows);
}

function cableSection(app, e) {
  const doc = app.store.doc, c = e.play.cable, a = doc.elements.find(x => x.id === c.from), b = doc.elements.find(x => x.id === c.to);
  const nm = m => (m ? m.label || m.play.mod.kind : '?');
  const setC = (patch, what) => editPlay(app, e.id, play => { play.cable = { ...play.cable, ...patch }; if (play.cable.amount === 1) delete play.cable.amount; }, what);
  const rows = [h('div', { class: 'wb-muted wb-small' }, `${nm(a)} → ${nm(b)}: ${cableType(c.slot) === 'notes' ? 'notes' : cableType(c.slot) === 'mod' ? 'it moves a setting' : 'sound'}. A path like any other: reshape it, its ends stay plugged.`)];
  if (a && b && isModule(b)) {
    const p = patchOfDoc(doc), others = p.cables.filter(x => !(x.from === c.from && x.to === c.to && x.slot === c.slot));
    const slots = [...portsOf(b).ins, ...portsOf(b).mods].map(q => q.slot).filter(slot => slot === c.slot || cableAllowed(p.modules, others, { from: c.from, to: c.to, slot }));
    if (slots.length > 1) rows.push(row('Into', selectField(slots.map(s => [s, slotName(s)]), c.slot, v => setC({ slot: v }, 'cable slot'))));
  }
  if (isModSlot(c.slot)) {
    const v = c.amount ?? 1, out = h('span', { class: 'wb-pt-val' }, String(v));
    const input = h('input', { type: 'range', class: 'wb-range', min: -1, max: 1, step: 0.01, value: v });
    input.addEventListener('input', () => { out.textContent = input.value; });
    input.addEventListener('change', () => setC({ amount: Number(input.value) }, 'modulation amount'));
    rows.push(h('label', { class: 'wb-pt-row', title: 'How much it moves the setting (negative: the other way)' }, h('span', {}, 'amount'), input, out));
  }
  rows.push(h('div', { class: 'wb-row' }, h('button', { class: 'wb-btn', onclick: () => app.store.change('unplug', d => { d.elements = d.elements.filter(x => x.id !== e.id); }) }, 'Unplug')));
  return section('Cable', true, ...rows);
}

/** The section for a module or a cable, or null. */
export function modularSection(app, e) {
  if (isModule(e)) return moduleSection(app, e);
  if (isCable(e)) return cableSection(app, e);
  return null;
}

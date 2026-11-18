/**
 * The modular toolbar: its own island (move it by its grip), like the physics one. Sound on or off · the sequencers
 * (Euclid, Grid, Steps, Drums, Bits) · sources (Osc, Noise) and the LFO · instruments · effects and the Output · Cable
 * (click a module, then where it goes) · Path → cable (the selected paths become cables, by what their ends touch) ·
 * ready-made patches. A module is placed with a click on the canvas; with one module selected, the new one is cabled
 * from it. Shown from View → Modular toolbar, the palette (/modular), or when a scene has modules.
 */
import { h } from '../workbench/ui.js';
import { showMenu } from '../workbench/menu.js';
import { KINDS } from '../audio/modular/patch.js';
import { MAIN, boardForPoints } from '../process/boards.js';
import { normalizeElement } from '../process/document.js';
import { moduleMark, plug, makeCable, slotNear, moduleAt, isModule, SIZES, GROUP_COLORS, groupOf } from './model.js';
import { addExample, EXAMPLES } from './examples.js';

const KEY = 'ams_modular_toolbar';
const svg = (d, extra = '') => `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"${extra}>${d}</svg>`;
export const MOD_ICONS = {
  power: svg('<path d="M12 3v8"/><path d="M6.3 6.8a8 8 0 1 0 11.4 0"/>'),
  Euclid: svg('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="4" r="1.6" fill="currentColor"/><circle cx="19.6" cy="14.5" r="1.6" fill="currentColor"/><circle cx="7.3" cy="18.5" r="1.6" fill="currentColor"/><path d="M12 4l7.6 10.5L7.3 18.5z" stroke-width="1" opacity=".6"/>'),
  Grid: svg('<rect x="4" y="4" width="16" height="16" rx="1.5"/><path d="M4 9.3h16M4 14.6h16M9.3 4v16M14.6 4v16" stroke-width="1"/><rect x="5" y="15.5" width="3.5" height="3.5" fill="currentColor" stroke="none"/><rect x="10.2" y="10.2" width="3.5" height="3.5" fill="currentColor" stroke="none"/><rect x="15.5" y="5" width="3.5" height="3.5" fill="currentColor" stroke="none"/>'),
  Steps: svg('<path d="M4 17h3v-4h3v-5h3v7h3v-9h4"/>'),
  Drums: svg('<ellipse cx="12" cy="8" rx="8" ry="3"/><path d="M4 8v8c0 1.7 3.6 3 8 3s8-1.3 8-3V8"/>'),
  Bits: svg('<path d="M5 5v5M9 5h2v5H9zM15 5v5M19 5v5M5 14h2v5H5zM11 14v5M15 14h2v5h-2zM19 14v5"/>'),
  Osc: svg('<path d="M3 12c2-6 4-6 6 0s4 6 6 0 4-6 6 0"/>'),
  Noise: svg('<path d="M3 12l2-5 2 9 2-7 2 6 2-9 2 8 2-5 2 6 2-3"/>'),
  LFO: svg('<path d="M3 15c3-8 6-8 9 0s6 8 9 0" stroke-dasharray="2.5 2"/>'),
  Synth: svg('<rect x="3" y="6" width="18" height="12" rx="1.5"/><path d="M7 6v7M11 6v7M15 6v7M19 6v7" stroke-width="1.2"/>'),
  Karplus: svg('<path d="M3 12h18"/><path d="M6 9c2 2 4 4 6 3s4-2 6-1" stroke-width="1.2"/><circle cx="4" cy="12" r="1.2" fill="currentColor"/><circle cx="20" cy="12" r="1.2" fill="currentColor"/>'),
  Sampler: svg('<path d="M3 12h2M6 9v6M9 6v12M12 8v8M15 5v14M18 9v6M21 12h0"/>'),
  DrumSynth: svg('<rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1" fill="currentColor"/>'),
  Filter: svg('<path d="M3 9h9c3 0 3-2 4 0l5 10"/>'),
  Delay: svg('<path d="M5 18V8M10 18v-7M15 18v-4M20 18v-2"/>'),
  Reverb: svg('<path d="M4 18V6M7 18V9M10 18v-6M13 18v-4M16 18v-3M19 18v-1.5"/>'),
  Scope: svg('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M5 12c2-4 3-4 4 0s3 4 4 0 3-4 4 0 2 2 2 2"/>'),
  Mixer: svg('<path d="M6 4v16M12 4v16M18 4v16"/><rect x="4" y="13" width="4" height="3" fill="currentColor"/><rect x="10" y="7" width="4" height="3" fill="currentColor"/><rect x="16" y="11" width="4" height="3" fill="currentColor"/>'),
  Output: svg('<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/>'),
  cable: svg('<circle cx="5" cy="6" r="2"/><circle cx="19" cy="18" r="2"/><path d="M7 6c8 0 2 12 10 12"/>'),
  pathCable: svg('<path d="M4 18c3-9 7 2 10-6s5-4 6-6" stroke-dasharray="3 2.2"/><circle cx="4" cy="18" r="1.8" fill="currentColor"/><circle cx="20" cy="6" r="1.8" fill="currentColor"/>'),
  more: svg('<circle cx="6" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="18" cy="12" r="1.4" fill="currentColor"/>'),
  examples: svg('<rect x="3" y="5" width="7" height="6" rx="1"/><rect x="14" y="13" width="7" height="6" rx="1"/><path d="M10 8c4 0 0 8 4 8"/>')
};
const LABELS = { Karplus: 'Pluck (Karplus–Strong string)', DrumSynth: 'Drum synth', DrumKit: 'Drum kit (GM)', Osc: 'Oscillator', LFO: 'LFO (moves a setting)' };
const title = kind => `${LABELS[kind] || kind}: ${KINDS[kind].doc}`;

export function mountModularToolbar(app) {
  const island = h('div', { class: 'wb-island wb-phys wb-modbar', 'data-guide': 'modular' });
  const row = h('div', { class: 'wb-phys-row' });
  island.append(row);
  app.stageArea.append(island);
  app.makeMovable(island, 'modular');
  let shown;
  try { shown = localStorage.getItem(KEY) === '1'; } catch { shown = false; }
  const setShown = on => { shown = on; try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* ignore */ } render(); };
  const cv = () => app.canvas;
  const stageId = () => cv().getStage()?.id || app.store.doc.stages[0].id;

  const btn = (icon, tip, run, { on = false, color = '' } = {}) => {
    const b = h('button', { class: `wb-tool${on ? ' on' : ''}`, type: 'button', title: tip, html: icon, onclick: ev => run(ev) });
    if (color) b.style.color = color;
    return b;
  };

  /** Place a module with a click; with one module selected, cable it to the new one. */
  const place = kind => {
    const sel = [...cv().selected].map(id => app.store.doc.elements.find(e => e.id === id)).filter(isModule);
    const from = sel.length === 1 ? sel[0].id : null;
    cv().placeOnce = (x, y) => {
      const [w, hgt] = SIZES[kind] || [120, 70];
      let made = null;
      app.store.change(`add ${kind}`, d => {
        // (one undo step: the module and its cable)
        made = pushElement(d, { ...moduleMark(kind, x - w / 2, y - hgt / 2), stage: stageId() });
        if (from) { const a = d.elements.find(q => q.id === from), slot = a && slotNear(d, a, made); if (slot && !slot.startsWith('mod:')) plug(d, from, made.id, slot); }   // (sound or notes on; modulation is cabled on purpose)
      });
      if (made) { cv().select([made.id]); app.patch?.ensure(); }
      app.log(`${kind} placed${from ? ' and cabled from the selected module' : ''}. Double-click a sequencer's cells to change them; Properties has its settings.`);
    };
    cv().flash(`${LABELS[kind] || kind}: click where it goes`);
    cv().updateCursor();
  };

  /** Cable: click a module (from), then the one it goes to (the slot nearest the click). */
  const cable = () => {
    cv().placeOnce = (x0, y0) => {
      const a = moduleAt(app.store.doc, x0, y0, 8);
      if (!a) { cv().flash('Click on a module first (where the sound or notes come from)'); return; }
      cv().flash('Now click on the module it goes to (near the input you want)');
      cv().placeOnce = (x1, y1) => {
        const b = moduleAt(app.store.doc, x1, y1, 8);
        if (!b || b.id === a.id) { cv().flash('No module there'); return; }
        let ok = false;
        app.store.change('cable', d => { const A = d.elements.find(e => e.id === a.id), B = d.elements.find(e => e.id === b.id), slot = slotNear(d, A, B, x1, y1); ok = Boolean(slot && plug(d, a.id, b.id, slot)); });
        if (!ok) cv().flash(`${a.label || a.play.mod.kind} cannot go into ${b.label || b.play.mod.kind} (or its inputs are taken)`);
        else app.patch?.ensure();
      };
      cv().updateCursor();
    };
    cv().flash('Cable: click the module it comes from');
    cv().updateCursor();
  };

  /** The selected paths become cables (by what their two ends touch). */
  const pathsToCables = () => {
    const ids = [...cv().selected];
    let n = 0;
    app.store.change('paths to cables', d => { for (const id of ids) if (makeCable(d, id)) n++; });
    cv().flash(n ? `${n} cable${n > 1 ? 's' : ''}` : 'Select paths that start on one module and end on another');
  };

  const example = name => {
    const [cx, cy] = cv().toWorld(cv().w / 2 - 300, cv().h / 2 - 150);
    let ids = [];
    const go = bits => {
      app.store.change(`example: ${EXAMPLES[name].label}`, d => { ids = addExample(d, name, Math.round(cx), Math.round(cy), { stage: stageId(), board: app.activeBoard && app.activeBoard !== MAIN ? app.activeBoard : undefined, bits }); });
      cv().select(ids.filter(id => isModule(app.store.doc.elements.find(e => e.id === id))));
      app.patch?.ensure();
      app.log(`${EXAMPLES[name].label}: press Play (Space) on the Timeline to hear the sequencers.`);
    };
    if (name === 'arecibo') import('../../examples/media/arecibo-message.json').then(m => go((m.default?.rows || m.rows || []).join('\n') || undefined)).catch(() => go());
    else go();
  };

  const kindMenu = (ev, kinds) => showMenu(kinds.map(k => ({ label: LABELS[k] || k, hint: KINDS[k].doc, run: () => place(k) })), ev.clientX, ev.clientY);

  function render() {
    island.style.display = shown ? '' : 'none';
    if (!shown) return;
    const on = Boolean(app.patch?.running);
    const col = k => GROUP_COLORS[groupOf(k)];
    const kb = k => btn(MOD_ICONS[k] || MOD_ICONS.more, title(k), () => place(k), { color: col(k) });
    row.replaceChildren(
      btn(MOD_ICONS.power, on ? 'Sound is on (click: off; drones and sources stop)' : 'Sound: on (the Timeline\'s Play turns it on too)', () => { app.patch?.power(!on); setTimeout(render, 50); }, { on }),
      h('div', { class: 'wb-sep' }),
      kb('Euclid'), kb('Grid'), kb('Steps'), kb('Drums'), kb('Bits'),
      h('div', { class: 'wb-sep' }),
      kb('Osc'), kb('Noise'), kb('LFO'),
      h('div', { class: 'wb-sep' }),
      kb('Synth'), kb('Karplus'), kb('Sampler'), kb('DrumSynth'),
      btn(MOD_ICONS.more, 'More instruments', ev => kindMenu(ev, ['DrumKit', 'Granular']), { color: col('Synth') }),
      h('div', { class: 'wb-sep' }),
      kb('Filter'), kb('Delay'), kb('Reverb'), kb('Scope'), kb('Mixer'), kb('Output'),
      btn(MOD_ICONS.more, 'More effects', ev => kindMenu(ev, ['Distortion', 'Gain', 'Merge']), { color: col('Filter') }),
      h('div', { class: 'wb-sep' }),
      btn(MOD_ICONS.cable, 'Cable: click a module, then the one it goes to (near the input you want). Or point from one to the other with the Play tool, or draw a path and make it a cable', cable),
      btn(MOD_ICONS.pathCable, 'Path → cable: the selected paths become cables, by what their two ends touch (draw any path from a module\'s output to another module)', pathsToCables),
      btn(MOD_ICONS.examples, 'Ready-made patches', ev => showMenu([{ label: 'Add to the canvas' }, ...Object.entries(EXAMPLES).map(([k, x]) => ({ label: x.label, hint: x.hint, run: () => example(k) }))], ev.clientX, ev.clientY))
    );
  }

  app.modularToolbar = { toggle: () => setShown(!shown), show: () => setShown(true), get shown() { return shown; }, render, place, example };
  const later = () => {
    if (!app.patch || !app.store) return setTimeout(later, 50);
    app.patch.on(() => render());
    // (a scene with modules shows the toolbar)
    app.store.subscribe(() => { if (!shown && app.store.doc.elements.some(isModule)) setShown(true); });
    render();
  };
  later();
}

/** Push a new mark into a draft document (normalized, on the board it lands on). */
function pushElement(d, e) {
  const el = normalizeElement(e, e.stage || d.stages[0].id);
  const board = boardForPoints(d, el.points);
  if (board && board !== MAIN) el.board = board;
  d.elements.push(el);
  return el;
}

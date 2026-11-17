/**
 * Patch: the node editor for the scene's modular synth (data `doc.transport.patch`, src/audio/modular/patch.js; sound
 * workbench/patchPlayer.js). After genereti's graph and BespokeSynth: modules as boxes, cables between them.
 *
 * - Add a module from the menu; drag a box by its title to move it.
 * - Drag from a box's output (the dot on its right: orange is sound, gold is notes) onto another box (or onto one of
 *   its inputs) to patch a cable; click a cable to take it out.
 * - Select a box to change its settings on the right; ♪ plays a note on it (or, on a sequencer, on what it plays).
 * - Sequencers show their pattern and where they are; cables carrying sound show it.
 * Sequencers play while the Timeline plays; scores reach the instruments through the Mixer (out: Patch).
 */
import { h, selectField } from '../ui.js';
import { icon } from '../icons.js';
import { KINDS, GROUPS, settingsOf, inputsOf, outputOf, isSequencer, isInstrument, addModule, removeModule, moveModule, setSettings, connect, disconnect, freeSlot,
  parseSteps, parseDrumRows, parseRings, parseBits, lengthOf } from '../../audio/modular/patch.js';
import { FACTORY_PRESETS } from '../../audio/modular/presets.js';
import { keyframeDot } from '../keyframeDot.js';

const BOX_W = 168, PORT = 9;
const label = k => k.replace(/_/g, ' ');

export function mountPatch(root, app) {
  const wrap = h('div', { class: 'wb-pt' });
  root.append(wrap);
  let sel = null, shown = null, drag = null, raf = 0;

  const pp = () => app.patch;
  const patch = () => pp()?.patch() || { modules: [], cables: [] };
  const commit = next => pp()?.setPatch(next);

  const bar = h('div', { class: 'wb-pt-top' });
  const field = h('div', { class: 'wb-pt-field' });
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('wb-pt-cables');
  const boxes = h('div', { class: 'wb-pt-boxes' });
  field.append(svg, boxes);
  const side = h('div', { class: 'wb-pt-side' });
  wrap.append(bar, h('div', { class: 'wb-pt-main' }, field, side));

  // ---- the bar ------------------------------------------------------------------------------------------------------
  const kinds = GROUPS.flatMap(g => [[`#${g}`, `— ${g}s —`], ...Object.keys(KINDS).filter(k => KINDS[k].group === g).map(k => [k, k])]);
  const buildBar = () => {
    bar.replaceChildren(
      selectField([['', 'Add a module…'], ...kinds], '', v => {
        if (!v || v.startsWith('#')) return;
        const p = patch(), x = 20 + (p.modules.length % 4) * 200 + field.scrollLeft, y = 20 + Math.floor(p.modules.length / 4) * 150 + field.scrollTop;
        const r = addModule(p, v, x, y); sel = r.id; commit(r.patch);
      }, 'Add a module'),
      selectField([['', 'Start from…'], ['starter', 'Starter: melody, drums, echo'], ['arecibo', 'The Arecibo message, plucked']], '', v => { if (v) loadExample(v); }, 'Replace the patch with a ready-made one'),
      h('span', { class: 'wb-pt-sp' }),
      h('button', { class: 'wb-btn', title: 'Play or pause the Timeline: the sequencers play with it', onclick: () => { pp()?.ensure(); app.player.playing ? app.player.pause() : app.player.play(); } }, app.player.playing ? 'Pause' : 'Play'),
      h('button', { class: 'wb-icon-btn', title: 'Every note off', onclick: () => pp()?.allNotesOff(), html: icon('stop') }));
  };
  async function loadExample(name) {
    if (patch().modules.length && !confirm('Replace this scene’s patch?')) return;
    let bits;
    if (name === 'arecibo') {
      try { const j = await (await fetch(new URL('../../../examples/media/arecibo-message.json', import.meta.url))).json(); bits = j.rows.join('\n'); } catch { /* the small default grid */ }
    }
    pp()?.loadExample(name, bits); sel = null;
  }

  // ---- the boxes ----------------------------------------------------------------------------------------------------
  const portPos = (m, slot) => {
    if (slot === 'out') return [m.x + BOX_W, m.y + 14];
    if (slot === 'notes') return [m.x, m.y + 14];
    const i = inputsOf(m.kind).indexOf(slot);
    return [m.x, m.y + 34 + i * 16];
  };

  const seqView = m => {
    const s = settingsOf(m), c = h('canvas', { class: 'wb-pt-seq', width: BOX_W - 12, height: m.kind === 'Bits' ? 70 : 34 });
    c.dataset.id = m.id;
    c.draw = (step) => {
      const g = c.getContext('2d'), W = c.width, H = c.height;
      g.clearRect(0, 0, W, H);
      const dot = (x, y, r, on, now) => { g.fillStyle = now ? '#f2c14e' : on ? '#c8664f' : '#8884'; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); };
      if (m.kind === 'Steps') {
        const st = parseSteps(s.notes), n = st.length || 1, notes = st.filter(x => x !== null), lo = Math.min(...notes, 60), hi = Math.max(...notes, lo + 1);
        st.forEach((v, i) => dot((i + 0.5) * W / n, v === null ? H - 3 : H - 4 - (v - lo) / (hi - lo) * (H - 8), v === null ? 1.2 : 2.6, v !== null, step !== null && step % n === i));
      } else if (m.kind === 'Drums') {
        const rows = parseDrumRows(s.rows), rh = H / Math.max(1, rows.length);
        rows.forEach((r, j) => r.steps.forEach((v, i) => dot((i + 0.5) * W / r.steps.length, (j + 0.5) * rh, v ? 2.4 : 1, v > 0, step !== null && step % r.steps.length === i)));
      } else if (m.kind === 'Euclid') {
        const rings = parseRings(s.rings);
        rings.forEach((r, j) => { const R = H / 2 - 2 - j * 5; r.pattern.forEach((on, i) => { const a = -Math.PI / 2 + 2 * Math.PI * i / r.pattern.length; dot(W / 2 + R * Math.cos(a), H / 2 + R * Math.sin(a), on ? 2 : 0.8, on, step !== null && step % r.pattern.length === i); }); });
      } else if (m.kind === 'Bits') {
        const grid = parseBits(s.bits), rows = grid.length || 1, w = grid[0]?.length || 1, cell = Math.min(W / w, H / rows);
        const k = step === null ? -1 : step % (rows * w);
        grid.forEach((row, j) => row.forEach((v, i) => { if (v || j * w + i === k) { g.fillStyle = j * w + i === k ? '#f2c14e' : '#c8664f'; g.fillRect(i * cell, j * cell, Math.max(1, cell - 0.4), Math.max(1, cell - 0.4)); } }));
      }
    };
    c.draw(null);
    return c;
  };

  const buildBoxes = () => {
    const p = patch();
    boxes.replaceChildren();
    for (const m of p.modules) {
      const k = KINDS[m.kind], out = outputOf(m.kind);
      const head = h('div', { class: 'wb-pt-head', title: k.doc },
        h('span', { class: 'wb-pt-name' }, m.name || m.id),
        h('span', { class: 'wb-pt-kind' }, m.kind),
        isInstrument(m.kind) || isSequencer(m.kind) ? h('button', { class: 'wb-pt-x', title: 'Play a note on it', onclick: e => { e.stopPropagation(); pp()?.audition(m.id); } }, '♪') : null,
        h('button', { class: 'wb-pt-x', title: 'Remove', onclick: e => { e.stopPropagation(); if (sel === m.id) sel = null; commit(removeModule(patch(), m.id)); } }, '×'));
      const box = h('div', { class: `wb-pt-box g-${k.group}${sel === m.id ? ' is-sel' : ''}`, style: `left:${m.x}px;top:${m.y}px;width:${BOX_W}px`, 'data-id': m.id }, head);
      const s = settingsOf(m);
      const ins = inputsOf(m.kind);
      const shownIns = m.kind === 'Mixer' ? ins.filter((slot, i) => i < 2 || p.cables.some(c => c.to === m.id && c.slot === slot) || p.cables.some(c => c.to === m.id && c.slot === ins[i - 1])) : ins;
      for (const slot of shownIns) box.append(h('div', { class: 'wb-pt-in', 'data-slot': slot, style: `top:${34 + ins.indexOf(slot) * 16 - 6}px` }, h('span', { class: 'wb-pt-port is-audio' }), label(slot.replace('input_', 'in ').replace('in_', 'in '))));
      if (isInstrument(m.kind)) box.append(h('div', { class: 'wb-pt-in', 'data-slot': 'notes', style: 'top:8px' }, h('span', { class: 'wb-pt-port is-notes' })));
      if (out) box.append(h('span', { class: `wb-pt-port wb-pt-out is-${out}`, title: out === 'notes' ? 'Notes: drag to an instrument' : 'Sound: drag to an effect or the Output' }));
      const body = h('div', { class: 'wb-pt-body', style: `min-height:${Math.max(0, shownIns.length * 16 - 6)}px` });
      if (isSequencer(m.kind)) body.append(seqView(m));
      else if (isInstrument(m.kind)) body.append(h('div', { class: 'wb-pt-sum' }, `ch ${s.channel}${s.voice ? ' · ' + s.voice : ''}`));
      else if (m.kind === 'Filter') body.append(h('div', { class: 'wb-pt-sum' }, `${s.mode} ${Math.round(s.cutoff)} Hz`));
      else if (m.kind === 'Delay') body.append(h('div', { class: 'wb-pt-sum' }, `${s.seconds} s · fb ${s.feedback}`));
      else if (m.kind === 'Output') body.append(h('div', { class: 'wb-pt-meter' }, h('div', { class: 'wb-pt-level', 'data-id': m.id })));
      box.append(body);
      head.addEventListener('pointerdown', e => { if (e.target.closest('button')) return; sel = m.id; startMove(e, m); });
      box.addEventListener('pointerdown', e => { if (e.target.closest('.wb-pt-out')) startCable(e, m); else if (!e.target.closest('textarea,input,select,button')) { if (sel !== m.id) { sel = m.id; render(true); } } });
      boxes.append(box);
    }
    const maxX = Math.max(600, ...p.modules.map(m => m.x + BOX_W + 60)), maxY = Math.max(300, ...p.modules.map(m => m.y + 200));
    boxes.style.width = svg.style.width = `${maxX}px`; boxes.style.height = svg.style.height = `${maxY}px`;
  };

  // ---- the cables ---------------------------------------------------------------------------------------------------
  const curve = ([x1, y1], [x2, y2]) => { const dx = Math.max(40, Math.abs(x2 - x1) / 2); return `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`; };
  const drawCables = () => {
    const p = patch(), byId = new Map(p.modules.map(m => [m.id, m]));
    svg.replaceChildren();
    for (const c of p.cables) {
      const a = byId.get(c.from), b = byId.get(c.to);
      if (!a || !b) continue;
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', curve(portPos(a, 'out'), portPos(b, c.slot)));
      path.setAttribute('class', `wb-pt-cable ${c.slot === 'notes' ? 'is-notes' : 'is-audio'}`);
      path.addEventListener('click', () => commit(disconnect(patch(), c)));
      path.appendChild(document.createElementNS('http://www.w3.org/2000/svg', 'title')).textContent = `${c.from} → ${c.to} (${c.slot}): click to remove`;
      svg.append(path);
      if (c.slot !== 'notes') {   // the sound on the cable, drawn at its middle
        const wave = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
        const [x1, y1] = portPos(a, 'out'), [x2, y2] = portPos(b, c.slot);
        wave.setAttribute('class', 'wb-pt-wave'); wave.dataset.from = c.from; wave.dataset.x = (x1 + x2) / 2 - 24; wave.dataset.y = (y1 + y2) / 2;
        svg.append(wave);
      }
    }
    if (drag?.cable) {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', curve(drag.cable.from, drag.cable.to));
      path.setAttribute('class', `wb-pt-cable is-drag ${drag.cable.kind === 'notes' ? 'is-notes' : 'is-audio'}`);
      svg.append(path);
    }
  };

  // ---- dragging -----------------------------------------------------------------------------------------------------
  const local = e => { const r = field.getBoundingClientRect(); return [e.clientX - r.left + field.scrollLeft, e.clientY - r.top + field.scrollTop]; };
  function startMove(e, m) {
    e.preventDefault();
    const [x0, y0] = local(e);
    drag = { move: m.id, dx: x0 - m.x, dy: y0 - m.y, p: patch() };
    const move = ev => { const [x, y] = local(ev); drag.p = moveModule(drag.p, m.id, Math.max(0, Math.round(x - drag.dx)), Math.max(0, Math.round(y - drag.dy))); paintMove(); };
    const up = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); const p = drag.p; drag = null; commit(p); };
    addEventListener('pointermove', move); addEventListener('pointerup', up);
  }
  function paintMove() {   // while moving: only the box and the cables, from the patch being dragged
    const m = drag.p.modules.find(x => x.id === drag.move), el = boxes.querySelector(`[data-id="${CSS.escape(drag.move)}"]`);
    if (el && m) { el.style.left = `${m.x}px`; el.style.top = `${m.y}px`; }
    const keep = drag.p;
    const byId = new Map(keep.modules.map(x => [x.id, x]));
    svg.querySelectorAll('.wb-pt-cable').forEach((path, i) => { const c = keep.cables[i]; if (!c) return; path.setAttribute('d', curve(portPos(byId.get(c.from), 'out'), portPos(byId.get(c.to), c.slot))); });
  }
  function startCable(e, m) {
    e.preventDefault(); e.stopPropagation();
    const kind = outputOf(m.kind);
    drag = { cable: { from: portPos(m, 'out'), to: local(e), kind } };
    const move = ev => { drag.cable.to = local(ev); drawCables(); };
    const up = ev => {
      removeEventListener('pointermove', move); removeEventListener('pointerup', up);
      const target = document.elementFromPoint(ev.clientX, ev.clientY);
      const box = target?.closest?.('.wb-pt-box'), port = target?.closest?.('.wb-pt-in');
      drag = null;
      if (box && box.dataset.id !== m.id) {
        const p = patch(), to = box.dataset.id, slot = port?.dataset.slot && (port.dataset.slot === 'notes') === (kind === 'notes') ? port.dataset.slot : freeSlot(p, m.id, to);
        if (slot) { commit(connect(p, m.id, to, slot)); return; }
        app.log?.(kind === 'notes' ? 'Notes go to an instrument.' : 'No free input there (sound goes into an effect, a mixer or the Output).', 'warn');
      }
      drawCables();
    };
    addEventListener('pointermove', move); addEventListener('pointerup', up);
  }

  // ---- the inspector ------------------------------------------------------------------------------------------------
  const buildSide = () => {
    const m = patch().modules.find(x => x.id === sel);
    if (!m) { side.replaceChildren(h('div', { class: 'wb-pt-hint' }, 'Add modules, drag from a dot on the right of a box to another box to patch it, select a box to set it. Sequencers play while the Timeline plays; a score reaches an instrument through the Mixer (Out: Patch) on the instrument’s channel.')); return; }
    const k = KINDS[m.kind], s = settingsOf(m);
    const set = (key, v) => commit(setSettings(patch(), m.id, { [key]: v }));
    const rows = [h('div', { class: 'wb-pt-title' }, m.name || m.id, h('span', { class: 'wb-pt-kind' }, ` ${m.kind}`)), h('div', { class: 'wb-pt-doc' }, k.doc)];
    const presets = FACTORY_PRESETS[m.kind];
    if (presets) rows.push(h('label', { class: 'wb-pt-row' }, h('span', {}, 'preset'), selectField([['', '…'], ...Object.keys(presets).map(n => [n, n])], '', v => { if (v) commit(setSettings(patch(), m.id, presets[v])); })));
    for (const [key, spec] of Object.entries(k.params)) {
      if (m.kind === 'Mixer' && /_(\d)$/.test(key) && Number(key.match(/_(\d)$/)[1]) > 4) continue;   // (the first four buses here)
      const v = s[key];
      let input;
      if (spec.options) input = selectField(spec.options.map(o => [String(o), String(o)]), String(v), x => set(key, x));
      else if (spec.bool) input = h('input', { type: 'checkbox', checked: v, onchange: e => set(key, e.target.checked) });
      else if (spec.text) { input = h('textarea', { class: 'wb-pt-text', rows: spec.rows || 3, spellcheck: false }); input.value = v; input.addEventListener('change', () => set(key, input.value)); }
      else {
        const step = spec.step || (spec.max - spec.min > 50 ? 1 : spec.max - spec.min > 5 ? 0.01 : 0.001);
        const out = h('span', { class: 'wb-pt-val' }, String(v));
        input = h('input', { type: 'range', class: 'wb-range', min: spec.min, max: spec.max, step, value: v });
        input.addEventListener('input', () => { out.textContent = input.value; });
        input.addEventListener('change', () => set(key, Number(input.value)));
        input.addEventListener('dblclick', () => set(key, spec.def));
        rows.push(h('label', { class: 'wb-pt-row', title: `${label(key)} (double-click: ${spec.def}; ◆ keys it on the Timeline)` }, h('span', {}, label(key)), input, h('span', { class: 'wb-pt-val' }, out, keyframeDot(`patch:${m.id}.${key}`))));
        continue;
      }
      rows.push(h('label', { class: `wb-pt-row${spec.text ? ' is-text' : ''}` }, h('span', {}, label(key)), input));
    }
    side.replaceChildren(...rows);
  };

  // ---- drawing ------------------------------------------------------------------------------------------------------
  function render(force = false) {
    const p = patch();
    if (!force && p === shown) return;
    shown = p;
    if (drag?.move) return;
    buildBar(); buildBoxes(); drawCables(); buildSide();
  }
  const frame = () => {   // live: playheads, the sound on cables, the output's meter
    raf = requestAnimationFrame(frame);
    if (!wrap.isConnected || !wrap.offsetParent) return;
    const player = pp();
    if (!player) return;
    render();
    boxes.querySelectorAll('canvas.wb-pt-seq').forEach(c => c.draw(app.player.playing ? player.stepNow(c.dataset.id) : null));
    svg.querySelectorAll('.wb-pt-wave').forEach(w => {
      const s = player.waveform(w.dataset.from);
      if (!s) { w.setAttribute('points', ''); return; }
      const x0 = Number(w.dataset.x), y0 = Number(w.dataset.y);
      let pts = '';
      for (let i = 0; i < 48; i++) pts += `${x0 + i},${y0 - Math.max(-12, Math.min(12, 60 * s[i * 5]))} `;
      w.setAttribute('points', pts);
    });
    boxes.querySelectorAll('.wb-pt-level').forEach(l => { l.style.width = `${Math.min(100, player.meter(l.dataset.id).peak * 100)}%`; });
  };
  const start = () => { if (!app.patch) { setTimeout(start, 30); return; } app.patch.on(() => render()); render(true); raf = requestAnimationFrame(frame); };
  start();
  app.player.on(() => { const b = bar.querySelector('.wb-btn'); if (b) b.textContent = app.player.playing ? 'Pause' : 'Play'; });
  return () => cancelAnimationFrame(raf);
}

export { lengthOf };

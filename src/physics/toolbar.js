/**
 * The physics toolbar: a separate island (move it by its grip), for the board you are on.
 *   Physics on / off for the board · play / pause · step a frame · reset · apply pose · the clock (Timeline or
 *   free) · Hinge · Motor · Weld · Spring (click where; a spring: its two ends) · what the selection is (a
 *   falling body, ground, kinematic, a sensor, not physical) · debug view · the world (gravity, speed, walls).
 * Shown from the menu (View → Physics toolbar), the palette, or when physics is turned on for a board.
 */
import { h } from '../workbench/ui.js';
import { showMenu } from '../workbench/menu.js';
import { MAIN } from '../process/boards.js';
import { BODY_TYPES, physicsOf, candidatesAt, canBePhysical } from './model.js';

const KEY = 'ams_physics_toolbar';
const svg = (d, extra = '') => `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"${extra}>${d}</svg>`;
export const PHYS_ICONS = {
  physics: svg('<circle cx="12" cy="12" r="1.8" fill="currentColor"/><ellipse cx="12" cy="12" rx="9" ry="3.6"/><ellipse cx="12" cy="12" rx="9" ry="3.6" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="9" ry="3.6" transform="rotate(120 12 12)"/>'),
  play: svg('<path d="M7 5l12 7-12 7z" fill="currentColor"/>'),
  pause: svg('<path d="M8 5v14M16 5v14" stroke-width="2.4"/>'),
  step: svg('<path d="M6 5l9 7-9 7z" fill="currentColor"/><path d="M18 5v14" stroke-width="2.2"/>'),
  rewind: svg('<path d="M12 5l-8 7 8 7z" fill="currentColor"/><path d="M21 5l-8 7 8 7z" fill="currentColor"/>'),
  reset: svg('<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4.5h4.5"/>'),
  apply: svg('<path d="M5 12.5l4.5 4.5L19 7"/>'),
  hinge: svg('<circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/>'),
  motor: svg('<circle cx="12" cy="12" r="6"/><path d="M12 3.5a8.5 8.5 0 0 1 8.2 6.3"/><path d="M20.7 6.5l-.5 3.5-3.4-.9"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/>'),
  weld: svg('<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 9l6 6M15 9l-6 6"/>'),
  spring: svg('<path d="M3 12h3l2-5 3 10 3-10 3 10 2-5h2"/>'),
  body: svg('<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/>'),
  debug: svg('<rect x="4" y="4" width="16" height="16" rx="2" stroke-dasharray="2.5 2.5"/><circle cx="12" cy="12" r="2"/>'),
  world: svg('<path d="M12 4v13M7 12l5 5 5-5"/><path d="M5 20h14"/>')
};
const TYPE_NAMES = { auto: 'Physical, automatic (closed falls, open is ground, a point is a ball)', dynamic: 'Falls and collides (dynamic)', static: 'Ground: fixed (static)', kinematic: 'Moves only as told (kinematic)', sensor: 'A sensor: felt, not solid', none: 'Not physical (the default)' };

export function mountPhysicsToolbar(app) {
  const island = h('div', { class: 'wb-island wb-phys', 'data-guide': 'physics' });
  const row = h('div', { class: 'wb-phys-row' });
  island.append(row);
  app.stageArea.append(island);
  app.makeMovable(island, 'physics');
  let shown;
  try { shown = localStorage.getItem(KEY) === '1'; } catch { shown = false; }
  const setShown = on => { shown = on; try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* ignore */ } render(); };

  const P = () => app.physics;
  const board = () => app.activeBoard || MAIN;
  const btn = (icon, title, run, { on = false, disabled = false } = {}) => h('button', { class: `wb-tool${on ? ' on' : ''}`, type: 'button', title, disabled, html: icon, onclick: ev => run(ev) });

  /** One click on the canvas puts a joint there (a spring: two clicks, its ends). */
  const place = (kind, extra = {}) => {
    const cv = app.canvas;
    const make = (pts, play, role = 'point') => {
      // What is under it becomes physical (as drawn) if it is not yet: a hinge over a wheel is a wheel in the world.
      const board = app.activeBoard || MAIN, under = [...new Set(pts.flatMap(([x, y]) => candidatesAt(app.store.doc, board, x, y).slice(0, 2)))];
      if (under.length) app.store.change('make physical', d => { for (const e of d.elements) if (under.includes(e.id)) e.play = { ...(e.play || {}), phys: { ...(e.play?.phys || {}), type: 'auto' } }; });
      const el = cv.commitNew(role, pts.map(([x, y]) => [x, y, 0, 0.5]), { play, realize: role === 'point' ? { brush: 'dot', params: { size: 9 } } : { brush: 'ink', params: { width: 2 } } });
      app.log(`${kind[0].toUpperCase()}${kind.slice(1)} placed${play.hinge?.motor ? ' (with a motor)' : ''}: it holds what is under it.`);
      return el;
    };
    if (kind === 'spring') {
      cv.placeOnce = (x0, y0) => { app.canvas.flash('Now the other end'); cv.placeOnce = (x1, y1) => make([[x0, y0], [x1, y1]], { spring: {} }, 'line'); cv.updateCursor(); };
      app.canvas.flash('Spring: click one end, then the other');
    } else {
      cv.placeOnce = (x, y) => make([[x, y]], kind === 'motor' ? { hinge: { motor: { speed: 120, torque: 1000 }, ...extra } } : { [kind]: true });
      app.canvas.flash(kind === 'motor' ? 'Motor: click on a wheel (it turns it; on two things, one turns the other)' : kind === 'hinge' ? 'Hinge: click on something (it pins it there; on two things, it joins them)' : 'Weld: click where two things overlap (it glues them)');
    }
    cv.updateCursor();
  };

  /** The selection's physical role. */
  const setType = type => {
    const ids = [...app.canvas.selected];
    if (!ids.length) { app.canvas.flash('Select marks first'); return; }
    app.store.change('physics role', d => {
      for (const e of d.elements) {
        if (!ids.includes(e.id)) continue;
        const play = { ...(e.play || {}) };
        if (!canBePhysical(e)) continue;
        if (type === 'none') { const ph = { ...(play.phys || {}) }; delete ph.type; if (Object.keys(ph).length) play.phys = ph; else delete play.phys; }
        else play.phys = { ...(play.phys || {}), type };
        if (Object.keys(play).length) e.play = play; else delete e.play;
      }
    });
  };

  const worldItems = (id, w) => [
    { label: 'Gravity', items: [['None', 0], ['Moon (1.6)', 1.6], ['Earth (9.8)', 9.8], ['Strong (20)', 20], ['Up (−9.8)', -9.8]].map(([l, g]) => ({ label: l, active: (w.gravity?.[1] ?? 9.8) === g && !(w.gravity?.[0]), run: () => P().setWorld(id, { gravity: [0, g] }) })) },
    { label: 'Speed', items: [0.25, 0.5, 1, 2, 4].map(s => ({ label: `${s}×`, active: (w.speed ?? 1) === s, run: () => P().setWorld(id, { speed: s }) })) },
    { label: 'Scale', hint: 'Pixels in a metre: how big the drawing is to physics (smaller: things are bigger and fall slower to the eye)', items: [25, 50, 100, 200].map(s => ({ label: `${s} px a metre`, active: (w.ppm ?? 50) === s, run: () => P().setWorld(id, { ppm: s }) })) },
    { label: 'Precision', hint: 'Solver iterations: more holds joints and stacks steadier, and costs more', items: [2, 4, 8, 16].map(s => ({ label: `${s}`, active: (w.iterations ?? 4) === s, run: () => P().setWorld(id, { iterations: s }) })) },
    { label: w.walls === false ? 'Floor and sides: off' : 'Floor and sides: on', hint: 'The board\'s edges hold things in (no ceiling)', run: () => P().setWorld(id, { walls: w.walls === false }) },
    '-',
    { label: 'Physics off for this board', run: () => P().setWorld(id, null) }
  ];

  let built = '', timeEl = null;
  function render() {
    const id = board(), w = P()?.settings(id);
    island.style.display = shown ? '' : 'none';
    if (!shown) return;
    const st = P()?.boards.get(id), running = P()?.running(id);
    // (rebuilt only when what it shows changes: frames only move the time, so its buttons stay put under the pointer)
    const rewinding = Boolean(P()?.rewinding(id));
    const sig = JSON.stringify([id, w, running, rewinding, Boolean(st?.n), Boolean(P()?.debug)]);
    if (sig === built && timeEl?.isConnected) { timeEl.textContent = `${(st?.t || 0).toFixed(2)} s`; return; }
    built = sig;
    const items = [
      btn(PHYS_ICONS.physics, w ? 'Physics is on for this board (click: the world settings)' : 'Physics: turn it on for this board (what is drawn falls, rolls and collides)', ev => {
        if (!w) { P().setWorld(id, {}); return; }
        showMenu(worldItems(id, w), ev.clientX, ev.clientY);
      }, { on: Boolean(w) })
    ];
    if (w) {
      items.push(
        h('div', { class: 'wb-sep' }),
        btn(PHYS_ICONS.rewind, `${rewinding ? 'Stop rewinding' : 'Rewind: run the world backwards (twice as fast) to its start'}${w.clock === 'free' ? '' : ' (the Timeline\'s playhead goes back with it)'}`, () => P().rewind(id), { on: rewinding, disabled: !st?.n && !rewinding }),
        btn(running ? PHYS_ICONS.pause : PHYS_ICONS.play, `${running ? 'Pause' : 'Play'}${w.clock === 'free' ? ' (its own clock)' : ' (the Timeline)'}`, () => P().toggle(id), { on: running }),
        btn(PHYS_ICONS.step, 'Step one frame (1/60 s); Shift: one frame back', ev => P().step(id, ev?.shiftKey ? -1 : 1)),
        btn(PHYS_ICONS.reset, 'Reset: back to the drawing', () => P().reset(id)),
        btn(PHYS_ICONS.apply, 'Apply pose: where things are now becomes the drawing (one undo step)', () => { if (!P().applyPose(id)) app.canvas.flash('Nothing has moved yet'); }, { disabled: !st?.n }),
        h('select', { class: 'wb-select wb-phys-clock', title: 'Its clock: the Timeline\'s playhead (play, scrub, loop) or its own (free-running)', onchange: e => P().setWorld(id, { clock: e.target.value }) },
          h('option', { value: 'transport', selected: w.clock !== 'free' }, 'Timeline'), h('option', { value: 'free', selected: w.clock === 'free' }, 'Free')),
        timeEl = h('span', { class: 'wb-phys-time', title: 'Where the world is: seconds of simulation' }, `${(st?.t || 0).toFixed(2)} s`),
        h('div', { class: 'wb-sep' }),
        btn(PHYS_ICONS.hinge, 'Hinge: click on something to pin it there, or where two things overlap to join them', () => place('hinge')),
        btn(PHYS_ICONS.motor, 'Motor: a hinge that turns (click on a wheel)', () => place('motor')),
        btn(PHYS_ICONS.weld, 'Weld: click where two things overlap to glue them', () => place('weld')),
        btn(PHYS_ICONS.spring, 'Spring: click one end, then the other', () => place('spring')),
        btn(PHYS_ICONS.body, 'What the selected marks are: falling, ground, kinematic, a sensor, not physical', ev => showMenu([{ label: 'The selection is' }, ...['auto', ...BODY_TYPES].map(t => ({ label: TYPE_NAMES[t], run: () => setType(t) }))], ev.clientX, ev.clientY)),
        h('div', { class: 'wb-sep' }),
        btn(PHYS_ICONS.debug, 'Show the colliders and joints', () => { P().debug = !P().debug; app.canvas.invalidate(); render(); }, { on: Boolean(P().debug) })
      );
    }
    row.replaceChildren(...items);
  }

  app.physicsToolbar = { toggle: () => setShown(!shown), show: () => setShown(true), get shown() { return shown; }, render };
  const later = () => { if (!app.physics) return setTimeout(later, 50); app.physics.on(() => render()); app.store.subscribe(() => render()); app.on('board', () => render()); app.on('selection', () => render()); render(); };
  later();
  // (turning physics on anywhere shows the toolbar)
  const watch = () => { if (!app.store) return setTimeout(watch, 50); app.store.subscribe(() => { if (!shown && (physicsOf(app.store.doc.artboard) || (app.store.doc.boards || []).some(b => physicsOf(b)))) setShown(true); }); };
  watch();
}

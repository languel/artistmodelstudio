/** Settings: the artboard (size, paper), the workspace (theme, grid, reference), and the guide. */
import { h, row, numberField, selectField, section } from '../ui.js';
import { colorField } from '../colorPicker.js';

const PRESETS = [
  ['square', 'Square', 1000, 1000], ['a4', 'A4', 794, 1123], ['letter', 'Letter', 816, 1056], ['4:3', '4 : 3', 1200, 900],
  ['3:2', '3 : 2', 1200, 800], ['16:9', '16 : 9', 1600, 900], ['sketchbook', 'Sketchbook spread', 1400, 1000], ['strip', 'Long strip', 1600, 500]
];
const ls = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch { return null; } return v; };

export function mountSettings(root, app) {
  const setArtboard = patch => app.store.change('artboard', d => { d.artboard = { ...d.artboard, ...patch }; });
  const render = () => {
    // The panel may mount during startup, before the canvas and guide exist.
    if (!app.canvas || !app.guide) { setTimeout(render, 30); return; }
    const ab = app.store.doc.artboard;
    const preset = PRESETS.find(([, , w, hh]) => (w === ab.width && hh === ab.height) || (w === ab.height && hh === ab.width))?.[0] || 'custom';
    root.replaceChildren(
      section('Artboard', true,
        row('Preset', selectField([...PRESETS.map(([id, label, w, hh]) => [id, `${label} · ${w}×${hh}`]), ['custom', 'Custom']], preset, v => {
          const p = PRESETS.find(x => x[0] === v); if (!p) return;
          const landscape = ab.width >= ab.height;
          const [w, hh] = p[2] >= p[3] === landscape || p[2] === p[3] ? [p[2], p[3]] : [p[3], p[2]];
          setArtboard({ width: w, height: hh }); app.canvas.fit();
        })),
        row('Width', numberField({ value: ab.width, min: 50, max: 10000, step: 10, def: 1000, onChange: v => setArtboard({ width: Math.round(v) }) })),
        row('Height', numberField({ value: ab.height, min: 50, max: 10000, step: 10, def: 1000, onChange: v => setArtboard({ height: Math.round(v) }) })),
        h('div', { class: 'wb-row wb-row-actions' },
          h('button', { class: 'wb-btn', title: 'Swap width and height', onclick: () => { setArtboard({ width: ab.height, height: ab.width }); app.canvas.fit(); } }, 'Rotate'),
          h('button', { class: 'wb-btn', title: 'Fit the artboard in view (F)', onclick: () => { app.canvas.fit(); app.renderChrome(); } }, 'Fit')),
        row('Paper', colorField(ab.ground, v => setArtboard({ ground: v }), { title: 'Paper', fallback: '#f3efe6', app }))),
      section('Workspace', true,
        row('Theme', selectField([['dark', 'Dark'], ['light', 'Light']], document.documentElement.dataset.theme === 'light' ? 'light' : 'dark', v => { if ((document.documentElement.dataset.theme === 'light') !== (v === 'light')) app.toggleTheme(); })),
        row('Accent', colorField(getComputedStyle(document.documentElement).getPropertyValue('--wb-accent-2').trim() || '#c8664f', v => app.setAccent(v), { title: 'Accent: record, playhead, points', fallback: '#c8664f', app }), 'The warm accent: record, the playhead, marks’ points'),
        row('Background', h('span', { class: 'wb-row-inline' },
          colorField(app.background && app.background !== 'default' && app.background !== 'transparent' ? app.background : getComputedStyle(document.documentElement).getPropertyValue('--wb-canvas').trim() || '#1b1b1b', v => app.setBackground(v), { title: 'The workspace behind the boards (lower its opacity to see through it)', fallback: '#1b1b1b', app }),
          h('button', { class: `wb-icon-btn${app.background === 'transparent' ? ' on' : ''}`, title: 'Transparent: the window shows what is behind it (/transparent in the palette)', html: '<svg viewBox="0 0 24 24" width="14" height="14"><rect x="4" y="4" width="16" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-dasharray="3 2"/></svg>', onclick: () => app.setBackground(app.background === 'transparent' ? 'default' : 'transparent') }),
          h('button', { class: 'wb-icon-btn', title: 'The theme’s background', html: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4h4"/></svg>', onclick: () => app.setBackground('default') })), 'The workspace behind the boards'),
        row('Reference', numberField({ value: app.reference?.opacity ?? Number(ls('ams_ref_opacity') ?? 0.35), min: 0, max: 1, step: 0.05, def: 0.35, title: 'How strongly the reference picture shows under the drawing (0 = hidden, 1 = full)', onChange: v => { ls('ams_ref_opacity', String(v)); if (app.reference) { app.reference.opacity = v; app.canvas.invalidate(); } } }), 'Reference picture: how strongly it shows under the drawing (R toggles it)')),
      section('Drawing', true,
        row('Lazy', numberField({ value: app.lazy.radius, min: 0, max: 200, step: 1, def: 0, title: 'The pen trails the cursor on a string this long (screen px): wobbles smaller than the string never reach the line, corners get rounded. 0 = off. Also on right-click of the grid button', onChange: v => app.setLazy({ radius: v }) }), 'Lazy drawing: steadier lines'),
        row('Simplify', numberField({ value: app.lazy.simplify || 0, min: 0, max: 40, step: 0.5, def: 0, title: 'On release, points the line does not need are dropped: how far (screen px) the shape may move. 0 = off', onChange: v => app.setLazy({ simplify: v }) })),
        row('Smoothing', numberField({ value: app.lazy.smoothing, min: 0, max: 0.95, step: 0.01, def: 0, title: 'Each step the pen covers only part of the way (0.5 = half): higher is smoother and lags more. 0 = off', onChange: v => app.setLazy({ smoothing: v }) }))),
      section('Export', true,
        row('p5.js', selectField([['2', '2.x (latest)'], ['1', '1.x']], app.p5Version(), v => { try { localStorage.setItem('ams_p5_version', v); } catch { /* ignore */ } }), 'The p5.js version p5 exports target: 2.x uses splineVertex, 1.x curveVertex')),
      soundSection(app),
      gridSection(app),
      section('Guide', true,
        row('Show agents', check(app.guide.enabled, v => { app.guide.enabled = v; ls('ams_guide_enabled', v ? '1' : '0'); }, 'Move a cursor and narrate when an agent or walkthrough acts')),
        row('Pace', selectField([['0', 'Instant'], ['0.5', 'Fast'], ['1', 'Normal'], ['2', 'Slow']], String(app.guide.pace), v => { app.guide.pace = Number(v); ls('ams_guide_pace', v); })))
    );
  };
  app.store.subscribe(render);
  render();
}

function check(on, onChange, title) {
  const c = h('input', { type: 'checkbox', checked: on, title });
  c.addEventListener('change', () => onChange(c.checked));
  return c;
}

function gridSection(app) {
  const g = app.canvas.grid, set = patch => { app.canvas.setGrid(patch); };
  return section('Grid', true,
    row('Show', selectField([['off', 'Off'], ['paper', 'On the paper'], ['everywhere', 'Everywhere']], g.show || 'paper', v => set({ show: v }))),
    row('Style', selectField([['lines', 'Lines'], ['dots', 'Dots']], g.style, v => set({ style: v }))),
    row('Spacing', numberField({ value: g.spacing, min: 5, max: 1000, step: 1, def: 100, title: 'Between major lines, in artboard units', onChange: v => set({ spacing: v }) })),
    row('Subdivisions', numberField({ value: g.subdivisions, min: 1, max: 20, step: 1, def: 4, title: 'Minor divisions per major square (1 = none)', onChange: v => set({ subdivisions: Math.round(v) }) })),
    row('Color', colorField(g.color, v => set({ color: v }), { title: 'Grid color', fallback: '#8a837840', app })),
    row('Snap', check(g.snap, v => set({ snap: v }), 'Points, notes, guides and moved selections land on the grid (subdivisions)')));
}

/** Where a score is heard: the built-in General MIDI sound, and a MIDI port. */
function soundSection(app) {
  const sc = app.score;
  if (!sc) return section('Sound', false);
  const ports = sc.midi.ports();
  return section('Sound', false,
    row('Built-in', check(sc.prefs.gm, v => { sc.setSound({ gm: v }); }, 'Play scores with the built-in General MIDI sound'), 'The built-in General MIDI sound (no MIDI hardware needed)'),
    row('MIDI', h('span', { class: 'wb-row-inline' },
      selectField([['none', 'None'], ['all', 'All ports'], ...ports.map(p => [p.id, p.name])], sc.midi.selected, v => { sc.setSound({ midi: v }); app.store.emit('sound'); }, 'A MIDI output for scores'),
      h('button', { class: 'wb-btn', title: 'Ask the browser for MIDI access', onclick: () => sc.connectMidi().then(() => app.store.emit('sound')).catch(e => app.log(`MIDI: ${e.message}`, 'error')) }, sc.midi.connected ? 'Refresh' : 'Connect')), 'A MIDI output port, for real instruments'),
    row('Instruments', h('button', { class: 'wb-btn', title: 'Per-channel instruments, routes, volume, mute and solo, and the scale filter', onclick: () => app.docks.open('mixer') }, 'Open mixer')),
    h('div', { class: 'wb-row wb-row-actions' },
      h('button', { class: 'wb-btn', title: 'Play a short chord on the outputs', onclick: () => sc.test() }, 'Test'),
      h('button', { class: 'wb-btn', title: 'Everything off', onclick: () => sc.panic() }, 'Stop all')));
}

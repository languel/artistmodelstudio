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
        row('Grid', check(app.canvas.showGrid !== false, v => { app.canvas.showGrid = v; ls('ams_grid', v ? '1' : '0'); app.canvas.invalidate(); }, 'Dot grid on the canvas')),
        row('Reference', numberField({ value: app.reference?.opacity ?? Number(ls('ams_ref_opacity') ?? 0.35), min: 0, max: 1, step: 0.05, def: 0.35, title: 'Reference underlay opacity', onChange: v => { ls('ams_ref_opacity', String(v)); if (app.reference) { app.reference.opacity = v; app.canvas.invalidate(); } } }))),
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

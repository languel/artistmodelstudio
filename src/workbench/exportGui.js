/**
 * A three.js sketch's controls as lil-gui (the GUI three.js's own examples use): after each value a line adds its control to one
 * GUI, through a small getter/setter object, so the sketch's own variable is the live value and its code is not rewritten.
 *   let speed = 1 /* 0..3 *​/        →   gui.add(live(() => speed, v => { speed = v; }), 'v', 0, 3, 0.01).name('speed');
 * lil-gui comes from three's addons, so it is wherever three/addons is (an import map, Vite, esm.sh).
 */
import { findControls } from '../process/controls.js';
import { controlSpecs } from './controlsPanel.js';

const IMPORT = `import { GUI } from 'three/addons/libs/lil-gui.module.min.js';\n`;
const HELPERS = `const gui = new GUI();\nconst live = (get, set) => ({ get v() { return get(); }, set v(x) { set(x); } });\n`;

export function guiCode(code) {
  const specs = new Map(controlSpecs(code).map(s => [s.name, s]));
  const cs = findControls(code).filter(c => c.live && c.name && c.decl && specs.has(c.name)).sort((a, b) => b.from - a.from);
  if (!cs.length) return code;
  let out = code;
  for (const c of cs) {
    const s = specs.get(c.name), n = JSON.stringify(c.name), at = `live(() => ${c.name}, v => { ${c.name} = v; })`;
    const line = s.kind === 'range' ? `gui.add(${at}, 'v', ${s.min}, ${s.max}, ${s.step}).name(${n});`
      : s.kind === 'toggle' ? `gui.add(${at}, 'v').name(${n});`
      : s.kind === 'select' ? `gui.add(${at}, 'v', ${JSON.stringify(s.options)}).name(${n});`
      : s.kind === 'color' ? `gui.addColor(${at}, 'v').name(${n});`
      : `{ const f = gui.addFolder(${n}); ${c.name}.forEach((_, i) => f.addColor(live(() => ${c.name}[i], v => { ${c.name}[i] = v; }), 'v').name(String(i + 1))); }`;
    out = out.slice(0, c.decl.end) + `; ${line}` + out.slice(c.decl.end);
  }
  // the GUI is made before the first control's declaration; the import goes at the top (imports are hoisted)
  const first = Math.min(...cs.map(c => c.decl.kwFrom));
  out = out.slice(0, first) + HELPERS + out.slice(first);
  return IMPORT + out;
}

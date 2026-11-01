// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from 'vitest';
import { mountPanel, controlSpecs } from '../src/workbench/controlsPanel.js';
import { panelOf, findControls } from '../src/process/controls.js';

const code = "// @panel hidden\nconst speed = 1 /* 0..4 */;\nconst spin = true /* toggle */\nconst shape = 'box' /* box|sphere */\n";

describe('// @panel', () => {
  it('says how the panel starts', () => {
    expect(panelOf('// @panel open\nconst a = 1')).toBe('open');
    expect(panelOf('const a = 1\n  // @panel hidden')).toBe('hidden');
    expect(panelOf('// @panel off')).toBe('off');
    expect(panelOf('// @panel sideways')).toBeNull();
    expect(panelOf('const x = "// @panel open"')).toBeNull();   // (a line of its own)
    expect(panelOf('')).toBeNull();
  });
  it('is only a comment: the controls are the same with it', () => {
    expect(findControls(code).length).toBe(3);
    expect(controlSpecs(code).map(s => s.name)).toEqual(['speed', 'spin', 'shape']);
  });
});

describe('the panel on a board', () => {
  let host;
  afterEach(() => host?.remove());
  const mount = (opts = {}) => {
    host = document.createElement('div'); document.body.append(host);
    const changed = [];
    const api = mountPanel(controlSpecs(code), code, (n, v) => changed.push([n, v]), { id: 'ams-ui-b1', container: host, code: false, keys: false, ...opts });
    return { api, changed, box: () => host.querySelector('.p'), root: () => host.querySelector('#ams-ui-b1') };
  };

  it('lies on the board it is given, open or only a gear, with no code glyph, and goes with the board', () => {
    let m = mount();
    expect(m.root().style.position).toBe('absolute');
    expect(m.box().hidden).toBe(false);
    expect(m.api.isOpen()).toBe(true);
    expect(host.querySelector('.f')).toBeNull();   // (no code glyph: the code is beside the board)
    expect(host.querySelectorAll('.l').length).toBe(3);
    m.api.destroy();
    expect(host.querySelector('#ams-ui-b1')).toBeNull();
    m = mount({ start: 'hidden' });
    expect(m.box().hidden).toBe(true);
    expect(m.api.isOpen()).toBe(false);
  });

  it('reports a change, and two panels do not share ids or styles', () => {
    const m = mount();
    const slider = m.box().querySelector('input[type=range]');
    slider.value = 3; slider.dispatchEvent(new Event('input', { bubbles: true }));
    expect(m.changed).toEqual([['speed', 3]]);
    const other = document.createElement('div'); document.body.append(other);
    const b = mountPanel(controlSpecs(code), code, () => {}, { id: 'ams-ui-b2', container: other, code: false, keys: false });
    expect(document.querySelectorAll('#ams-ui-b1').length + document.querySelectorAll('#ams-ui-b2').length).toBe(2);
    b.destroy(); other.remove();
  });

  it('H and Shift+H (when asked to take keys): show or hide the panel, and Shift+H starts it again as it was', () => {
    const m = mount({ keys: false });
    const key = (k, shift = false) => m.api.onKey({ key: k, shiftKey: shift, target: document.body });
    key('H', true); expect(m.api.isOpen()).toBe(false);
    key('H', true); expect(m.api.isOpen()).toBe(true);
    key('h'); expect(m.api.isOpen()).toBe(false);
  });
});

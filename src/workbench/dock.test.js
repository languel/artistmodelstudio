// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { DockManager } from './dock.js';

const mem = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; };
const stubRoot = () => ({ querySelector: () => null });

describe('closing a floating panel', () => {
  let dock;
  beforeEach(() => {
    globalThis.localStorage = mem();
    dock = new DockManager(stubRoot());
    dock.render = () => {};   // (no interface in this test: the layout state is what is checked)
    dock.register({ id: 'assistant', title: 'Assistant', icon: 'chat', natural: 'right' });
    dock.register({ id: 'scenes', title: 'Scenes', icon: 'scenes', natural: 'left' });
    dock.register({ id: 'timeline', title: 'Timeline', icon: 'x', natural: 'bottom', allowBottom: true });
  });

  it('returns to the dock it was taken from, in front', () => {
    dock.move('assistant', 'left');            // moved to the left dock
    dock.move('assistant', 'floating', { x: 10, y: 10 });
    expect(dock.placement('assistant')).toBe('floating');
    dock.close('assistant');
    expect(dock.placement('assistant')).toBe('left');
    expect(dock.state.panels.assistant.open).toBe(true);
    expect(dock.state.active.left).toBe('assistant');
    expect(dock.state.collapsed.left).toBe(false);
  });
  it('a panel that began floating goes to its natural dock', () => {
    dock.state.panels.scenes.placement = 'floating';
    dock.close('scenes');
    expect(dock.placement('scenes')).toBe('left');
  });
  it('a docked panel just closes', () => {
    dock.close('assistant');
    expect(dock.placement('assistant')).toBe('right');
    expect(dock.state.panels.assistant.open).toBe(false);
  });
  it('a bottom panel that cannot go back there goes right', () => {
    dock.move('timeline', 'floating');
    dock.panels.get('timeline').allowBottom = false;
    dock.close('timeline');
    expect(dock.placement('timeline')).toBe('right');
  });

  it('a drop over a dock\'s tab bar docks it there; elsewhere in the middle it floats', () => {
    const mk = dock => { const d = document.createElement('div'); d.dataset.dock = dock; const bar = document.createElement('div'); bar.className = 'wb-tabs'; const tab = document.createElement('button'); bar.append(tab); d.append(bar); document.body.append(d); return { d, bar, tab }; };
    const left = mk('left'), bottom = mk('bottom'), body = document.createElement('div'); document.body.append(body);
    document.elementsFromPoint = () => [left.tab, left.bar];
    expect(dock.dockTarget(500, 300, true)).toBe('left');
    document.elementsFromPoint = () => [bottom.tab, bottom.bar];
    expect(dock.dockTarget(500, 300, true)).toBe('bottom');
    expect(dock.dockTarget(500, 300, false)).toBe('right');   // (a panel that cannot go to the bottom)
    document.elementsFromPoint = () => [body];
    expect(dock.dockTarget(500, 300, true)).toBe('floating');
  });
});

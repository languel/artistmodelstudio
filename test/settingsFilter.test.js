// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { filterSettings } from '../src/workbench/panels/settings.js';

const build = () => {
  const root = document.createElement('div');
  root.innerHTML = `
    <details class="wb-section" open><summary>Grid</summary><label class="wb-row" title="Between major lines">Spacing<input></label><label class="wb-row">Snap<input type="checkbox"></label></details>
    <details class="wb-section" open><summary>Model</summary><label class="wb-row">Engine<select><option>Ollama</option><option>OpenRouter</option></select></label><div class="wb-sub">Asking</div><label class="wb-row" title="Lower: steadier">Temperature<input></label></details>
    <details class="wb-section"><summary>Sound</summary><label class="wb-row">MIDI<select><option>None</option></select></label></details>`;
  return root;
};
const shown = root => [...root.querySelectorAll('.wb-row, .wb-sub')].filter(e => !e.hidden && !e.closest('[hidden]')).map(e => e.firstChild.textContent.trim());

describe('settings search', () => {
  it('keeps the rows that match every word, and opens their sections', () => {
    const root = build();
    expect(filterSettings(root, 'snap')).toBe(true);
    expect(shown(root)).toEqual(['Snap']);
    expect(root.querySelectorAll('details')[2].hidden).toBe(true);
    expect(root.querySelectorAll('details')[0].open).toBe(true);
  });
  it('matches hints and choices, and keeps a sub-heading with its rows', () => {
    const root = build();
    filterSettings(root, 'steadier');
    expect(shown(root)).toEqual(['Asking', 'Temperature']);
    filterSettings(root, 'openrouter');
    expect(shown(root)).toEqual(['Engine']);
  });
  it('a section title shows the whole section; no match says so; clearing restores', () => {
    const root = build();
    filterSettings(root, 'grid');
    expect(shown(root)).toEqual(['Spacing', 'Snap']);
    expect(filterSettings(root, 'zzzz')).toBe(false);
    filterSettings(root, '');
    expect(shown(root)).toEqual(['Spacing', 'Snap', 'Engine', 'Asking', 'Temperature', 'MIDI']);
    expect(root.querySelectorAll('details')[2].open).toBe(false);
  });
});

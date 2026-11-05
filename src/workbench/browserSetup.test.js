import { describe, it, expect, beforeAll } from 'vitest';
import { browserSetup, BROWSER_TIERS } from './browserSetup.js';
import { codeTarget, currentEngine } from './modelStore.js';

beforeAll(() => {
  const m = new Map();
  globalThis.localStorage = { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) };
});

describe('browser-only setup', () => {
  const app = { artists: new Map([['lfm3', { setModel() {} }], ['webgpu', { setModel(id) { this.m = id; }, m: '' }]]) };
  it('puts LFM3-Omni on conversation and a browser coder on code', () => {
    expect(browserSetup(app, 'light')).toBe('light');
    expect(currentEngine()).toBe('lfm3');
    expect(codeTarget()).toEqual({ engine: 'webgpu', model: BROWSER_TIERS.light.code });
    expect(app.artists.get('webgpu').m).toBe(BROWSER_TIERS.light.code);
  });
  it('the standard tier uses the bigger coder, and an unknown tier means standard', () => {
    expect(browserSetup(app, 'standard')).toBe('standard');
    expect(codeTarget().model).toBe('onnx-community/Qwen3-4B-Instruct-2507-ONNX');
    expect(browserSetup(app, 'nonsense')).toBe('standard');
  });
});

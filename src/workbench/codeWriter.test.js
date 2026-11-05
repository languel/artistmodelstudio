import { describe, it, expect, beforeAll } from 'vitest';
import { codeOf, codeModel, CODE_SYSTEM } from './codeWriter.js';
import { setCodeTarget } from './modelStore.js';

beforeAll(() => {   // (a small localStorage: the model store keeps its settings there)
  const m = new Map();
  globalThis.localStorage = { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) };
});

describe('the code in a model reply', () => {
  it('takes the last fenced block (drafts may come first) and drops thinking', () => {
    expect(codeOf('Here:\n```js\nconst a = 1\n```\nand better:\n```js\nconst b = 2\n```')).toBe('const b = 2');
    expect(codeOf('<think>```js\nbad\n```</think>\n```js\ngood()\n```')).toBe('good()');
    expect(codeOf('```javascript\npoint(0.5, 0.5)\n```')).toBe('point(0.5, 0.5)');
  });
  it('reads a block that was never closed, and a reply with no fence at all', () => {
    expect(codeOf('```js\npoint(0.1, 0.1)\nline([[0,0],[1,1]])')).toBe('point(0.1, 0.1)\nline([[0,0],[1,1]])');
    expect(codeOf('point(0.5, 0.5)')).toBe('point(0.5, 0.5)');
    expect(codeOf('')).toBe('');
  });
});

describe('who writes the code', () => {
  const app = { artists: new Map([['ollama', { getModel: () => 'chat-model:7b', complete() {} }], ['webgpu', { getModel: () => 'x', complete() {} }]]) };
  it('is the assistant’s own model until a code model is set', () => {
    setCodeTarget('', '');
    const w = codeModel(app);
    expect(w.own).toBe(true);
    expect(w.model).toBe('chat-model:7b');
  });
  it('is the code model once one is set, with its own engine and model', () => {
    setCodeTarget('webgpu', 'onnx-community/Qwen3-4B-Instruct-2507-ONNX');
    const w = codeModel(app);
    expect(w).toMatchObject({ engine: 'webgpu', model: 'onnx-community/Qwen3-4B-Instruct-2507-ONNX', own: false });
    setCodeTarget('', '');
  });
  it('gives the model the language, with the rules the small models got wrong', () => {
    expect(CODE_SYSTEM).toMatch(/never call board\(\)/);
    expect(CODE_SYSTEM).toMatch(/Only read a picture/);
    expect(CODE_SYSTEM).toMatch(/source\('name'\)/);
    expect(CODE_SYSTEM).toMatch(/Lighter.*s\.value\(x, y\) > t/);
    expect(CODE_SYSTEM).toMatch(/rows = Math\.round\(cols \* height \/ width\)/);
  });
});

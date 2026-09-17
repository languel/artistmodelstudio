import { describe, it, expect } from 'vitest';
import { extractPartialActions, extractPartialTextOps } from '../src/language/streaming.js';

describe('Streaming Parser', () => {
  it('extracts actions from an incomplete JSON stream', () => {
    const stream1 = '{"version": 1, "actions": [{"op": "brush.bleed", "val": 0.4}, {"op": "circle", "x": 0, "y": 0, "r": 0.3, "fill": "#ff0000"}, {"op": "line", "x1": -0.2';
    const actions = extractPartialActions(stream1);
    expect(actions).toHaveLength(2);
    expect(actions[0].op).toBe('brush.bleed');
    expect(actions[1].op).toBe('circle');
    expect(actions[1].r).toBe(0.3);
  });

  it('handles markdown wrappers and escaped strings gracefully', () => {
    const stream2 = '```json\n{"version": 1, "actions": [{"op": "text", "str": "hello \\"world\\"", "x": 0, "y": 0}, {"op": "rect", "w": 0.5, "h": 0.5}, {"op": "incomp';
    const actions = extractPartialActions(stream2);
    expect(actions).toHaveLength(2);
    expect(actions[0].op).toBe('text');
    expect(actions[0].str).toBe('hello "world"');
    expect(actions[1].op).toBe('rect');
  });

  it('extracts complete lines from partial Text DSL', () => {
    const textStream = 'brush.bleed 0.5\ncircle 0 0 0.3 fill=#ff0000\nrect -0.2 -0.2 0.4';
    const actions = extractPartialTextOps(textStream);
    expect(actions).toHaveLength(2);
    expect(actions[0].op).toBe('brush.bleed');
    expect(actions[1].op).toBe('circle');
  });
});

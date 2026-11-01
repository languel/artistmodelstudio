import { describe, it, expect } from 'vitest';
import { parseReply } from '../src/workbench/panels/assistant.js';

describe('assistant reply parsing', () => {
  const one = '{"say": "No such board.", "actions": [{"tool": "ams_board", "args": {"action": "get"}}], "done": false}';
  it('takes one object, not the span of two', () => {
    const r = parseReply(`${one}\n</antThinking>\n\nI will look.\n</think>\n\n${one}`);
    expect(r.say).toBe('No such board.');
    expect(r.actions).toHaveLength(1);
    expect(r.done).toBe(false);
  });
  it('drops thinking blocks and braces inside strings', () => {
    const r = parseReply('<think>{"say":"x"}</think>{"say": "a } b", "actions": [], "done": true}');
    expect(r.say).toBe('a } b');
  });
  it('plain prose is just a message', () => {
    expect(parseReply('hello')).toEqual({ say: 'hello', actions: [], done: true });
  });
});

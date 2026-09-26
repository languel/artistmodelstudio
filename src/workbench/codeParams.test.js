import { describe, it, expect } from 'vitest';
import { findControls } from './codeParams.js';

describe('code params', () => {
  it('finds param declarations and range comments', () => {
    const src = `sculpt({
  params: {
    amount: [0, 1, 0.5, 'How much'],
    speed: [0, 0.2, 0.04]
  },
  step(pts) { const k = 0.4 /* 0..1 */; return pts }
})`;
    const c = findControls(src);
    const amount = c.find(x => x.key === 'amount');
    expect(amount).toMatchObject({ kind: 'param', min: 0, max: 1, value: 0.5 });
    expect(src.slice(amount.from, amount.to)).toBe('0.5');
    expect(c.find(x => x.key === 'speed').value).toBe(0.04);
    const r = c.find(x => x.kind === 'range');
    expect(r).toMatchObject({ min: 0, max: 1, value: 0.4 });
    expect(src.slice(r.from, r.to)).toBe('0.4');
  });

  it('ignores arrays outside params blocks', () => {
    expect(findControls('line([0, 1, 2])').length).toBe(0);
  });
});

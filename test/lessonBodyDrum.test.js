import { describe, expect, it } from 'vitest';
import { BodyDrum } from '../lessons/threejs/lib/bodydrum.js';

// a standing body, metres, y up, hips at the origin
const P = (x, y, z = 0) => ({ x, y, z });
const standing = () => {
  const w = Array.from({ length: 33 }, () => P(0, 0)), set = (i, p) => { w[i] = p; };
  set(0, P(0, 0.75)); set(11, P(-0.19, 0.5)); set(12, P(0.19, 0.5)); set(23, P(-0.09, 0)); set(24, P(0.09, 0));
  set(25, P(-0.1, -0.45)); set(26, P(0.1, -0.45)); set(27, P(-0.1, -0.9)); set(28, P(0.1, -0.9));
  set(15, P(-0.5, 0.1)); set(19, P(-0.55, 0.1)); set(16, P(0.5, 0.1)); set(20, P(0.55, 0.1));
  return w;
};
const still = () => Array.from({ length: 33 }, () => P(0, 0));
const withHand = (w, side, p) => { const [a, b] = side === 'l' ? [15, 19] : [16, 20]; w[a] = P(p.x - 0.02, p.y, p.z); w[b] = P(p.x + 0.02, p.y, p.z); return w; };
const velHand = (side, vx, vy = 0, vz = 0) => { const v = still(), [a, b] = side === 'l' ? [15, 19] : [16, 20]; v[a] = P(vx, vy, vz); v[b] = P(vx, vy, vz); return v; };

describe('body drum', () => {
  const chestAt = new BodyDrum().update(standing(), still(), 0).centres.chest;

  it('a hand arriving fast at the chest hits the kick, louder when faster', () => {
    const slow = new BodyDrum(), fast = new BodyDrum(), far = P(chestAt.x + 0.5, chestAt.y), near = P(chestAt.x + 0.05, chestAt.y);
    for (const d of [slow, fast]) d.update(withHand(standing(), 'r', far), still(), 0);
    const hs = slow.update(withHand(standing(), 'r', near), velHand('r', -0.8), 0.03).hits;
    const hf = fast.update(withHand(standing(), 'r', near), velHand('r', -3), 0.03).hits;
    expect(hf.map(h => h.id)).toEqual(['chest']); expect(hf[0].voice).toBe('kick');
    expect(hs[0]?.level ?? 0).toBeLessThan(hf[0].level);
  });
  it('ignores a slow hand, a hand moving away, and a hand that stays inside', () => {
    const d = new BodyDrum(), near = P(chestAt.x + 0.05, chestAt.y);
    d.update(withHand(standing(), 'r', P(chestAt.x + 0.5, chestAt.y)), still(), 0);
    expect(d.update(withHand(standing(), 'r', near), velHand('r', -0.2), 0.03).hits).toEqual([]);     // too slow
    expect(d.update(withHand(standing(), 'r', near), velHand('r', -3), 0.06).hits).toEqual([]);       // was already inside: not a new arrival
    const e = new BodyDrum(); e.update(withHand(standing(), 'r', P(chestAt.x + 0.5, chestAt.y)), still(), 0);
    expect(e.update(withHand(standing(), 'r', near), velHand('r', +3), 0.03).hits).toEqual([]);       // moving away as it enters
  });
  it('respects the refractory time per pad', () => {
    const d = new BodyDrum(), far = P(chestAt.x + 0.5, chestAt.y), near = P(chestAt.x + 0.05, chestAt.y);
    const go = t => { d.update(withHand(standing(), 'r', far), still(), t); return d.update(withHand(standing(), 'r', near), velHand('r', -3), t + 0.01).hits.length; };
    expect(go(0)).toBe(1); expect(go(0.03)).toBe(0); expect(go(0.3)).toBe(1);
  });
  it('a pad moves with the body: a hand at rest on a walking chest is not a hit', () => {
    const d = new BodyDrum(); const far = P(chestAt.x + 0.5, chestAt.y), near = P(chestAt.x + 0.05, chestAt.y);
    d.update(withHand(standing(), 'r', far), still(), 0);
    const v = velHand('r', -3); for (const j of [11, 12, 23, 24]) v[j] = P(-3, 0, 0);   // torso moves at the same speed as the hand
    expect(d.update(withHand(standing(), 'r', near), v, 0.03).hits).toEqual([]);
  });
  it('two hands meeting clap; stomps need a fall then a stop', () => {
    const d = new BodyDrum(), w0 = withHand(withHand(standing(), 'l', P(-0.3, 0.3)), 'r', P(0.3, 0.3));
    d.update(w0, still(), 0);
    const w1 = withHand(withHand(standing(), 'l', P(-0.02, 0.3)), 'r', P(0.02, 0.3)), v = velHand('l', 2); v[16] = P(-2, 0, 0); v[20] = P(-2, 0, 0);
    expect(d.update(w1, v, 0.03).hits.map(h => h.id)).toContain('clap');
    const f = new BodyDrum(), fall = still(); fall[27] = P(0, -2.5, 0);
    expect(f.update(standing(), fall, 0).hits.filter(h => h.voice === 'stomp')).toEqual([]);
    expect(f.update(standing(), still(), 0.05).hits.filter(h => h.voice === 'stomp').length).toBe(1);
  });
  it('a pad built on a joint that is out of frame never sounds', () => {
    const d = new BodyDrum(), near = P(chestAt.x + 0.05, chestAt.y), ok = j => j !== 23;     // the left hip is not visible
    d.update(withHand(standing(), 'r', P(chestAt.x + 0.5, chestAt.y)), still(), 0, () => true, ok);
    expect(d.update(withHand(standing(), 'r', near), velHand('r', -3), 0.03, () => true, ok).hits).toEqual([]);   // the chest uses both hips
  });
  it('pad size follows the body and the size control', () => {
    const adult = new BodyDrum().update(standing(), still(), 0).centres.chest.r;
    const w = standing(); w[11] = P(-0.1, 0.5); w[12] = P(0.1, 0.5);      // narrow shoulders: a child
    expect(new BodyDrum().update(w, still(), 0).centres.chest.r).toBeLessThan(adult);
    expect(new BodyDrum({ size: 1.5 }).update(standing(), still(), 0).centres.chest.r).toBeCloseTo(adult * 1.5);
  });
});

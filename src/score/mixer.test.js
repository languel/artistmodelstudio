import { describe, it, expect } from 'vitest';
import { normalizeMixer, patchMixer, createRouter, strips, audible } from './mixer.js';
import { normalizeTransport } from '../time/sceneTransport.js';

const on = (c, n, v = 100) => [0x90 | (c - 1), n, v], off = (c, n) => [0x80 | (c - 1), n, 0];

describe('mixer', () => {
  it('stores only what differs and survives a round trip through the transport', () => {
    expect(normalizeMixer(null).channels).toEqual({});
    const m = patchMixer(normalizeMixer(null), { channel: { 3: { program: 40, vol: 90 } }, scale: { name: 'dorian', root: 2 } });
    expect(Object.keys(m.channels)).toEqual(['3']);
    expect(m.scale).toEqual({ name: 'Dorian', root: 2 });
    expect(normalizeTransport({ mixer: m }).mixer).toEqual(m);
  });
  it('mutes and solos', () => {
    let m = patchMixer(normalizeMixer(null), { channel: { 1: { mute: true } } });
    expect(audible(m, 1)).toBe(false);
    expect(audible(m, 2)).toBe(true);
    m = patchMixer(m, { channel: { 2: { solo: true } } });
    expect(audible(m, 3)).toBe(false);
    expect(audible(m, 2)).toBe(true);
    const r = createRouter(() => m);
    expect(r.route(on(1, 60))).toBe(null);
    expect(r.route(on(2, 60))?.to).toBe('auto');
  });
  it('snaps to the global scale and the note-off follows the note it started', () => {
    let m = patchMixer(normalizeMixer(null), { scale: { name: 'Ionian', root: 0 } });
    const r = createRouter(() => m);
    expect(r.route(on(1, 61)).bytes[1]).toBe(60);   // C# → C (ties go down)
    m = patchMixer(m, { scale: { name: '' }, transpose: 12 });   // changed mid-note
    expect(r.route(off(1, 61)).bytes[1]).toBe(60);
    expect(r.route(on(1, 61)).bytes[1]).toBe(73);
  });
  it('routes per channel and lets the mixer own instrument and volume', () => {
    const m = patchMixer(normalizeMixer(null), { channel: { 4: { out: 'midi', program: 10, vol: 80, pan: -1 }, 5: { out: 'off' } } });
    const r = createRouter(() => m);
    expect(r.route(on(4, 60)).to).toBe('midi');
    expect(r.route(on(5, 60))).toBe(null);
    expect(r.route([0xc3, 99])).toBe(null);
    expect(r.route([0xb3, 7, 3])).toBe(null);
    expect(r.route([0xb3, 74, 3])).not.toBe(null);
    expect(strips(m, 4)).toEqual([[0xc3, 10], [0xb3, 7, 80], [0xb3, 10, 1]]);
  });
});

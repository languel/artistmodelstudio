import { describe, it, expect } from 'vitest';
import { readPlaylist, writePlaylist, PLAYLIST_TEMPLATE } from './playlist.js';

describe('playlist code', () => {
  it('reads a playlist: target, loop, and items of every kind', () => {
    const p = readPlaylist(`playlist({ target: 'Screen', loop: false, items: [ { stream: 'stream:a', title: 'A' }, { url: 'https://x/y.webm', start: 3, end: 9 }, { board: 'Dots', for: 5 }, { source: 'cam' }, { asset: 'clip:h' } ] })`);
    expect(p.target).toBe('Screen');
    expect(p.loop).toBe(false);
    expect(p.items.map(i => [i.kind, i.ref])).toEqual([['stream', 'stream:a'], ['url', 'https://x/y.webm'], ['board', 'Dots'], ['source', 'cam'], ['asset', 'clip:h']]);
    expect(p.items[1].start).toBe(3);
    expect(p.items[2].for).toBe(5);
  });
  it('writes code that reads back the same (the board\'s controls and the hand-edited code agree)', () => {
    const src = { target: 'Screen', loop: true, items: [{ kind: 'stream', ref: 'stream:a', title: 'A “quoted” \\ title' }, { kind: 'board', ref: 'Dots', stay: true }, { kind: 'url', ref: 'https://x/y', start: 1.5, loop: false }] };
    const back = readPlaylist(writePlaylist(src));
    expect(back).toEqual(src);
    expect(readPlaylist(PLAYLIST_TEMPLATE).items).toEqual([]);
  });
  it('says what is wrong', () => {
    expect(() => readPlaylist('playlist({ items: [ { title: "x" } ] })')).toThrow(/Item 1/);
    expect(() => readPlaylist('const a = 1')).toThrow(/playlist\(/);
  });
});

import { describe, it, expect } from 'vitest';
import { transcriptOf, diffWords } from './transcript.js';

const take = {
  title: 'Demo', tracks: [{ id: 'title', kind: 'title', name: 'Titles' }, { id: 'comp', kind: 'comp', name: 'History', muted: true }],
  clips: [
    { id: 'a', track: 'title', start: 0, dur: 2000, text: 'Hello', sub: '1/2' },
    { id: 'h', track: 'comp', lane: 'comp', start: 500, dur: 3000, label: 'History (2)', comp: { clips: [
      { id: 'i1', track: 'draw', start: 0, dur: 300, label: 'add line', diff: { add: [{ role: 'line' }] } },
      { id: 'i2', track: 'draw', start: 1000, dur: 300, label: 'edit', diff: { update: [{ role: 'plane' }, { role: 'plane' }], remove: ['x'] } }] } }
  ]
};
describe('transcript', () => {
  it('says a drawing change in words', () => { expect(diffWords({ add: [{ role: 'line' }, { role: 'line' }], remove: ['a'] })).toBe('added 2 lines; removed 1'); });
  it('writes a take as markdown, a muted track marked, a composition opened out', () => {
    const { text } = transcriptOf(take);
    expect(text).toContain('# Demo');
    expect(text).toContain('## History (muted)');
    expect(text).toContain('- 0:00.0–0:02.0 Title “Hello” (1/2)');
    expect(text).toContain('  - 0:00.0–0:00.3 Draw: add line — added 1 line');
    expect(text).toContain('changed 2 planes; removed 1');
  });
  it('one track, as JSON', () => {
    const { text } = transcriptOf(take, { track: 'title', format: 'json' });
    const j = JSON.parse(text);
    expect(j.tracks).toHaveLength(1);
    expect(j.tracks[0].lines[0]).toMatchObject({ kind: 'title', start: 0, end: 2000 });
  });
});

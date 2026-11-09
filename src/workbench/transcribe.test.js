import { describe, it, expect } from 'vitest';
import { segmentsFrom, segmentsToNotes, segmentsToTrack, TRANSCRIPT_TRACK } from './transcribe.js';
import { addMark } from '../process/marks.js';

const clip = (o = {}) => ({ id: 'a1', track: 'audio', start: 2000, dur: 10000, ...o });

describe('segments from Whisper chunks', () => {
  it('cleans text, drops blanks and sound tags, fills a missing end from the next start', () => {
    const s = segmentsFrom([
      { text: ' Hello   there. ', timestamp: [0, 2.5] },
      { text: '[BLANK_AUDIO]', timestamp: [2.5, 4] },
      { text: ' and then', timestamp: [4, null] },
      { text: ' the end', timestamp: [6, 7] }
    ], 10);
    expect(s).toEqual([{ text: 'Hello there.', start: 0, end: 2.5 }, { text: 'and then', start: 4, end: 6 }, { text: 'the end', start: 6, end: 7 }]);
  });
  it('keeps the last segment inside the clip and never zero long', () => {
    const s = segmentsFrom([{ text: 'late', timestamp: [9.9, null] }, { text: 'beyond', timestamp: [12, 13] }], 10);
    expect(s).toEqual([{ text: 'late', start: 9.9, end: 10.1 }]);
  });
});

describe('putting the words on the Timeline', () => {
  const segs = [{ text: 'one', start: 1, end: 2 }, { text: 'two', start: 3, end: 4.5 }];
  it('as notes with a start and end, replacing an earlier run but not a person\'s notes', () => {
    const c = clip(); addMark(c, 500, 'mine', 'feedback'); addMark(c, 100, 'old words', 'note', { by: 'whisper', end: 200 });
    expect(segmentsToNotes(c, segs)).toBe(2);
    expect(c.marks.map(m => [m.at, m.end, m.text, m.by || ''])).toEqual([[500, undefined, 'mine', ''], [1000, 2000, 'one', 'whisper'], [3000, 4500, 'two', 'whisper']]);
  });
  it('as a Transcript track of caption clips at take time, replacing an earlier run', () => {
    const c = clip(), take = { clips: [c], tracks: [] };
    segmentsToTrack(take, c, segs);
    const made = take.clips.filter(k => k.transcript);
    expect(made.map(k => [k.start, k.dur, k.text])).toEqual([[3000, 1000, 'one'], [5000, 1500, 'two']]);
    expect(take.tracks.filter(t => t.name === TRANSCRIPT_TRACK && t.kind === 'say').length).toBe(1);
    expect(made.every(k => k.lane === take.tracks.find(t => t.name === TRANSCRIPT_TRACK).id)).toBe(true);
    segmentsToTrack(take, c, [{ text: 'again', start: 0, end: 1 }]);
    expect(take.clips.filter(k => k.transcript).map(k => k.text)).toEqual(['again']);
    expect(take.tracks.filter(t => t.name === TRANSCRIPT_TRACK).length).toBe(1);
  });
});

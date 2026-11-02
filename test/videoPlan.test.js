import { it, expect } from 'vitest';
import { concatList, audioPlan, mixArgs, vttFor, bytesOfDataUri } from '../src/workbench/videoPlan.js';

it('lists each frame for as long as it was on the screen, and the last once more', () => {
  const t = concatList([{ file: 'a.jpg', t: 0 }, { file: 'b.jpg', t: 0.5 }, { file: 'c.jpg', t: 2 }], 3);
  expect(t).toContain("file 'a.jpg'\nduration 0.5000");
  expect(t).toContain("file 'b.jpg'\nduration 1.5000");
  expect(t).toContain("file 'c.jpg'\nduration 1.0000");
  expect(t.trim().endsWith("file 'c.jpg'")).toBe(true);
  expect(() => concatList([], 1)).toThrow(/No frames/);
});

it('places each clip where its cue played it, and skips cues without sound', () => {
  const plan = audioPlan([{ start: 1000, audio: 1100 }, { start: 5000, audio: 0 }, { start: 9000, audio: 9050 }], ['x', 'y', 'z'], 1000);
  expect(plan).toEqual([{ i: 0, delay: 100 }, { i: 2, delay: 8050 }]);
});

it('mixes the clips with their delays into one track of the length of the movie', () => {
  const a = mixArgs([{ i: 0, delay: 100 }, { i: 2, delay: 8050 }], { 0: 'a.wav', 2: 'c.wav' }, '12.000', 'out.wav');
  expect(a).toContain('a.wav'); expect(a).toContain('c.wav');
  const filter = a[a.indexOf('-filter_complex') + 1];
  expect(filter).toContain('adelay=100|100'); expect(filter).toContain('adelay=8050|8050'); expect(filter).toContain('amix=inputs=2');
  expect(mixArgs([], {}, '3.000', 'o.wav')).toContain('anullsrc=r=24000:cl=mono');
});

it('writes subtitles from the cues', () => {
  const v = vttFor([{ start: 1000 }, { start: 4000 }], ['One.', 'Two.'], 0, 9000);
  expect(v).toContain('00:00:01.000 --> 00:00:04.000\nOne.');
  expect(v).toContain('00:00:04.000 --> 00:00:09.000\nTwo.');
});

it('reads a data URI as bytes', () => {
  expect(bytesOfDataUri('data:audio/wav;base64,AAEC').equals(Buffer.from([0, 1, 2]))).toBe(true);
  expect(bytesOfDataUri('nope')).toBe(null);
});

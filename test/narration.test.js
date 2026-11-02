import { it, expect } from 'vitest';
import { clipHash, encodeWav, KOKORO } from '../src/workbench/narration.js';

it('names a clip by the model, the voice, the speed and the words', () => {
  const a = clipHash(KOKORO, 'af_heart', 1, 'A hinge is a group.');
  expect(clipHash(KOKORO, 'af_heart', 1, 'A hinge is a group.')).toBe(a);
  expect(clipHash(KOKORO, 'am_adam', 1, 'A hinge is a group.')).not.toBe(a);
  expect(clipHash(KOKORO, 'af_heart', 1.2, 'A hinge is a group.')).not.toBe(a);
  expect(clipHash(KOKORO, 'af_heart', 1, 'A hinge is a group')).not.toBe(a);
});

it('writes 16-bit mono WAV of the right length and rate', () => {
  const rate = 24000, wav = new DataView(encodeWav(new Float32Array(rate / 2).fill(0.5), rate));
  const tag = o => String.fromCharCode(...[0, 1, 2, 3].map(i => wav.getUint8(o + i)));
  expect([tag(0), tag(8), tag(36)]).toEqual(['RIFF', 'WAVE', 'data']);
  expect(wav.getUint32(24, true)).toBe(rate);
  expect(wav.getUint32(40, true)).toBe(rate);           // half a second of 2-byte samples
  expect(wav.getInt16(44, true)).toBe(Math.floor(0.5 * 0x7fff));
});

import { pronounce, PRONUNCIATIONS } from '../src/workbench/narration.js';
it('marks the words the voice would get wrong with their sounds, once', () => {
  const said = pronounce('Reiniger cut it out of paper.');
  expect(said).toBe(`[Reiniger](/${PRONUNCIATIONS.Reiniger}/) cut it out of paper.`);
  expect(pronounce(said)).toBe(said);
  expect(pronounce('Nothing special here.')).toBe('Nothing special here.');
});

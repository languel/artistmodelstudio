import { it, expect } from 'vitest';
import { vttTime, toVtt } from '../src/workbench/scriptRecorder.js';

it('writes WebVTT times to the millisecond, without losing one to rounding', () => {
  expect(vttTime(0)).toBe('00:00:00.000');
  expect(vttTime(61.001)).toBe('00:01:01.001');
  expect(vttTime(3599.9996)).toBe('01:00:00.000');
});

it('makes a subtitle file from the cues that said something', () => {
  const vtt = toVtt([{ start: 0.5, end: 3.25, text: 'Hello' }, { start: 3.25, end: 3.25, text: 'nothing' }, { start: 4, end: 6, text: '' }, { start: 6, end: 8, text: 'Two' }]);
  expect(vtt).toBe('WEBVTT\n\n1\n00:00:00.500 --> 00:00:03.250\nHello\n\n2\n00:00:06.000 --> 00:00:08.000\nTwo\n');
});

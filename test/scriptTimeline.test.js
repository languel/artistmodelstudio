// @vitest-environment happy-dom
import { it, expect, vi } from 'vitest';
import { estimateSpans, cueSeconds, fmtTime, timelineBar } from '../src/workbench/scriptTimeline.js';

const cues = [{ say: 'one', goto: 'A' }, { say: 'two', set: { on: 'A', name: 'x', value: 1 } }, { say: 'three', wait: 3000 }];

it('formats times as m:ss', () => { expect(fmtTime(0)).toBe('0:00'); expect(fmtTime(65.4)).toBe('1:05'); });

it('a cue lasts as long as its voice or its actions, whichever is longer, and its hold', () => {
  expect(cueSeconds({ say: 'x', set: {} }, 4)).toBeCloseTo(4.25);
  expect(cueSeconds({ wait: 3000 }, 1)).toBeCloseTo(3);
  expect(cueSeconds({ say: 'x', hold: 5000 }, 1)).toBe(5);
});

it('spans run one after another and add up to the total', () => {
  const { spans, total } = estimateSpans(cues, [3, 2, 1]);
  expect(spans[0].start).toBe(0);
  expect(spans[1].start).toBeCloseTo(spans[0].dur);
  expect(total).toBeCloseTo(spans.reduce((a, s) => a + s.dur, 0));
});

const make = (o = {}) => {
  const host = document.createElement('div'); document.body.append(host);
  const { spans, total } = estimateSpans(cues, [3, 2, 1]);
  return timelineBar(host, { title: 'T', cues, spans, total, onSeek: vi.fn(), onToggle: vi.fn(), onStop: vi.fn(), onNotes: vi.fn(), ...o });
};

it('has a segment for each cue, and the buttons ask the host', () => {
  const onSeek = vi.fn(), onToggle = vi.fn();
  const bar = make({ onSeek, onToggle });
  expect(bar.el.querySelectorAll('.tl-seg').length).toBe(3);
  bar.setPos(1, 0.5);
  const [prev, play, next] = bar.el.querySelectorAll('.tl-row > button');
  next.click(); expect(onSeek).toHaveBeenLastCalledWith(2);
  prev.click(); expect(onSeek).toHaveBeenLastCalledWith(0);
  play.click(); expect(onToggle).toHaveBeenCalled();
});

it('shows where it is: cues before are full, the current one part way', () => {
  const bar = make();
  bar.setPos(1, 1);
  const fills = [...bar.el.querySelectorAll('.tl-fill')].map(f => f.style.width);
  expect(fills[0]).toBe('100%'); expect(fills[2]).toBe('0%');
  expect(parseFloat(fills[1])).toBeGreaterThan(0);
  bar.setState('playing'); expect(bar.el.querySelector('.tl-row > button:nth-child(2)').textContent).toBe('❚❚');
});

it('notes are pinned to the current cue, listed, copied as Markdown, and removed', () => {
  const onNotes = vi.fn();
  const bar = make({ onNotes });
  bar.setPos(2, 1.5);
  bar.addNote();
  const input = bar.el.querySelector('.tl-add input');
  input.value = 'slower here'; input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  expect(onNotes).toHaveBeenCalledTimes(1);
  expect(onNotes.mock.calls[0][0][0]).toMatchObject({ cue: 2, t: 1.5, text: 'slower here' });
  expect(bar.el.querySelectorAll('.tl-mark').length).toBe(1);
  expect(bar.markdown()).toMatch(/cue 3 \(“three”\): slower here/);
  bar.el.querySelector('.tl-del').click();
  expect(bar.el.querySelectorAll('.tl-mark').length).toBe(0);
  expect(onNotes).toHaveBeenCalledTimes(2);
});

it('starts with the notes it is given', () => {
  const bar = make({ notes: [{ id: 'a', cue: 0, t: 0.5, text: 'hello' }] });
  expect(bar.el.querySelectorAll('.tl-mark').length).toBe(1);
  expect(bar.markdown()).toContain('hello');
});

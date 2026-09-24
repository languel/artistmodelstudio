import { describe, it, expect } from 'vitest';
import { programToDistillText, parseDistillText, distillUserPrompt, DISTILL_SYSTEM } from '../src/training/distillFormat.js';

const program = {
  version: 1,
  actions: [
    { op: 'background', color: '#7a3b2e' },
    { op: 'noStroke' },
    { op: 'fill', color: '#d4a017', opacity: 1 },
    { op: 'rect', x: 0.123, y: -0.5, width: 0.3, height: 0.25 },
    { op: 'fill', color: '#1e90ff', opacity: 1 },
    { op: 'circle', x: -0.004, y: 0.2, diameter: 0.4 },
    { op: 'fill', color: '#ffffff', opacity: 1 },
    { op: 'polygon', points: [[0, 0], [0.5, 0.5], [-0.5, 0.5]] }
  ]
};

describe('distillation format', () => {
  it('writes compact 2-decimal text', () => {
    expect(programToDistillText(program)).toBe([
      'background #7a3b2e',
      'fill #d4a017',
      'rect 0.12 -0.5 0.3 0.25',
      'fill #1e90ff',
      'circle 0 0.2 0.4',
      'fill #ffffff',
      'polygon 0,0 0.5,0.5 -0.5,0.5'
    ].join('\n'));
  });

  it('round-trips through the strict parser', () => {
    const { program: back, stats } = parseDistillText(programToDistillText(program));
    expect(stats).toMatchObject({ lines: 7, valid: 7, invalid: 0, shapes: 3, outOfRange: 0 });
    expect(back.actions.filter(a => a.op === 'rect')[0]).toEqual({ op: 'rect', x: 0.12, y: -0.5, width: 0.3, height: 0.25 });
  });

  it('counts invalid lines instead of guessing', () => {
    const { stats, program: p } = parseDistillText('background #fff\nfill red\nrect 0 0 abc 1\ncircle 0 0 0.5\nhello world\nrect 5 0 0.2 0.2');
    expect(stats.valid).toBe(2);
    expect(stats.invalid).toBe(4);
    expect(stats.outOfRange).toBe(1);
    expect(p.actions[0]).toEqual({ op: 'noStroke' });
  });

  it('builds the user prompt with a shape budget', () => {
    expect(distillUserPrompt({ description: ' A red castle ', shapes: 24 })).toBe('A red castle\nShapes: 24');
    expect(DISTILL_SYSTEM).toContain('polygon x1,y1');
  });
});

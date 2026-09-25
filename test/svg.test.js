import { describe, it, expect } from 'vitest';
import { programToSvg, svgToProgram } from '../src/export/svgExport.js';

const prog = {
  version: 1, medium: 'watercolor',
  actions: [
    { op: 'background', color: '#faf7f2' },
    { op: 'brush.bleed', amount: 0.3 },
    { op: 'fill', color: '#ce526d', opacity: 0.8 },
    { op: 'circle', x: -0.3, y: -0.1, diameter: 0.35 },
    { op: 'stroke', color: '#2d4a34', width: 2.5 },
    { op: 'line', x1: -0.3, y1: -0.1, x2: -0.1, y2: 0.65 },
    { op: 'noStroke' },
    { op: 'rect', x: 0, y: 0.2, width: 0.4, height: 0.3 },
    { op: 'polygon', points: [[-0.2, -0.2], [0.2, -0.2], [0.1, 0.3]] },
    { op: 'noFill' },
    { op: 'stroke', color: '#111111', width: 1 },
    { op: 'polyline', points: [[-0.3, 0], [0, -0.3], [0.3, 0]] }
  ]
};

describe('SVG export', () => {
  it('keeps comments and notes', () => {
    const p = { version: 1, actions: [{ op: 'comment', text: 'sun first' }, { op: 'circle', x: 0, y: 0, diameter: 0.5, note: 'the sun' }] };
    const { program } = svgToProgram(programToSvg(p));
    expect(program.actions[0]).toEqual({ op: 'comment', text: 'sun first' });
    expect(program.actions.find(a => a.op === 'circle').note).toBe('the sun');
  });

  it('writes plain SVG shapes with AMS metadata', () => {
    const svg = programToSvg(prog, { width: 800, height: 800 });
    expect(svg).toContain('<circle cx="280" cy="360" r="70"');
    expect(svg).toContain('data-ams-op="brush.bleed"');
    expect(svg).toContain('<polyline');
  });

  it('round-trips geometry, colors and unsupported ops', () => {
    const { program, warnings } = svgToProgram(programToSvg(prog, { width: 800, height: 600 }));
    expect(warnings).toEqual([]);
    const ops = program.actions.map(a => a.op);
    for (const op of ['background', 'brush.bleed', 'circle', 'line', 'rect', 'polygon', 'polyline']) expect(ops).toContain(op);
    const c = program.actions.find(a => a.op === 'circle');
    expect(c).toMatchObject({ x: -0.3, y: -0.1, diameter: 0.35 });
    expect(program.actions.find(a => a.op === 'brush.bleed').amount).toBe(0.3);
    expect(program.actions.find(a => a.op === 'fill')).toMatchObject({ color: '#ce526d', opacity: 0.8 });
    expect(program.actions.find(a => a.op === 'stroke')).toMatchObject({ color: '#2d4a34', width: 2.5 });
    expect(program.medium).toBe('watercolor');
  });

  it('reads edits made in an SVG editor (styles, paths, moved shapes)', () => {
    const edited = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <circle cx="50" cy="25" r="10" style="fill:#ff0000;stroke:none"/>
      <path d="M10 90 L50 60 L90 90 Z" fill="#00ff00"/>
    </svg>`;
    const { program, warnings } = svgToProgram(edited);
    expect(program.actions[0]).toMatchObject({ op: 'fill', color: '#ff0000' });
    expect(program.actions.find(a => a.op === 'circle')).toMatchObject({ x: 0, y: -0.5, diameter: 0.4 });
    expect(program.actions.find(a => a.op === 'polygon').points).toHaveLength(3);
    expect(warnings[0]).toMatch(/Not an AMS export/);
  });

  it('round-trips pixel-grid programs', () => {
    const px = { version: 1, medium: 'pixel', actions: [{ op: 'palette', colors: ['#000', '#f00'] }, { op: 'mirrorX', enabled: true }, { op: 'pixel', x: 2, y: 5, color: 1 }, { op: 'hline', y: 7, x1: 1, x2: 4, color: 1 }, { op: 'vline', x: 3, y1: 2, y2: 6, color: 0 }] };
    const { program } = svgToProgram(programToSvg(px, { cols: 10, rows: 10 }));
    expect(program.actions).toEqual(px.actions);
  });
});

import { programToText, textToProgram } from '../src/language/textFormat.js';
import { normalizeProgram } from '../src/language/normalize.js';
describe('DSL comments', () => {
  it('parses whole-line comments and inline notes, and writes them back', () => {
    const text = '# Klee magic square behind the figure\nbackground #efe1c2\nfill #c8402f 0.9\ncircle -0.55 -0.6 0.22  # red sun\n// the archer\nline 0 0 0.5 0';
    const prog = normalizeProgram(textToProgram(text));
    expect(prog.actions[0]).toEqual({ op: 'comment', text: 'Klee magic square behind the figure' });
    expect(prog.actions[1]).toMatchObject({ op: 'background', color: '#efe1c2' });
    expect(prog.actions[2]).toMatchObject({ op: 'fill', color: '#c8402f' });
    expect(prog.actions[3]).toMatchObject({ op: 'circle', note: 'red sun' });
    expect(prog.actions[4]).toEqual({ op: 'comment', text: 'the archer' });
    const back = programToText(prog);
    expect(back).toContain('# Klee magic square behind the figure');
    expect(back).toContain('circle -0.55 -0.6 0.22  # red sun');
  });
});

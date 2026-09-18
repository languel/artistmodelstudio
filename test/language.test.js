import { describe, it, expect } from 'vitest';
import { normalizeProgram } from '../src/language/normalize.js';
import { validateProgram } from '../src/language/validate.js';
import { programToText, textToProgram } from '../src/language/textFormat.js';

describe('Language Specification', () => {
  it('normalizes raw arrays and aliases', () => {
    const raw = [
      { op: 'bleed', amount: 0.3 },
      { op: 'circle', x: '-0.5', y: '0.2', r: 0.15 }
    ];
    const norm = normalizeProgram(raw);
    expect(norm.version).toBe(1);
    expect(norm.actions[0].op).toBe('brush.bleed');
    expect(norm.actions[0].amount).toBe(0.3);
    expect(norm.actions[1].op).toBe('circle');
    expect(norm.actions[1].x).toBe(-0.5);
    expect(norm.actions[1].y).toBe(0.2);
    expect(norm.actions[1].diameter).toBe(0.3);
  });

  it('translates text DSL to JSON and back losslessly', () => {
    const text = [
      'background #f4eee3',
      'fill #c95267 0.8',
      'bleed 0.25',
      'circle -0.4 -0.2 0.5',
      'rect -0.2 0.1 0.4 0.3'
    ].join('\n');

    const prog = textToProgram(text);
    expect(prog.actions.length).toBe(5);
    expect(prog.actions[0]).toEqual({ op: 'background', color: '#f4eee3' });
    expect(prog.actions[1]).toEqual({ op: 'fill', color: '#c95267', opacity: 0.8 });
    expect(prog.actions[2]).toEqual({ op: 'brush.bleed', amount: 0.25 });
    expect(prog.actions[3]).toEqual({ op: 'circle', x: -0.4, y: -0.2, diameter: 0.5 });
    expect(prog.actions[4]).toEqual({ op: 'rect', x: -0.2, y: 0.1, width: 0.4, height: 0.3, color: undefined });

    const backText = programToText(prog);
    expect(backText).toContain('background #f4eee3');
    expect(backText).toContain('circle -0.4 -0.2 0.5');
  });

  it('validates programs correctly', () => {
    const good = {
      version: 1,
      actions: [
        { op: 'background', color: '#ffffff' },
        { op: 'circle', x: 0, y: 0, diameter: 0.5 }
      ]
    };
    expect(validateProgram(good).valid).toBe(true);

    const bad = {
      version: 1,
      actions: [
        { op: 'circle', x: 'invalid' }
      ]
    };
    expect(validateProgram(bad).valid).toBe(false);
  });

  it('parseModelOutput recovers actions from truncated JSON mid-generation', async () => {
    const { parseModelOutput } = await import('../src/language/normalize.js');
    const truncated = `\`\`\`json
{
  "version": 1,
  "actions": [
    {"op": "background", "color": "#faf7f2"},
    {"op": "circle", "x": 0.0, "y": -0.2, "diameter": 0.35},
    {"op": "brush.bleed", "amount": 0.35},
    {"op": "line", "x1": 0.0, "y1": -0.2, "x2": 0.0, "y2": 0.6},
    {"op": "brush.texture", "amount": 0.45},
    {"op": "fill", "color": "#ce526d", "opacity": 0.8},
    {"op": "polygon", "points": [[-0.2, -0.2], [0.2, -0.2], [0, 0.2]]},
    {"op": "stroke", "color": "#2d4a34", "width": 2.5},
    {"op": "polygon", "points": [[-0.4, -0.4], [0.4, -0.4], [0.4, 
`;
    const warnings = [];
    const prog = parseModelOutput(truncated, warnings);
    expect(prog.version).toBe(1);
    expect(prog.actions.length).toBe(8);
    expect(prog.actions[0].op).toBe('background');
    expect(prog.actions[1].op).toBe('circle');
    expect(prog.actions[7].op).toBe('stroke');
    expect(warnings.length).toBeGreaterThan(0);
  });

  it('parseModelOutput strips comments and repairs trailing commas', async () => {
    const { parseModelOutput } = await import('../src/language/normalize.js');
    const commented = `
    // Creative artwork definition
    {
      "version": 1,
      "actions": [
        {"op": "background", "color": "#f5f5dc"}, // Soft paper wash
        {"op": "circle", "x": 0.7, "y": -0.2, "radius": 0.15,},
      ]
    }
    `;
    const warnings = [];
    const prog = parseModelOutput(commented, warnings);
    expect(prog.actions.length).toBe(2);
    expect(prog.actions[0].op).toBe('background');
    expect(prog.actions[1].op).toBe('circle');
  });

  it('parseModelOutput recovers actions from Text DSL format', async () => {
    const { parseModelOutput } = await import('../src/language/normalize.js');
    const dslText = `
background #faf7f2
fill #ce526d 0.8
stroke #2d4a34 2.5
circle 0 -0.2 0.35
line 0 -0.2 0 0.6
rect -0.2 -0.2 0.4 0.4
    `;
    const warnings = [];
    const prog = parseModelOutput(dslText, warnings);
    expect(prog.actions.length).toBe(6);
    expect(prog.actions[0].op).toBe('background');
    expect(prog.actions[3].op).toBe('circle');
  });
});


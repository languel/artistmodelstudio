import { describe, it, expect } from 'vitest';
import { runScript } from '../src/process/script.js';
import { boardsOf, marksOf } from '../src/process/boards.js';
import { boardPart, scenePart, selectionPart, importPart, partKind, isPart } from '../src/process/parts.js';

const scene = () => runScript(`point(0.5, 0.5)
board('Two', { width: 300, height: 200 })
stage('Ink', 'marks')
line([[0.1, 0.5], [0.9, 0.5]], { why: 'across' })`).doc;

describe('parts: pieces of a drawing as files', () => {
  it('a board part keeps its marks from its top-left, and its settings', () => {
    const d = scene();
    const two = boardsOf(d)[1];
    two.code = "line([[0, 0], [1, 1]])";
    d.boards[0].code = two.code;
    const p = boardPart(d, two.id);
    expect(partKind(p)).toBe('board');
    expect(isPart(JSON.parse(JSON.stringify(p)))).toBe(true);
    expect(p.artboard).toMatchObject({ width: 300, height: 200, title: 'Two', code: two.code });
    expect(p.elements).toHaveLength(1);
    expect(p.elements[0].points[0][0]).toBeCloseTo(30);   // 0.1 of 300, from the board's left
  });

  it('a board comes in as a new board, right of the others, with its code and stages', () => {
    const src = scene(), dst = scene();
    const p = boardPart(src, boardsOf(src)[1].id);
    p.artboard.code = 'point(0.5, 0.5)';
    const before = boardsOf(dst).length;
    const r = importPart(dst, JSON.parse(JSON.stringify(p)));
    expect(r.kind).toBe('board');
    const b = boardsOf(dst).at(-1);
    expect(boardsOf(dst)).toHaveLength(before + 1);
    expect(b.code).toBe('point(0.5, 0.5)');
    expect(b.x).toBeGreaterThan(boardsOf(dst)[1].x);
    expect(marksOf(dst, b.id)).toHaveLength(1);
    expect(marksOf(dst, b.id)[0].points[0][0]).toBeCloseTo(b.x + 30);
    expect(dst.stages.filter(s => s.name === 'Ink')).toHaveLength(1);   // matched, not doubled
  });

  it('a scene brings every board; ids never clash', () => {
    const src = scene(), dst = scene();
    const r = importPart(dst, scenePart(src));
    expect(r.kind).toBe('scene');
    expect(r.boards).toHaveLength(2);
    expect(new Set(dst.elements.map(e => e.id)).size).toBe(dst.elements.length);
  });

  it('a selection lands where it is put, as a group', () => {
    const d = scene();
    const sel = { ...structuredClone(d), boards: [], artboard: { width: 50, height: 20, ground: 'transparent' }, elements: [{ ...d.elements[0], points: [[5, 5, 0, 0.5]] }] };
    const r = importPart(d, selectionPart(sel), { at: [100, 100] });
    expect(r.kind).toBe('selection');
    const e = d.elements.find(x => x.id === r.elements[0]);
    expect(e.points[0].slice(0, 2)).toEqual([105, 105]);
    expect(e.group).toBeTruthy();
    expect(e.board).toBeUndefined();   // on the main board
  });
});

import { parseCommand, help } from '../src/workbench/console.js';
describe('the console', () => {
  it('reads tools, actions and key=value arguments', () => {
    expect(parseCommand('!board list')).toEqual({ tool: 'ams_board', args: { action: 'list' } });
    expect(parseCommand('!add role=point points=[[10, 20]] color=#c8664f why="a place, with tension"')).toEqual({ tool: 'ams_add', args: { role: 'point', points: [[10, 20]], color: '#c8664f', why: 'a place, with tension' } });
    expect(parseCommand('!ams_get format=p5code board="0.1 · Light"')).toEqual({ tool: 'ams_get', args: { format: 'p5code', board: '0.1 · Light' } });
    expect(parseCommand('!snap {"ids": ["a"], "mode": "points"}')).toEqual({ tool: 'ams_snap', args: { ids: ['a'], mode: 'points' } });
    expect(parseCommand('!source sample name=walk points=[[0.5,0.5]] landmarks=["pose"]').args).toEqual({ action: 'sample', name: 'walk', points: [[0.5, 0.5]], landmarks: ['pose'] });
    expect(parseCommand('!help').help).toBe(true);
    expect(parseCommand('!help board').help).toBe('board');
    expect(() => parseCommand('!board list extra')).toThrow(/key=value/);
    expect(help([{ name: 'ams_board', description: 'Boards.', inputSchema: { properties: { action: { type: 'string', enum: ['list'] } }, required: ['action'] } }], 'board')).toContain('action (required)');
  });
});

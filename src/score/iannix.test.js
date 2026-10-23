import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { tokenize, iannixToScore, loopOf, emitFor, curvePoints, buildModel, runIannixScript } from './import/iannix.js';
import { runScoreInto } from '../process/script.js';
import { normalizeDocument, createDocument } from '../process/document.js';
import { renderEvents } from './world.js';
import { compileDoc } from './compile.js';
import { musicHelpers } from './music.js';
import { boardsOf } from '../process/boards.js';

const SIMPLE = `
function makeWithScript() {
  run("clear");
  for (var i = 0; i < 3; i++) {
    run("add curve " + (1000 + i));
    run("setPointAt current 0 " + (-i) + " 0");
    run("setPointAt current 1 0 " + (4 - i) + " 0");
    run("add cursor " + i);
    run("setCurve current lastCurve");
    run("setSpeed current auto 4");
    run("setBoundsSource current -3 0 0 4");
  }
  run("add trigger 2000");
  run("setPos current 0 2 0");
}`;

describe('IanniX commands', () => {
  it('tokenizes quoted and plain words', () => {
    expect(tokenize('setMessage current 1, "a b" c')).toEqual(['setMessage', 'current', '1,', 'a b', 'c']);
  });
  it('runs a script and builds objects', () => {
    const run = runIannixScript(SIMPLE);
    const m = buildModel(run.ops);
    expect(m.filter(o => o.role === 'curve')).toHaveLength(3);
    expect(m.find(o => o.id === '0').curve).toBe('1000');
    expect(m.find(o => o.id === '2000').position).toEqual([0, 2]);
  });
  it('reads patterns as loops', () => {
    expect(loopOf('0 0 1 0')).toBe('once'); expect(loopOf('0 0 1')).toBe('loop'); expect(loopOf('0 0 1 -1')).toBe('pingpong'); expect(loopOf('')).toBe('once');
  });
  it('samples Bézier controls and ellipses', () => {
    const m = buildModel(runIannixScript(`function makeWithScript(){ run("add curve 1"); run("setPointAt current 0 0 0"); run("setPointAt current 1 4 0 0 0 2 0 0 -2 0"); run("add curve 2"); run("setPointsEllipse current 2 1"); }`).ops);
    const a = curvePoints(m.find(o => o.id === '1'));
    expect(a.length).toBeGreaterThan(10); expect(a.at(-1)).toEqual([4, 0]);
    expect(Math.max(...a.map(p => p[1]))).toBeGreaterThan(0.5);
    const e = curvePoints(m.find(o => o.id === '2'));
    expect(e[0][0]).toBeCloseTo(2);
  });
  it('turns messages into emit code, and says what it cannot', () => {
    const warns = [];
    const code = emitFor(['1, midi://midi_out/note 2 60 100 0.5, osc://ip_out:port_out/x trigger_id'], w => warns.push(w));
    expect(code).toContain('note(2, 60, 100, 0.5)');
    expect(warns).toHaveLength(1);
    expect(emitFor(undefined, () => {})).toContain('notef(1, vy, vx, 0.35)');
  });
});

describe('an IanniX score as an AMS score', () => {
  it('writes score code that runs, and plays', () => {
    const { code, stats, warnings } = iannixToScore(SIMPLE, { title: 'Test' });
    expect(stats).toEqual({ curves: 3, cursors: 3, triggers: 1 });
    expect(warnings).toEqual([]);
    const res = runScoreInto(normalizeDocument(createDocument()), code, { board: 'main' });
    expect(res.error).toBeNull();
    const doc = res.doc;
    const board = boardsOf(doc).find(b => b.title === 'Test');
    expect(board).toBeTruthy();
    // The trigger is at (0, 2): the first cursor climbs the vertical x = 0 and its bar passes it half way through its 4 s lap.
    const out = [];
    const ctx = { tempo: 120, signature: { numerator: 4, denominator: 4 }, fps: 30 };
    const { def } = compileDoc(doc, { board: board.id, ctx, helpers: (event, api) => musicHelpers({ out: m => out.push(m), ctx, event, api }) });
    const ev = renderEvents(def, 5);
    const enters = ev.filter(e => e.type === 'enter');
    expect(enters.length).toBeGreaterThanOrEqual(1);
    expect(enters.some(e => Math.abs(e.t - 2) < 0.02)).toBe(true);   // 4 s lap, the trigger is half way
    // trigger_value_y 2/4 → note 63, trigger_value_x (0 - -3) / 3 → velocity 127: IanniX's notef 1 value_y value_x
    const on = out.find(m => (m.bytes[0] & 0xf0) === 0x90);
    expect(on.bytes).toEqual([0x90, 63, 127]);
  });
});

// The real example scores, when the IanniX examples are on this machine (they are CC BY-NC-SA and not part of this repo).
const EXAMPLES = path.join(os.homedir(), 'Documents/IanniX/Examples');
const have = fs.existsSync(EXAMPLES);
describe.skipIf(!have)('the IanniX example scores', () => {
  const files = have ? fs.readdirSync(EXAMPLES).filter(f => f.endsWith('.iannix')) : [];
  for (const f of files) {
    it(`${f}`, () => {
      const src = fs.readFileSync(path.join(EXAMPLES, f), 'utf8');
      let res;
      try { res = iannixToScore(src, { title: f.replace('.iannix', '') }); } catch (e) { throw new Error(`${f}: ${e.message}`); }
      if (!res.code) return;   // (a score of triggers alone, or empty)
      const run = runScoreInto(normalizeDocument(createDocument()), res.code, { board: 'main' });
      expect(run.error, `${f}: ${run.error}`).toBeNull();
    });
  }
});

import { describe, it, expect } from 'vitest';
import { normalizeDocument } from '../process/document.js';
import { normalizeTransport } from '../time/sceneTransport.js';
import { createScoreRuntime, scoreExport, FORMAT } from './runtime.js';

const S = normalizeTransport({ tempo: 120, beatUnits: 25 });
const doc = () => normalizeDocument({ artboard: { width: 400, height: 200 }, elements: [
  { id: 'O', label: 'loop', role: 'line', closed: true, path: 'straight', points: [[100, 50], [300, 50], [300, 150], [100, 150]], play: { path: true } },
  { id: 'lead', label: 'lead', role: 'point', points: [[100, 50]], play: { travel: { on: 'O', dur: 8 }, out: 'u' } },
  { id: 'g', label: 'gate', role: 'line', path: 'straight', points: [[200, 40], [200, 60]], play: { trigger: { on: ['cross'] } } }] });

describe('the standalone score runtime', () => {
  it('a score exports as plain JSON and plays the same in a page with no editor', () => {
    const json = JSON.parse(JSON.stringify(scoreExport(doc(), S)));
    expect(json.format).toBe(FORMAT);
    const rt = createScoreRuntime(json);
    const f = rt.features(2);
    expect(f.features['lead.u']).toBeCloseTo(0.25, 1);
    expect(f.ports.u).toBeCloseTo(0.25, 1);   // the designated output
    expect(rt.recent(0, 'gate').some(e => e.phase === 'cross' || e.phase === 'entry')).toBe(true);
  });

  it('refuses something that is not a score export', () => {
    expect(() => createScoreRuntime({ format: 'x' })).toThrow();
  });

  it('a designated input places a traveler', () => {
    const json = scoreExport(doc(), S);
    json.elements.find(e => e.id === 'lead').play.in = 'place';
    const rt = createScoreRuntime(json);
    rt.features(1);
    expect(rt.setInput('place', 0.5)).toBe(true);
    expect(rt.features(1.01).features['lead.u']).toBeCloseTo(0.5, 1);
    expect(rt.setInput('nothing', 1)).toBe(false);
  });
});

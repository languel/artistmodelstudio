import { describe, it, expect } from 'vitest';
import { normalizeDocument } from '../process/document.js';
import { normalizeTransport } from '../time/sceneTransport.js';
import { renderScore, buildEntries } from './runner.js';
import { sampleFeatures, createBus } from './bus.js';

const S = normalizeTransport({ tempo: 120, beatUnits: 25 });
// A board 400 × 200 with a closed loop around its middle; a traveler named 'lead' and an event 'gate' on the top edge.
const doc = () => normalizeDocument({ artboard: { width: 400, height: 200 }, elements: [
  { id: 'O', label: 'loop', role: 'line', closed: true, path: 'straight', points: [[100, 50], [300, 50], [300, 150], [100, 150]], play: { path: true } },
  { id: 'lead', label: 'lead', role: 'point', points: [[100, 50]], play: { travel: { on: 'O', dur: 8 } } },
  { id: 'g', label: 'gate', role: 'line', path: 'straight', points: [[200, 40], [200, 60]], play: { trigger: { on: ['cross'] } } }] });

describe('the score bus', () => {
  it('samples a traveler normalized to its board, with its place along the path', () => {
    const d = doc();
    const entries = buildEntries(d, S);
    const { features } = sampleFeatures(entries, 2, d);
    // after 2 s of 8 s around the loop: a quarter of the way round, from the top left (y up: the top is near 1)
    expect(features['lead.u']).toBeCloseTo(0.25, 1);
    expect(features['lead.x']).toBeGreaterThan(0.4);
    expect(features['lead.y']).toBeGreaterThan(0.7);
    expect(features['lead.active']).toBe(1);
    expect(features['lead.lap']).toBe(0);
  });

  it('records entry, exit and cross events by name, and reports the traveler that caused them', () => {
    const d = doc();
    const { events } = renderScore(d, S, 9);
    const bus = createBus();
    bus.record(events.filter(e => e.trigger), { id: 'main', title: 'Main' }, d);
    const names = bus.recent(0).map(e => `${e.name}:${e.phase}`);
    expect(names.length).toBeGreaterThan(0);
    const cross = bus.recent(0, 'gate').find(e => e.phase === 'cross' || e.phase === 'entry');
    expect(cross).toBeTruthy();
    expect(cross.traveler).toBe('lead');
    expect(cross.x).toBeGreaterThan(0.4);
  });

  it('subscribers get only what they asked for, throttled to their rate', () => {
    let clock = 0;
    const bus = createBus({ now: () => clock });
    const frames = [];
    const unsub = bus.subscribe({ names: ['lead'], hz: 10, onFrame: f => frames.push(f) });
    const make = () => ({ t: 0, playing: true, features: { 'lead.x': 0.5, 'gate.active': 1 }, ports: {} });
    for (let i = 0; i < 10; i++) { clock = i * 50; bus.frame(make); }   // 500 ms at 20 ms steps
    expect(frames.length).toBe(5);                                       // 10 Hz
    expect(Object.keys(frames[0].features)).toEqual(['lead.x']);
    unsub();
    clock = 9999; bus.frame(make);
    expect(frames.length).toBe(5);
  });

  it('reads by name prefix', () => {
    const bus = createBus();
    const f = { 'lead.x': 0.1, 'lead.u': 0.2, 'gate.active': 1 };
    expect(bus.read('lead', { features: f })).toEqual({ 'lead.x': 0.1, 'lead.u': 0.2 });
    expect(bus.read('', { features: f })).toEqual(f);
  });
});

import { describe, it, expect } from 'vitest';
import { diffDocs, applyDiff, createTake, docAt, summarize, duration, cameraAt, partial, touch } from '../src/process/take.js';
import { runScript } from '../src/process/script.js';

const base = runScript(`artboard(400, 300)\nstage('A', 'marks')\npoint(0.5, 0.5)`).doc;
const withLine = () => { const d = structuredClone(base); d.elements.push({ ...structuredClone(d.elements[0]), id: 'L', role: 'line', points: [[0, 0, 0, 0.5], [10, 0, 100, 0.5], [20, 0, 200, 0.5], [30, 0, 300, 0.5]] }); return d; };

describe('takes', () => {
  it('diffs and applies element changes', () => {
    const next = withLine();
    next.elements[0] = { ...next.elements[0], color: '#ff0000' };
    const d = diffDocs(base, next);
    expect(d.add.map(e => e.id)).toEqual(['L']);
    expect(d.update[0].color).toBe('#ff0000');
    expect(JSON.stringify(applyDiff(base, d).elements)).toBe(JSON.stringify(next.elements));
    expect(diffDocs(next, next)).toBeNull();
    const rm = diffDocs(next, { ...next, elements: [next.elements[1]] });
    expect(rm.remove).toEqual([next.elements[0].id]);
  });

  it('reveals a stroke along its time during its clip', () => {
    const take = createTake({ title: 't', baseline: base, clips: [{ id: 'c', track: 'draw', start: 1000, dur: 1000, diff: diffDocs(base, withLine()), fx: {} }] });
    expect(docAt(take, 500).elements).toHaveLength(1);
    const mid = docAt(take, 1500).elements.find(e => e.id === 'L');
    expect(mid.points.length).toBeGreaterThan(1);
    expect(mid.points.length).toBeLessThan(4);
    expect(docAt(take, 2500).elements.find(e => e.id === 'L').points).toHaveLength(4);
    expect(duration(take)).toBe(2000);
  });

  it('partial elements: strokes by time, planes and notes fade in', () => {
    expect(partial({ role: 'plane', points: [[0, 0], [1, 0], [1, 1]] }, 0.5).opacity).toBe(0.5);
  });

  it('summary keeps narration, speeds through analysis, and ends on a hold', () => {
    const guideDoc = structuredClone(base); guideDoc.elements.push({ ...structuredClone(base.elements[0]), id: 'G', role: 'guide' });
    const take = createTake({ title: 'Run', baseline: base, clips: [
      { id: 'a', track: 'draw', start: 0, dur: 8000, diff: diffDocs(base, guideDoc), fx: {} },
      { id: 'b', track: 'action', start: 9000, dur: 500, name: 'ams_analyze', fx: {} },
      { id: 'c', track: 'say', start: 30000, dur: 9000, text: 'Look at the weight low left.', fx: {} },
      { id: 'd', track: 'draw', start: 60000, dur: 20000, diff: diffDocs(guideDoc, { ...guideDoc, elements: [...guideDoc.elements, withLine().elements[1]] }), fx: {} }
    ] });
    const s = summarize(touch(take));
    expect(duration(s)).toBeLessThan(duration(take) / 5);
    expect(s.clips.some(c => c.track === 'action')).toBe(false);
    expect(s.clips.find(c => c.track === 'say').text).toMatch(/weight/);
    expect(s.clips.at(-1).track).toBe('title');
    expect(docAt(s, duration(s)).elements.map(e => e.id)).toEqual(expect.arrayContaining(['G', 'L']));
  });

  it('a summary of dense narration is still shorter than the source', () => {
    const clips = Array.from({ length: 20 }, (_, i) => ({ id: `s${i}`, track: 'say', start: i * 1800, dur: 1800, text: 'Step: block the large mass on the left, middle value, following its direction.', fx: {} }));
    const take = createTake({ title: 'Dense', baseline: base, clips });
    const s = summarize(take);
    expect(duration(s)).toBeLessThanOrEqual(duration(take) * 0.5 + 2800);   // plus the closing hold
  });

  it('tracks: add more of a kind; muted tracks do not play', async () => {
    const { tracksOf, addTrack } = await import('../src/process/take.js');
    const take = createTake({ title: 't', baseline: base, clips: [{ id: 's1', track: 'say', start: 0, dur: 1000, text: 'a', fx: {} }] });
    // Only the tracks something sits on: a narration clip makes a Narration track.
    expect(tracksOf(take).map(t => t.id)).toEqual(['say']);
    const n2 = addTrack(take, 'say');
    expect(tracksOf(take).map(t => t.id)).toEqual(['say', n2.id]);
    // A new kind goes in the usual order (titles first), and is named for its kind.
    const ti = addTrack(take, 'title');
    expect(ti).toMatchObject({ id: 'title', name: 'Titles' });
    expect(tracksOf(take).map(t => t.id)).toEqual(['title', 'say', n2.id]);
    take.clips.push({ id: 's2', track: 'say', lane: n2.id, start: 0, dur: 1000, text: 'b', fx: {} });
    const { activeAt } = await import('../src/process/take.js');
    expect(activeAt(take, 'say', 500).map(c => c.text)).toEqual(['a', 'b']);
    n2.muted = true;
    expect(activeAt(take, 'say', 500).map(c => c.text)).toEqual(['a']);
  });

  it('tracks: a take starts with none; a clip of a new kind brings its track; old takes keep only used tracks', async () => {
    const { tracksOf, TRACKS, TRACK_NAMES } = await import('../src/process/take.js');
    const empty = createTake({ title: 't', baseline: base });
    expect(tracksOf(empty)).toEqual([]);
    empty.clips.push({ id: 'a1', track: 'audio', start: 0, dur: 1000, fx: {} });
    expect(tracksOf(empty).map(t => t.kind)).toEqual(['audio']);
    // Saved before: all six tracks, untouched; only the ones with clips stay.
    const old = createTake({ title: 'o', baseline: base, clips: [{ id: 'c', track: 'camera', start: 0, dur: 0, z: 1 }] });
    const SIX = ['title', 'say', 'draw', 'action', 'camera', 'audio'];
    old.tracks = SIX.map(k => ({ id: k, kind: k, name: TRACK_NAMES[k] }));
    expect(tracksOf(old).map(t => t.id)).toEqual(['camera']);
    // …but tracks someone named or muted are theirs.
    const kept = createTake({ title: 'k', baseline: base });
    kept.tracks = SIX.map(k => ({ id: k, kind: k, name: k === 'say' ? 'Voice' : TRACK_NAMES[k] }));
    expect(tracksOf(kept)).toHaveLength(6);
  });

  it('camera eases between keyframes', () => {
    const take = createTake({ baseline: base, clips: [{ id: 'k1', track: 'camera', start: 0, dur: 0, cx: 0.5, cy: 0.5, z: 1 }, { id: 'k2', track: 'camera', start: 2000, dur: 1000, cx: 0.2, cy: 0.2, z: 2 }] });
    expect(cameraAt(take, 500).z).toBe(1);
    expect(cameraAt(take, 1500).z).toBeCloseTo(1.5, 1);
    expect(cameraAt(take, 3000).z).toBe(2);
  });

  it('compositions: grouped clips play at the same times; a stretched one plays them faster; it shows only what fits', async () => {
    const { precompose, decompose, flatClips } = await import('../src/process/take.js');
    const add = (id, start, dur) => ({ id, track: 'draw', start, dur, diff: { add: [{ ...base.elements[0], id: `e${id}` }] }, fx: {} });
    const take = createTake({ baseline: { ...base, elements: [] }, clips: [add('a', 1000, 500), add('b', 2000, 500), add('c', 5000, 500)] });
    const before = docAt(take, 2200).elements.map(e => e.id);
    const comp = precompose(take, ['a', 'b'], { title: 'Phrase' });
    expect(comp).toMatchObject({ track: 'comp', start: 1000, dur: 1500, label: 'Phrase' });
    expect(comp.comp.clips.map(c => c.start)).toEqual([0, 1000]);
    expect(take.clips.map(c => c.id).sort()).toEqual(['c', comp.id].sort());
    touch(take);
    expect(flatClips(take).filter(c => c.track === 'draw').map(c => c.start).sort((x, y) => x - y)).toEqual([1000, 2000, 5000]);
    expect(docAt(take, 2200).elements.map(e => e.id)).toEqual(before);
    // Stretched to half its length: it plays twice as fast.
    comp.dur = 750; comp.rate = 2; touch(take);
    const inner = flatClips(take).filter(c => c.id === 'a' || c.id === 'b');
    expect(inner.map(c => [c.start, c.dur])).toEqual([[1000, 250], [1500, 250]]);
    // Trimmed: what starts past its end does not play.
    comp.rate = 1; comp.dur = 900; touch(take);
    expect(flatClips(take).map(c => c.id).sort()).toEqual(['a', 'c']);
    // Nested: a composition in a composition.
    comp.dur = 1500; touch(take);
    const outer = precompose(take, [comp.id, 'c'], { title: 'Outer' });
    touch(take);
    expect(flatClips(take).map(c => c.start).sort((x, y) => x - y)).toEqual([1000, 2000, 5000]);
    // Ungrouped, everything is back where it was.
    decompose(take, outer);
    decompose(take, take.clips.find(c => c.track === 'comp'));
    touch(take);
    expect(take.clips.map(c => [c.id, c.start]).sort()).toEqual([['a', 1000], ['b', 2000], ['c', 5000]]);
  });

  it('compositions: muting a track inside one silences what is on it', async () => {
    const { precompose, flatClips } = await import('../src/process/take.js');
    const take = createTake({ baseline: base, clips: [{ id: 's1', track: 'say', start: 0, dur: 1000, text: 'a', fx: {} }] });
    const comp = precompose(take, ['s1']);
    comp.comp.tracks[0].muted = true; touch(take);
    expect(flatClips(take)[0].muted).toBe(true);
  });
});

import { describe, it, expect } from 'vitest';
import { touch } from '../process/take.js';
import { stopmotionPicture, onAirShot, cutTo, parallaxRect, camerasOf, addCamera, shotAt, viewFor, poseAt, boardShot, cameraSource } from './camera.js';

const doc = { boards: [{ id: 'b1', title: 'One', x: 100, y: 50, width: 800, height: 600 }], artboard: { width: 1000, height: 1000 } };
// boardsOf/boardById read the document: a main board at the origin and `boards`.
const mkDoc = () => ({ ...doc, artboard: { title: 'Main', width: 1000, height: 1000, ground: '#fff' }, elements: [], stages: [] });

describe('camera', () => {
  it('a take gets a first camera and can add more', () => {
    const take = { clips: [] };
    expect(camerasOf(take).map(c => c.name)).toEqual(['Camera 1']);
    const c2 = addCamera(take);
    expect(c2.id).toBe('cam2'); expect(cameraSource(c2)).toBe('camera-2'); expect(camerasOf(take).length).toBe(2);
  });
  it('the shot that started last is on air; a camera has its own', () => {
    const take = { clips: [
      { id: 'a', track: 'shot', camera: 'cam1', start: 0, dur: 5000, target: { board: 'b1' } },
      { id: 'b', track: 'shot', camera: 'cam2', start: 3000, dur: 4000, target: { board: 'main' } }] };
    expect(shotAt(take, 1000).id).toBe('a');
    expect(shotAt(take, 4000).id).toBe('b');
    expect(shotAt(take, 4000, 'cam1').id).toBe('a');
    expect(shotAt(take, 9000)).toBe(null);
  });
  it('frames a board contained in the camera, and moves between poses', () => {
    const d = mkDoc(), shot = { start: 0, dur: 1000, target: { board: 'b1' }, z: 1, dx: 0, dy: 0 };
    const v = viewFor(d, shot, 0, 1280, 720);
    expect(v.k).toBeCloseTo(Math.min(1280 / 800, 720 / 600));   // 1.2: the height fits
    expect(v.rect.h).toBeCloseTo(600);
    expect(v.rect.x + v.rect.w / 2).toBeCloseTo(500);           // centred on the board
    const mv = { ...shot, to: { dx: 0, dy: 0, z: 2 } };
    expect(poseAt(mv, 0).z).toBe(1); expect(poseAt(mv, 1000).z).toBe(2); expect(poseAt(mv, 500).z).toBeCloseTo(1.5);
    expect(boardShot({ id: 'b1', title: 'One' }, { id: 'cam2' }).camera).toBe('cam2');
  });
  it('parallax: a far board moves less than a near one when the camera pans', () => {
    const near = { x: 100, y: 0, width: 200, height: 100 }, far = { ...near, depth: 1 };
    const at = (b, cx) => parallaxRect(b, cx, 50).x - cx;   // (where it sits relative to the middle of the view)
    const pan = b => at(b, 300) - at(b, 100);               // the view centre moves 200 right
    expect(pan(near)).toBeCloseTo(-200);                    // a near board slides left by the same amount
    expect(pan(far)).toBeCloseTo(-100);                     // a board at depth 1 slides half as much
    expect(parallaxRect(far, 0, 0).w).toBeCloseTo(100);     // and is half the size
    expect(parallaxRect({ ...near, depth: 0 }, 55, 7).w).toBe(200);
  });
  it('cuts: with cut clips the camera of the cut on air shows its own shot; live switching ends the cut it interrupts', () => {
    const take = { clips: [
      { id: 'a', track: 'shot', camera: 'cam1', start: 0, dur: 10000, target: { board: 'b1' } },
      { id: 'b', track: 'shot', camera: 'cam2', start: 0, dur: 10000, target: { board: 'main' } }] };
    expect(onAirShot(take, 1000).id).toBe('b');                   // no cuts: the shot that started last (ties: the later in the list)
    cutTo(take, 'cam1', 2000, 10000); touch(take);
    expect(onAirShot(take, 1000)).toBe(null);                     // cuts exist, none covers 1 s: nothing on air
    expect(onAirShot(take, 3000).id).toBe('a');
    cutTo(take, 'cam2', 5000, 10000); touch(take);
    const cuts = take.clips.filter(c => c.track === 'cut');
    expect(cuts.map(c => [c.camera, c.start, c.dur])).toEqual([['cam1', 2000, 3000], ['cam2', 5000, 5000]]);
    expect(onAirShot(take, 4999).id).toBe('a'); expect(onAirShot(take, 5000).id).toBe('b');
  });
  it('a stop-motion board shows its frames at its fps, looping, held for `hold` steps', () => {
    const images = new Map([['a', { n: 'A' }], ['b', { n: 'B' }], ['c', { n: 'C' }]]);
    const app = { stopmotion: { spec: () => ({ sm: { frames: ['a', 'b', 'c'], fps: 2, hold: 1, loop: true, in: 0, out: null } }), state: () => ({ images }), image: () => Promise.resolve() } };
    const at = t => stopmotionPicture(app, { id: 's' }, t).n;
    expect([at(0), at(500), at(1000), at(1500), at(2999)]).toEqual(['A', 'B', 'C', 'A', 'C']);
    app.stopmotion.spec = () => ({ sm: { frames: ['a', 'b', 'c'], fps: 2, hold: 2, loop: false, in: 0, out: null } });
    expect([at(0), at(900), at(1000), at(5000)]).toEqual(['A', 'A', 'B', 'C']);
  });
});

import { onionTimes } from './camera.js';
describe('onion skin', () => {
  it('lists ghost times before and after, nearest first, within the take', () => {
    const g = onionTimes(300, { before: 2, after: 1, step: 100, opacity: 0.4 }, 350);
    expect(g.map(x => [x.side, x.t])).toEqual([['before', 200], ['after', 400 > 350 ? null : 400], ['before', 100]].filter(x => x[1] != null));
    expect(g[0].a).toBeCloseTo(0.4); expect(g[1].a).toBeCloseTo(0.2);
  });
  it('drops ghosts before zero', () => {
    expect(onionTimes(50, { before: 2, step: 100 }).length).toBe(0);
  });
});

import { describe, it, expect } from 'vitest';
import { camerasOf, addCamera, shotAt, viewFor, poseAt, boardShot, cameraSource } from './camera.js';

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
});

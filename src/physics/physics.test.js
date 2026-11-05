import { describe, it, expect, beforeAll } from 'vitest';
import R from '@dimforge/rapier2d-deterministic-compat';
import { physicsScene, roleOf, shapesOf, convexHull, roundness, bodyContains, placeAt } from './model.js';
import { createCore } from './core.js';
import { createPhysicsHost } from './host.js';

beforeAll(async () => { await R.init({}); });

const circle = (cx, cy, r, n = 24) => Array.from({ length: n }, (_, i) => [cx + Math.cos((i / n) * Math.PI * 2) * r, cy + Math.sin((i / n) * Math.PI * 2) * r, 0, 0.5]);
const doc = (elements, physics = { on: true }) => ({ artboard: { width: 1000, height: 800, physics }, stages: [{ id: 's' }], elements });

describe('physics: what the drawing is', () => {
  it('infers roles: closed falls, open is ground, points are balls, notes and paths are not physical', () => {
    expect(roleOf({ role: 'plane', points: circle(0, 0, 10) })).toEqual({ type: 'dynamic', shape: 'auto' });
    expect(roleOf({ role: 'line', points: [[0, 0], [100, 0]] })).toEqual({ type: 'static', shape: 'chain' });
    expect(roleOf({ role: 'point', points: [[0, 0]] })).toEqual({ type: 'dynamic', shape: 'circle' });
    expect(roleOf({ role: 'note', points: [[0, 0]] })).toBe(null);
    expect(roleOf({ role: 'line', points: [[0, 0], [9, 9]], play: { path: true } })).toBe(null);
    expect(roleOf({ role: 'line', points: [[0, 0], [9, 9]], play: { phys: { type: 'dynamic' } } })).toEqual({ type: 'dynamic', shape: 'auto' });
    expect(roleOf({ role: 'plane', points: circle(0, 0, 10), play: { phys: { type: 'none' } } })).toBe(null);
  });

  it('finds circles, hulls and chains', () => {
    expect(roundness(circle(50, 60, 20)).r).toBeCloseTo(20, 0);
    const sq = [[0, 0], [10, 0], [10, 10], [0, 10], [5, 5]];
    expect(convexHull(sq)).toHaveLength(4);
    const ball = shapesOf({ role: 'plane', points: circle(50, 60, 20) });
    expect(ball.shapes[0].kind).toBe('ball');
    expect(ball.c[0]).toBeCloseTo(50, 3);
    const box = shapesOf({ role: 'plane', points: [[0, 0], [100, 0], [100, 40], [0, 40]].map(p => [...p, 0, 0.5]) });
    expect(box.shapes[0].kind).toBe('hull');
    expect(box.c[0]).toBeCloseTo(50, 6); expect(box.c[1]).toBeCloseTo(20, 6);
    const line = shapesOf({ role: 'line', points: [[0, 0], [50, 0], [100, 0]] });
    expect(line.shapes.every(s => s.kind === 'capsule')).toBe(true);
    expect(bodyContains({ c: box.c, shapes: box.shapes }, 50, 20)).toBe(true);
    expect(bodyContains({ c: box.c, shapes: box.shapes }, 150, 20)).toBe(false);
  });

  it('makes a scene per board with physics on; joints find what is under them', () => {
    expect(physicsScene(doc([], { on: false }))).toEqual([]);
    const sc = physicsScene(doc([
      { id: 'wheel', role: 'plane', points: circle(200, 200, 30) },
      { id: 'car', role: 'plane', points: [[150, 150], [400, 150], [400, 210], [150, 210]].map(p => [...p, 0, 0.5]) },
      { id: 'h', role: 'point', points: [[200, 200, 0, 0.5]], play: { hinge: { motor: { speed: 180 } } } },
      { id: 'pin', role: 'point', points: [[600, 100, 0, 0.5]], play: { hinge: true } }
    ]))[0];
    expect(sc.bodies.map(b => b.id)).toEqual(['wheel', 'car']);
    const h = sc.joints.find(j => j.id === 'h');
    expect([h.a, h.b].sort()).toEqual(['car', 'wheel']);
    expect(h.motor.speed).toBe(180);
    expect(sc.joints.some(j => j.id === 'pin')).toBe(false);   // (nothing under it)
  });
});

describe('physics: the engine', () => {
  const fall = () => physicsScene(doc([{ id: 'ball', role: 'plane', points: circle(500, 100, 25) }]))[0];

  it('a ball falls and comes to rest on the floor', () => {
    const core = createCore(R, fall());
    const p1 = core.to(0.5).poses, p2 = core.to(4).poses;
    expect(p1[1]).toBeGreaterThan(100);
    expect(p2[1]).toBeCloseTo(800 - 25, -1);   // on the floor (the board's bottom)
    core.free();
  });

  it('is the same every run, and a seek back gives the same as playing through', () => {
    const scene = physicsScene(doc([
      ...[0, 1, 2, 3, 4].map(i => ({ id: `b${i}`, role: 'plane', points: circle(300 + i * 37, 100 - i * 60, 20) })),
      { id: 'ramp', role: 'line', points: [[100, 500, 0, .5], [900, 700, 0, .5]] }
    ]))[0];
    const a = createCore(R, scene), b = createCore(R, scene);
    const pa = a.to(3).poses, pb = b.to(3).poses;
    expect([...pa]).toEqual([...pb]);
    a.to(6); const back = a.to(3).poses;   // (back from a checkpoint)
    expect([...back]).toEqual([...pa]);
    a.free(); b.free();
  });

  it('reports contacts with where and how hard', () => {
    const scene = physicsScene(doc([{ id: 'ball', role: 'plane', points: circle(500, 600, 20), play: { trigger: {} } }, { id: 'floor', role: 'line', points: [[0, 700, 0, .5], [1000, 700, 0, .5]] }], { on: true, walls: false }))[0];
    const core = createCore(R, scene);
    const evs = [];
    for (let t = 0.05; t < 1.5; t += 0.05) evs.push(...core.to(t).events);
    const hit = evs.find(e => e.type === 'collide');
    expect(hit).toBeTruthy();
    expect([hit.a, hit.b].sort()).toEqual(['ball', 'floor']);
    expect(hit.y).toBeGreaterThan(680);
    expect(hit.speed).toBeGreaterThan(50);
    core.free();
  });

  it('a hinge holds a pendulum to the world; a motor turns a wheel', () => {
    const pend = physicsScene(doc([
      { id: 'bob', role: 'plane', points: [[480, 100], [720, 100], [720, 130], [480, 130]].map(p => [...p, 0, .5]) },
      { id: 'pin', role: 'point', points: [[500, 115, 0, .5]], play: { hinge: true } }
    ], { on: true, walls: false }))[0];
    const core = createCore(R, pend);
    const pose = core.to(1).poses;
    const tip = placeAt({ x: pose[0], y: pose[1], a: pose[2] }, pend.bodies[0].c, 500, 115);
    expect(Math.hypot(tip[0] - 500, tip[1] - 115)).toBeLessThan(3);   // the pinned point stays
    expect(Math.abs(pose[2])).toBeGreaterThan(0.3);                   // and it swings
    core.free();
    const wheel = physicsScene(doc([
      { id: 'w', role: 'plane', points: circle(500, 400, 40) },
      { id: 'axle', role: 'point', points: [[500, 400, 0, .5]], play: { hinge: { motor: { speed: 360 } } } }
    ], { on: true, walls: false, gravity: [0, 0] }))[0];
    const c2 = createCore(R, wheel);
    const a = c2.to(0.25).poses[2];
    expect(Math.abs(a)).toBeGreaterThan(1.2);   // a quarter turn in a quarter second (π/2; angles wrap at ±π, so not later)
    c2.free();
  });

  it('a weld glues two things so they fall as one; a spring holds a weight up', () => {
    const glued = physicsScene(doc([
      { id: 'a', role: 'plane', points: [[400, 100], [500, 100], [500, 140], [400, 140]].map(p => [...p, 0, .5]) },
      { id: 'b', role: 'plane', points: [[480, 120], [560, 120], [560, 200], [480, 200]].map(p => [...p, 0, .5]) },
      { id: 'w', role: 'point', points: [[490, 130, 0, .5]], play: { weld: true } }
    ]))[0];
    expect(glued.joints[0]).toMatchObject({ kind: 'weld' });
    const core = createCore(R, glued);
    const p = core.to(1).poses;
    expect(p[2]).toBeCloseTo(p[5], 3);              // they turn together
    const da = placeAt({ x: p[0], y: p[1], a: p[2] }, glued.bodies[0].c, 490, 130), db = placeAt({ x: p[3], y: p[4], a: p[5] }, glued.bodies[1].c, 490, 130);
    expect(Math.hypot(da[0] - db[0], da[1] - db[1])).toBeLessThan(2);   // and the glued point stays one point
    core.free();
    const hung = physicsScene(doc([
      { id: 'weight', role: 'plane', points: circle(500, 400, 20) },
      { id: 's', role: 'line', points: [[500, 100, 0, .5], [500, 400, 0, .5]], play: { spring: { stiffness: 200 } } }
    ], { on: true, walls: false }))[0];
    const c2 = createCore(R, hung);
    const y = c2.to(3).poses[1];
    expect(y).toBeGreaterThan(400);   // it stretches
    expect(y).toBeLessThan(700);      // but holds
    c2.free();
  });

  it('a traveler made physical follows its path and pushes what is in the way; a seek replays it', () => {
    const scene = physicsScene(doc([
      { id: 'ball', role: 'plane', points: circle(500, 775, 25) },
      { id: 'pusher', role: 'point', points: [[100, 770, 0, .5]], realize: { params: { size: 40 } }, play: { travel: { on: 'P' }, phys: { type: 'kinematic' } } }
    ]))[0];
    const pusher = scene.bodies.find(b => b.id === 'pusher');
    expect(pusher).toMatchObject({ type: 'kinematic', traveler: true });
    pusher.follow = { pts: [[100, 770], [900, 770]], spec: { start: 0, dur: 2, rate: 1, loop: 'once' } };
    const core = createCore(R, scene);
    const i = core.moving.indexOf('ball'), j = core.moving.indexOf('pusher');
    const p = core.to(2).poses;
    expect(p[j * 3]).toBeCloseTo(900, 0);       // the pusher went along its path
    expect(p[i * 3]).toBeGreaterThan(700);      // and pushed the ball ahead of it
    const again = core.to(1.2).poses, fresh = createCore(R, scene).to(1.2).poses;
    expect([...again]).toEqual([...fresh]);     // the same from a seek as from the start
    core.free();
  });

  it('the host runs worlds in the page when there is no worker, one request at a time per board', async () => {
    const frames = [];
    const host = createPhysicsHost({ onFrame: (board, f) => frames.push([board, f.n, f.poses[1]]) });
    host.load('main', physicsScene(doc([{ id: 'ball', role: 'plane', points: circle(500, 100, 25) }]))[0]);
    host.to('main', 0.5); host.to('main', 1); host.to('main', 1.5);   // (the last two: only the newest is kept while busy)
    await new Promise(r => setTimeout(r, 300));
    expect(host.inWorker).toBe(false);
    expect(frames.map(f => f[1])).toEqual([30, 90]);
    expect(frames[1][2]).toBeGreaterThan(frames[0][2]);
    host.drop('main');
  });

  it('rewinding frame by frame gives the same poses as going straight there, and forward again is the same', () => {
    const scene = physicsScene(doc([
      ...[0, 1, 2, 3].map(i => ({ id: `b${i}`, role: 'plane', points: circle(380 + i * 41, 120 - i * 70, 22) })),
      { id: 'ramp', role: 'line', points: [[100, 500, 0, .5], [900, 650, 0, .5]] }
    ]))[0];
    const core = createCore(R, scene), straight = (t) => [...createCore(R, scene).to(t).poses];
    const forward = [...core.to(3).poses];
    for (let t = 3; t > 0.5; t -= 0.12) expect([...core.to(t).poses]).toEqual(straight(t));   // (a rewind: restore a checkpoint, replay to there)
    expect([...core.to(3).poses]).toEqual(forward);   // and forward again, the same
    core.free();
  });
});

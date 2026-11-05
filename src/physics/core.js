/**
 * The physics engine of a board: a Rapier 2D world built from a scene (src/physics/model.js), stepped at a
 * fixed 60 Hz so a run is the same every time. Time is asked for, not kept: `to(t)` brings the world to
 * simulation time t (seconds) — forward by stepping (contacts reported), backward or far ahead by restoring
 * the nearest checkpoint and stepping silently. So a transport can scrub, loop and pause it, and a free clock
 * can just keep asking for later times. Runs in the worker (physics.worker.js) or, without one, in the page.
 *
 *   const core = createCore(RAPIER, scene)
 *   core.to(t)            → { n, t, poses: Float32Array [x, y, angle]… (bodies in core.moving order), events }
 *   core.motor(jointId, degreesPerSecond) · core.impulse(bodyId, [x, y]) · core.free()
 *
 * Units: the scene is in pixels and seconds; the world in metres (scene.world.ppm pixels a metre). Contacts
 * come back as { t, type: 'collide' | 'release', a, b, x, y, speed } (pixels, pixels a second).
 */
import { localTime } from '../score/travel.js';

export const DT = 1 / 60;
const CHECKPOINT = 30;        // steps between checkpoints (half a second)
const MAX_CHECKPOINTS = 400;  // (kept; beyond that the oldest but the first go)
const FAR = 90;               // a jump ahead of more than this many steps is a seek (silent)

export function createCore(R, scene) {
  const W = scene.world, ppm = W.ppm || 50, m = v => v / ppm;
  let world = new R.World({ x: W.gravity?.[0] ?? 0, y: W.gravity?.[1] ?? 9.8 });
  world.timestep = DT;
  world.numSolverIterations = Math.max(1, Math.round(W.iterations || 4));
  const queue = new R.EventQueue(true);
  const handleOf = new Map(), idOfCollider = new Map(), jointHandle = new Map();
  const moving = [], restOf = new Map();

  // A fixed body at the origin: the world, for joints with one end.
  const ground = world.createRigidBody(R.RigidBodyDesc.fixed());

  for (const b of scene.bodies) {
    const desc = b.type === 'dynamic' ? R.RigidBodyDesc.dynamic() : b.type === 'kinematic' ? R.RigidBodyDesc.kinematicPositionBased() : R.RigidBodyDesc.fixed();
    desc.setTranslation(m(b.c[0]), m(b.c[1]));
    if (b.type === 'dynamic') {
      desc.setLinearDamping(b.damping ?? 0).setAngularDamping(b.angularDamping ?? 0).setCcdEnabled(true);
      if (b.v) desc.setLinvel(m(b.v[0]), m(b.v[1]));
      if (b.spin) desc.setAngvel((b.spin * Math.PI) / 180);
    }
    const body = world.createRigidBody(desc);
    handleOf.set(b.id, body.handle);
    restOf.set(b.id, b.c);
    if (b.type !== 'static') moving.push(b.id);
    for (const s of b.shapes) {
      const cd = colliderOf(R, s, m);
      if (!cd) continue;
      cd.setDensity(b.density ?? 1).setFriction(b.friction ?? 0.5).setRestitution(b.bounce ?? 0.2).setSensor(Boolean(b.sensor));
      cd.setActiveEvents(R.ActiveEvents.COLLISION_EVENTS);
      const col = world.createCollider(cd, body);
      idOfCollider.set(col.handle, b.id);
    }
  }

  // The board's floor and sides (no ceiling), just outside it.
  if (W.walls !== false && scene.board?.width) {
    const { x, y, width: bw, height: bh } = scene.board, t = 40;
    const wall = world.createRigidBody(R.RigidBodyDesc.fixed());
    for (const [cx, cy, hx, hy] of [[x + bw / 2, y + bh + t / 2, bw / 2 + t, t / 2], [x - t / 2, y + bh / 2, t / 2, bh / 2 + t], [x + bw + t / 2, y + bh / 2, t / 2, bh / 2 + t]]) {
      const col = world.createCollider(R.ColliderDesc.cuboid(m(hx), m(hy)).setTranslation(m(cx), m(cy)).setFriction(0.6).setActiveEvents(R.ActiveEvents.COLLISION_EVENTS), wall);
      idOfCollider.set(col.handle, '#walls');
    }
  }

  // Joints: anchors in each body's own frame (the world's: the board itself).
  const local = (id, p) => (id ? [m(p[0] - restOf.get(id)[0]), m(p[1] - restOf.get(id)[1])] : [m(p[0]), m(p[1])]);
  const bodyOf = id => (id ? world.getRigidBody(handleOf.get(id)) : ground);
  for (const j of scene.joints) {
    if ((j.a && !handleOf.has(j.a)) || (j.b && !handleOf.has(j.b))) continue;
    let data;
    if (j.kind === 'spring') {
      const [ax, ay] = local(j.a, j.pa), [bx, by] = local(j.b, j.pb);
      data = R.JointData.spring(m(j.rest), j.stiffness, j.damping, { x: ax, y: ay }, { x: bx, y: by });
    } else {
      const [ax, ay] = local(j.a, j.anchor), [bx, by] = local(j.b, j.anchor);
      data = j.kind === 'weld' ? R.JointData.fixed({ x: ax, y: ay }, 0, { x: bx, y: by }, 0) : R.JointData.revolute({ x: ax, y: ay }, { x: bx, y: by });
    }
    const joint = world.createImpulseJoint(data, bodyOf(j.a), bodyOf(j.b), true);
    jointHandle.set(j.id, joint.handle);
    if (j.kind === 'hinge') {
      if (j.limits) joint.setLimits((j.limits[0] * Math.PI) / 180, (j.limits[1] * Math.PI) / 180);
      if (j.motor) joint.configureMotorVelocity((j.motor.speed * Math.PI) / 180, Math.max(0.05, (j.motor.torque ?? 1000) / 10));
    }
    // Bodies joined do not collide with each other (a wheel and its car).
    if (j.a && j.b) joint.setContactsEnabled?.(false);
  }

  // Travelers made physical: kinematic bodies that follow their path, timed as the score times them
  // ({ pts: [[x, y]…] along the path, spec: { start, dur, rate, loop } }), worked out at every step so a seek replays them.
  const followers = scene.bodies.filter(b => b.follow?.pts?.length > 1 && handleOf.has(b.id));
  const followAt = (f, t) => {
    const u = localTime(t, f.spec).progress * (f.pts.length - 1), i = Math.min(f.pts.length - 2, Math.floor(u)), k = u - i;
    return [f.pts[i][0] + (f.pts[i + 1][0] - f.pts[i][0]) * k, f.pts[i][1] + (f.pts[i + 1][1] - f.pts[i][1]) * k];
  };
  for (const b of followers) { const [x, y] = followAt(b.follow, 0); world.getRigidBody(handleOf.get(b.id)).setTranslation({ x: m(x), y: m(y) }, true); }

  let n = 0;
  const checkpoints = new Map([[0, world.takeSnapshot()]]);
  const contactPoint = (c1, c2) => {
    let p = null;
    try { world.contactPair(world.getCollider(c1), world.getCollider(c2), manifold => { if (!p && manifold.numSolverContacts() > 0) p = manifold.solverContactPoint(0); }); } catch { /* ignore */ }
    return p;
  };
  // How hard: the speed between the two just before the step (after it, the bounce has already been solved).
  let before = null;
  const speedBetween = (a, b) => {
    const va = before?.get(a) || { x: 0, y: 0 }, vb = before?.get(b) || { x: 0, y: 0 };
    return Math.hypot((va?.x || 0) - (vb?.x || 0), (va?.y || 0) - (vb?.y || 0)) * ppm;
  };

  function stepOnce(events) {
    for (const b of followers) { const [x, y] = followAt(b.follow, (n + 1) * DT); world.getRigidBody(handleOf.get(b.id))?.setNextKinematicTranslation({ x: m(x), y: m(y) }); }
    before = events ? new Map(moving.map(id => [id, world.getRigidBody(handleOf.get(id))?.linvel()])) : null;
    world.step(queue);
    n++;
    queue.drainCollisionEvents((h1, h2, started) => {
      if (!events) return;
      const a = idOfCollider.get(h1), b = idOfCollider.get(h2);
      if (a == null || b == null) return;
      const p = started ? contactPoint(h1, h2) : null;
      const pos = p || world.getRigidBody(handleOf.get(a))?.translation() || { x: 0, y: 0 };
      events.push({ t: n * DT, type: started ? 'collide' : 'release', a, b, x: pos.x * ppm, y: pos.y * ppm, speed: started ? speedBetween(a, b) : 0 });
    });
    if (n % CHECKPOINT === 0 && !checkpoints.has(n)) {
      checkpoints.set(n, world.takeSnapshot());
      if (checkpoints.size > MAX_CHECKPOINTS) { const keys = [...checkpoints.keys()].sort((x, y) => x - y); checkpoints.delete(keys[1]); }
    }
  }

  function restore(k) {
    const snap = checkpoints.get(k);
    world.free();
    world = R.World.restoreSnapshot(snap);
    n = k;
  }

  function poses() {
    const out = new Float32Array(moving.length * 3);
    moving.forEach((id, i) => {
      const body = world.getRigidBody(handleOf.get(id));
      if (!body) return;
      const p = body.translation();
      out[i * 3] = p.x * ppm; out[i * 3 + 1] = p.y * ppm; out[i * 3 + 2] = body.rotation();
    });
    return out;
  }

  return {
    moving,
    get n() { return n; },
    /** Bring the world to time t (seconds). Contacts on the way are reported unless it was a seek. */
    to(t) {
      const target = Math.max(0, Math.round(t / DT));
      const events = [];
      if (target < n || target - n > FAR) {
        // A seek: from the nearest checkpoint at or before it, silently.
        let k = 0;
        for (const key of checkpoints.keys()) if (key <= target && key > k) k = key;
        if (target < n || k > n) restore(k);
        while (n < target) stepOnce(null);
      } else while (n < target) stepOnce(events);
      return { n, t: n * DT, poses: poses(), events };
    },
    /** A hinge's motor, now (degrees a second). Not deterministic unless the caller replays it at the same time. */
    motor(id, speed, torque = 1000) {
      const h = jointHandle.get(id); if (h == null) return false;
      const j = world.getImpulseJoint(h); if (!j) return false;
      j.configureMotorVelocity((speed * Math.PI) / 180, Math.max(0.05, torque / 10));
      return true;
    },
    /** A kick: a change of speed (pixels a second), whatever the body weighs. */
    impulse(id, [x, y]) { const b = world.getRigidBody(handleOf.get(id)); if (!b) return false; const v = b.linvel(); b.setLinvel({ x: v.x + m(x), y: v.y + m(y) }, true); return true; },
    free() { world.free(); queue.free?.(); checkpoints.clear(); }
  };
}

/** A shape as a Rapier collider (metres). */
function colliderOf(R, s, m) {
  if (s.kind === 'ball') return R.ColliderDesc.ball(Math.max(m(1), m(s.r))).setTranslation(m(s.at[0]), m(s.at[1]));
  if (s.kind === 'capsule') {
    const dx = s.b[0] - s.a[0], dy = s.b[1] - s.a[1], len = Math.hypot(dx, dy);
    const mx = (s.a[0] + s.b[0]) / 2, my = (s.a[1] + s.b[1]) / 2;
    if (len < 0.5) return R.ColliderDesc.ball(m(s.r)).setTranslation(m(mx), m(my));
    // (a capsule stands along y: turned to lie along the segment)
    return R.ColliderDesc.capsule(m(len / 2), m(s.r)).setTranslation(m(mx), m(my)).setRotation(Math.atan2(dy, dx) - Math.PI / 2);
  }
  if (s.kind === 'hull') {
    const pts = new Float32Array(s.pts.flatMap(([x, y]) => [m(x), m(y)]));
    return R.ColliderDesc.convexHull(pts) || R.ColliderDesc.ball(m(4));
  }
  return null;
}

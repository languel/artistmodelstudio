# 2D physics: plan

Status: **P0–P3 built** 5 Nov 2026 (tag `pre-physics` marks the studio before it). Decided: Rapier; the Timeline's clock and a free-running clock (step-by-step too); data on marks under `play`; a worker (the page when a worker cannot start); physics per board; a separate toolbar module. Built: `src/physics/` (model.js, core.js, host.js, physics.worker.js, studio.js, toolbar.js, properties.js) and its tests. Not yet: P4 (ropes, thrusters, attractors, collision layers, grabbing a body while it runs, recorded on the take) and P5 (the standalone player, video and embed carry physics); the single-file build is blocked by an older kokoro/transformers alias problem, not by physics. Written after reading
Underscores' physics (`~/dev/underscores`: `notes/physics.md`, `rapierPhysicsCore.js`, `physics.worker.js`,
`PhysicsPanel.jsx`, `physicsConstraintAuthoring.js`) and AMS's score kernel (`src/score/world.js`, whose
`bodies` are a small hand-written gas). The goal is Algodoo: draw things, they become physical; pin them,
hinge them, put a motor on a hinge, press play. Here it must also be part of the score: on the same clock
as travelers and events, heard through the same events, and recorded and replayed by the Timeline.

## What to keep from Underscores (and what not)

Keep, in spirit or in code:

1. **Rapier 2D, deterministic build** (`@dimforge/rapier2d-deterministic-compat`), loaded lazily on the
   first physical mark. It has what Algodoo needs (revolute joints with motors and limits, prismatic,
   fixed, rope and spring joints, CCD, collision groups) and `takeSnapshot` / `restoreSnapshot`, which is
   what makes seeking on a timeline cheap.
2. **Authored data lives on the object; runtime state never serializes.** Poses, handles, contact queues
   and checkpoints are runtime only. The drawing is the reset state.
3. **Transport clock with deterministic checkpoints.** Fixed step; a seek restores the nearest checkpoint
   and steps silently to the target; Pause holds the pose; Reset returns to the drawing; *Apply pose*
   commits the current pose as one undo step.
4. **Colliders inferred from the drawing:** a closed, near-round stroke is a circle; other closed strokes a
   convex hull (or decomposed); an open stroke a **path chain** of rounded segments as thick as the stroke.
   A per-body override.
5. **Joints are marks you can select**, placed where you click: over one body, it pins to the world; over
   two, it joins them; an axle's motor in degrees a second with a torque cap; limits only when asked.
6. **Ropes are a path sampled into links** (capped), drawn back as the one authored path.
7. **Collision layers** as a small named table, later.

Leave out (for now): the separate relationship graph and its versioning (AMS keeps relations on the marks,
as `play` already does), populations, stream endpoints, the worker (start on the main thread, behind the
same interface, and move to a worker only if a profile says so), live-pose IK, MIDI mapping UI (the score's
`emit` code already maps events to sound).

## How it fits what AMS already has

**One clock.** Physics runs on the Timeline's transport (`app.player`), like every score. Its time is the
transport's: play, pause, seek, the loop region and In/Out all apply. A wrap of the loop is a seek to its
start (restore the checkpoint there). No independent physics clock in v1: everything stays reproducible,
recordable and exportable.

**One event bus.** Contacts become score events next to `enter`, `exit`, `cross`:
`collide` (begin, with impulse and relative speed), `release` (end), sensor `enter` / `exit`, `break` (a
joint that breaks). They reach the same handlers (`emit` code, `on`, gates, nodes) and the same flashes.
A physical body touching an event region fires it like a traveler does (it already does for the gas).

**Two ways round.** Score code can act on the world inside the fixed step (so it stays deterministic):
`api.impulse(id, [x, y])`, `api.motor(hingeId, speed)`, `api.spawn(...)` (exists), `api.set(id, {…})`.
A **traveler can be a kinematic body**: it pushes things along its path (a stirring stick, a plectrum).

**Data on the marks, under `play`** (as path, traveler, event, node are), so Properties → Play, Convert to,
Code → Selection, copy/paste and undo all work unchanged:

```js
play.body   = { type: 'dynamic' | 'static' | 'kinematic' | 'sensor', shape: 'auto' | 'circle' | 'box' | 'hull' | 'chain',
                density, friction, bounce, damping, layers, v: [vx, vy], spin }      // (the gas's bodies become dynamic circles)
play.hinge  = { a, b, motor: { speed, torque }, limits: [lo, hi], break }       // a point mark at the pivot; a/b: body ids or 'world'
play.weld   = { a, b, break }                                                    // a point mark
play.spring = { a, b, stiffness, damping, rest }                                 // a line mark from a to b
play.rope   = { link, thickness, a, b }                                          // a line mark (the rope itself)
play.thruster = { body, force, key }                                             // a line mark from a body (its direction)
doc.physics = { gravity: [0, 9.8], ppm: 50, iterations, speed }                  // the world, saved with the scene
```

Inference does the work, as in Algodoo: a closed stroke drawn on top of nothing becomes a dynamic body when
physics is on for the board; a long open stroke along the bottom a static wall; a hinge dropped on a body
finds the body (or two) under it. Everything is editable after.

**Drawing it.** The marks are the authored rest poses. While a world runs, body marks are drawn moved and
turned by their pose (a transform per element in the renderer, from a pose map, no edits to the document);
pausing holds; stopping, rewinding or Reset returns to the drawing; *Apply pose* writes the poses into the
marks (one undo step). Brushes keep working because the mark itself is unchanged, only placed.

**The Timeline.** A take keeps working as is (the world is a function of time, so it replays itself).
Grabbing a body while it runs (a mouse spring, as in Algodoo) is an input from outside: it is recorded as
timed input on the take, so a replay is the same. Compositions and overdub need nothing new.

## Tools and interface (Algodoo-like, AMS-shaped)

- A **Physics** switch on a board (Properties → Board, and the canvas menu): marks on it are physical.
  Off by default; the world settings beside it (gravity, scale, speed).
- Play tool kinds gain **Body**, **Hinge**, **Weld**, **Spring**, **Rope**, **Thruster** (the Play tool already
  has kinds and a radial menu); right-click → *Convert to* gains the same; right-click a hinge → *Motor*.
- Properties → Play → **Physics**: body type, shape, material (density, friction, bounce), damping; for a
  hinge, motor speed/torque and limits; for a spring, stiffness and damping.
- Drag a body while it runs: it is grabbed. **Apply pose** and **Reset** in the Timeline bar while a world
  exists. A debug overlay (colliders, joints, contacts) in the canvas menu.

## Phases

| | | Done when |
|---|---|---|
| **P0** | Spike: Rapier deterministic in the dev build, the single-file build and the embed; lazy loading; size; two runs equal; snapshot and restore cost | a test steps the same scene twice to identical poses, and a seek to 30 s takes under a frame or two |
| **P1** | Rigid bodies from marks: `play.body`, collider inference, `doc.physics`, transport clock with checkpoints (pause, seek, loop, In/Out), pose rendering, Reset / Apply pose | boxes and balls fall, stack and roll on drawn ground, scrub back and forth, loop |
| **P2** | Joints: hinge (world or two bodies) with motor and limits, weld, spring; the Play tool kinds and Properties | a drawn car with motor hinges drives across a drawn hill; a pendulum; a see-saw |
| **P3** | Events both ways: `collide` / `release` / sensors / `break` into the score bus and flashes; `api.impulse`, `api.motor`; travelers as kinematic bodies; the gas moves onto Rapier (its tests kept) | a ball hitting a line sounds by its impulse; a traveler stirs particles; old scores still play |
| **P4** | Ropes, thrusters, attractors, collision layers, grab while running (recorded on the take), debug overlay | a rope bridge; a rocket on a key |
| **P5** | Exports: the standalone player, video and the embed carry the physics runtime | an exported page plays the car |

## Decisions to make before P0

1. **Engine.** Rapier (as Underscores: WASM, a few hundred KB more, built-in snapshots for seeking, a
   deterministic build) or planck.js (a Box2D port in plain JS, smaller, no WASM, snapshots by hand).
   Proposed: Rapier.
2. **Clock.** Transport only (proposed for v1), or also a free-running world (as Underscores allows).
3. **Where it lives.** On marks under `play` (proposed), or a separate graph as in Underscores.
4. **Main thread or worker** for v1. Proposed: main thread behind a worker-shaped interface.
5. **What turns physics on.** Per board (proposed), per stage, or per mark only.

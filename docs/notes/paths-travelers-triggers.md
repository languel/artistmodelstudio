# Paths, travelers and triggers: a plan for scores in AMS

Status: **built** 23 Oct 2026 (M0 to M7; see the end of docs/HANDOFF.md item 66 for what is and is not done). Written as a plan; where the build differs: no separate `Clock` (the Timeline's playhead is the transport, §3), imports write AMS score code instead of marks (§7), bodies and effects are in the kernel (§5), tempo and loop range live in `doc.transport`. Written after reading IanniX in `~/dev/underscores` (`notes/iannix.md`, `src/iannixEngine.js`, `iannixScript.js`, `iannixMidi.js`, `scoreTiming.js`, `transport.js`) and the original C++ in `~/dev/IanniX`.

## 1. What IanniX is, reduced to its idea

IanniX has three object kinds and one rule.

| IanniX | Role | AMS word |
| --- | --- | --- |
| curve | a support path: geometry, with a length | **path** |
| cursor | a playhead that moves along one curve over time | **traveler** |
| trigger | a region (a point, a shape) that reacts when a cursor touches it | **trigger** |

The rule: *a cursor's contact with a trigger is an event; the event is turned into a message* (a MIDI note, an OSC packet). Everything else (scripts, groups, colors, 3D, bounds) is scaffolding around that.

What Underscores learned the hard way (worth keeping, in code form):

1. **Detection must be swept.** A fast cursor skips a thin trigger between two frames unless the segment it moved along is tested, not just where it is now. Loop wraps must not create a false sweep.
2. **Event timing is separate from display.** Smoothing a cursor on screen must never change when notes fire.
3. **Entry policy matters.** IanniX's reference scores do not re-trigger: a trigger is *latched* until the cursor leaves, plus a minimum lockout. Make it a policy, default latched.
4. **A note has a gate.** Enter = note on, exit = note off; the nominal duration is the minimum. Overlapping notes of one pitch need a voice counter, or the first note-off cuts the second note.
5. **Local time is derived, not owned.** Global `T` → per object `start`, `duration`, `rate`, `loopMode` (`once | loop | pingPong`) → progress. One function, no second animation loop.
6. **Values come from geometry.** `trigger_value_x/y` is the trigger's place mapped through the cursor's bounds. It works, but it hides the mapping in a template string. We make the mapping explicit code instead.
7. The main-thread `setTimeout` scheduling is imprecise. We schedule against the audio clock with a short look-ahead.

What we do **not** take: the OSC layer, 3D, bounds-source modes, grid-bound durations, MIDI clock sync, the trusted-JS command language as the native format, the 7 000-line UI. Those can come later or never.

## 2. The AMS model

Three nouns, all ordinary AMS marks. **A mark's `role` stays what it is (point, line, plane…); playing is a separate, optional property.** One mark can be several things (a plane that is both a trigger and a path; a traveler that is also a trigger), which IanniX cannot do.

```js
mark.play = {
  path:    true | { closed, speed },                       // this line can be travelled
  travel:  { on: pathId, dur: 4, loop: 'loop', ease: 'linear', start: 0, rate: 1,
             as: 'drawn' },                                // 'drawn' replays the points' own t and p
  trigger: { on: ['enter', 'exit'], filter: '*', gate: true, lockout: 0.05, policy: 'latched' },
  emit:    'note(lane(y), 100, 0.3)'                       // code, see below; or a sink spec
}
```

- **path**: any line mark (`e.points` are `[x, y, t, p]`). Its parameter `u ∈ [0,1]` is arc length, sampled with the existing smooth/straight choice (`e.path`), so a path travelled is the path drawn.
- **traveler**: anything with a position over time. The first kind is `travel` along a path (analytic). The second kind is a *free* traveler whose position is pushed each step by a process (§5).
- **trigger**: any mark with area (plane, circle, rectangle) or none (a point, with a radius). Also a *line* can be a trigger that fires on **crossing**, with a direction.
- **event**: `{ t, type, traveler, trigger, at: {x, y}, u, speed, pressure, dir }`. `type` is `enter | exit | cross | hold`.
- **handler / output**: where an event goes. A handler is code that turns an event into effects: music messages (§6), `launch`/`kill` travelers (§6b), `spawn` (make or change marks, §5), or anything else. Outputs (`gm`, `webmidi`, `log`) only ever see MIDI bytes, never geometry.

"Everything is code" here means two things. First, the score language (`src/process/script.js`, Code → Score) gets verbs that produce exactly the `play` data above, so a drawn mark and a coded mark are the same thing and *Show code* works on both:

```js
const p = line(pts, { play: { path: true } })
const a = point(p.at(0), { play: { travel: { on: p, dur: 8, loop: 'pingpong' } } })
const t = plane(circle(0.6, 0.4, 0.05), { play: { trigger: { on: 'enter' }, emit: 'note(pitch(y), vel(speed), 0.3)' } })
```

Second, `emit` is a short JS expression (or a named sink with arguments) evaluated against the event, in the same sandbox style as board code. The default mapping is no hidden template: Properties shows the code, and presets (IanniX XY note, fixed note, CC) are just snippets that fill it. Per the UI memory, no explanatory text on screen; hover tips and docs carry it.

Mapping helpers available to `emit`: `x, y, u, speed, pressure, dir` (board-normalized, Y up, 0 to 1), `lane(y)`, `scale('dorian', root)`, `quant(v, n)`, `map(v, [a,b], [c,d])`, `rng()`. Scales can reuse the lists from `~/dev/midinojs`.

**Two things only AMS can offer, so they are the defaults worth showing off:**

- **Play the walk as drawn.** Every point carries `t` (ms) and `p` (pressure). A traveler with `as: 'drawn'` replays the line at the speed the hand drew it, and pressure becomes velocity. The line is already a recording.
- **Process planes.** Planes and brushes are already realized by code; a trigger region can be a *field* (any `inside(x, y)` function), not only a polygon.

## 3. Time: one transport, not two

*Revised 23 Oct after auditing the timing AMS already has. The earlier idea of a separate `Clock` is dropped: scores run on the Timeline's playhead.*

**What AMS has today**

| Where | What | Unit | Owner |
| --- | --- | --- | --- |
| Take timeline (`take.js`, `takePlayer.js`, `panels/timeline.js`) | tracks of clips; a playhead `t`, play/pause/seek/rate/loop; audio clips follow it; `docAt(take, t)` is what the canvas shows. The panel is already "transport after underscores" in its header | ms | `TakePlayer` (`app.player`), **only while a take is loaded** (Play is disabled without one) |
| Recorder | `performance.now() - t0` while recording | ms | `Recorder` |
| Mark envelopes (`envelope.js`) | `time: { in, out, life, draw }` against `born`, read from **wall-clock** `Date.now()` by the canvas, also while a take is replayed | s | the renderer |
| Boards | `board.rate` runs on a `setInterval`; media players have their own time | real time | `followSources`, `sources` |
| A stroke's own points | `[x, y, t, p]`, t = ms from the start of the gesture | ms | the document |

**What Underscores has** (`transport.js`, `timeValue.js`, `TransportTimeline.jsx`): one global time `T` in seconds with tempo, meter, rate, loop range and play state; a ruler that reads as time, frames, timecode or bars·beats·16ths; time *expressions* (`'2 beats'`, `'1 bar'`, `'4n'`, `'1.2.0'`); quantized launch; and per-object **local time** derived from `T`. It is tested, and the AMS Timeline was modelled on it, but only the seconds-and-clips half was carried over.

**The merge.** The Timeline's playhead *is* the score clock.

1. **Promote the transport.** `app.player` (`TakePlayer`) keeps its name and API (`t`, `play`, `pause`, `seek`, `rate`, `loop`, `on`) and stops requiring a take. With no take loaded it plays a plain timeline whose length is the loop range or the score's end. Space, the play button and the time readout now work for scenes without recordings. Nothing about takes changes: `docAt`, clips, tracks, audio sync, export all stay.
2. **Add what scores need, in the same object**: `tempo`, `signature`, `fps` (the Underscores time context), a loop *range* (`loop: [a, b]`, replacing the boolean), and the ruler mode (time | beats | frames). They live with the scene (`doc.transport`) so they travel with parts and exports. The Timeline ruler gains a beats mode by porting Underscores' pure ruler functions.
3. **Port the pure, tested parts of Underscores unchanged** into `src/time/` (seconds in, seconds out; no React): `timeValue.js` (expressions and contexts), and from `transport.js` the tempo/meter helpers, `advanceTransportPlaybackTime` (loop range), timecode/frame/musical-position formatting and parsing, `createTimelineTicks`, `snapTimelineTime`, `followTimelineViewRange`, `nextTransportLaunchTime`. Skipped: MIDI clock sync, `livecodeTransport` (its linked/free split is already AMS's playhead vs `board.rate`).
4. **The score engine is a listener, not a clock.** `scorePlayer.js` reads `app.player.t` (ms → s at that one boundary) and the kernel stays in seconds. It does not own play, pause or seek. `Clock` from the first draft does not exist; `time/` supplies conversions.
5. **Local time** is already `travel.js` (`start`, `dur`, `rate`, `loop`), the same function as Underscores'. `start`/`dur` accept time expressions, resolved against the scene's tempo with the ported `resolveTimeValue`.

**How the pieces behave together**

- *Playing a take* shows `docAt(take, t)`; the score world is built from the document actually on screen (`canvas.previewDoc` or the live one) and rebuilt when it changes. Analytic travelers are pure functions of T, so a rebuild is harmless; the engine only emits events later than the last time it stepped, so nothing repeats. A free world (gas) restarts on a rebuild.
- *Seeking* resets the world at the new time: no sweep across the jump, no flood of events; a pending note-off is flushed (panic on the outputs) so nothing hangs.
- *Rate* scales the transport; the scheduler maps transport time to audio time with the rate.
- *Looping* uses the range; a loop wrap is a seek for the world, but travelers with their own `loop` are unaffected.
- *Recording* keeps its own `performance.now()` base. Recording a performance (events into a take) is M5 and attaches to the playhead then; nothing about the recorder changes before that.
- *Take audio clips* (HTMLAudio, synced to the playhead) and the `gm` output (WebAudio) are independent consumers of the same `t`.
- *Hidden tabs*: `requestAnimationFrame` stops. The transport's time must therefore come from `performance.now()` (as it already does: `t += (now - last) * rate`), and the scheduler runs on its own 25 ms timer with a ~100 ms look-ahead, widened when the tab is hidden, rather than inside the animation frame.

**Left alone on purpose (possible later merge).** Envelopes read the wall clock, so a faded mark in a take replay fades in real time, not along the playhead. Making `now` follow the transport while it plays would fix that, but it changes how every timed mark renders, so it is its own change and nothing in the score work depends on it. Board rates and media players stay real-time.

**Stepping and determinism.** The kernel runs on a *fixed step* (default 1/240 s of transport time, independent of display frames) up to the look-ahead edge; events get sub-step exact times (§4). Same inputs, same events, so a score can be rendered offline to an event list (tests, MIDI file export, p5 and video export, replays); analytic travelers need no stepping at all; and a Take can later record the *events*.

Display is separate: travelers are drawn on an overlay at the display rate from the same `pos(t)`, so the 15 fps cap on redrawing animated marks does not affect them. The overlay hooks into the canvas as `boardFrames.js` does (`canvas.onDrawn`); the baked per-board pictures are untouched.

## 4. Detection (the kernel)

`src/score/` is pure, no DOM, no audio, tested with vitest like `envelope.js`:

```
paths.js      sample(path, u) → {x, y, tangent, speed, p}; arc-length table; closed paths
travel.js     localTime(clock, spec); position(spec, path, t)
regions.js    prepare(mark) → { bounds, test(x,y), crossings(p0,p1) }  (polygon, circle, field, polyline)
detect.js     step(world, t0, t1) → events   (swept; sub-step time by interpolation; latched/lockout/gate)
events.js     event shape, gate bookkeeping, voice counter for overlapping notes
music.js      note/cc/program helpers, voice counter, scale.js (snap/step)
outputs/      gm.js (jzz + TinySynth), webmidi.js, log.js
import/       iannix.js (parse + convert), nous.js (Midinous)
```

Algorithm per step, per traveler: its swept segment `p0→p1` is tested against each trigger's prepared region after a **broad phase** (bounds, then a uniform grid or hash once there are hundreds of entities). For a polygon: segment/edge intersections give entry and exit parameters, so `t = t0 + s·(t1−t0)` is exact within the step. The traveler may have a radius (a disc swept = capsule). A loop wrap or a seek splits the segment so no false sweep is made.

State per `(traveler, trigger)` pair: `inside`, `since`, `lockedUntil`, with the **policy**: `latched` (default: one voice per trigger until all travelers have left), `pair` (each pair retriggers independently), `every` (every entry). `gate: true` emits `exit` at actual exit, no earlier than the minimum duration.

Generalization comes for free: the detector knows only `entity.pos(t)` and `entity.region`. A traveler on a path and a gas particle are the same thing to it.

## 5. Free travelers, gas, collisions

Same kernel, different source of position. A **world** is a board (or a group) whose entities are advanced by a process:

```js
world({ step: (dt, ents) => { for (const e of ents) { e.x += e.vx * dt; e.y += e.vy * dt; bounce(e, box) } } })
```

- Entities are points with a radius. `play.trigger` on a traveler makes it a trigger too; the detector then tests traveler-vs-traveler pairs through the spatial hash (this is the gas case). A pair's event has `a` and `b`, with the contact point and relative speed.
- `spawn` sink: create a mark at the contact point, change a mark's color or size, add a traveler, remove one. Because spawning modifies the document, events from a live world are `transient` changes (no undo steps), as live boards already are.
- Physics beyond bounce and elastic collisions is out of scope; Underscores uses Rapier and AMS can too later, behind the same `pos(t)` interface.
- Randomness uses the seeded `rng()` so a world run is reproducible.

## 6. Music: messages and outputs

Geometry events never talk to a synth. They go through one narrow waist, **raw MIDI messages** (`[status, d1, d2]` plus a time). IanniX, Midinous and hand-written code all produce them; every output consumes them. This is also what lets the built-in sound and real MIDI be swapped without touching a score.

```
event ──emit/handler──▶ music helpers ──▶ messages [bytes, t] ──▶ outputs: gm | webmidi | log
```

`src/score/music.js` (≈80 lines, pure):

- `note(ch, pitch, vel, dur)` → note-on at `t`, note-off at `t+dur` (or at the event's `exit` when `gate`), with a **voice counter** per `(output, channel, pitch)` so overlapping notes don't cut each other (from `createIannixMidiVoiceTracker`); `cc(ch, n, v)`; `program(ch, n)`; `panic()`.
- `scale.js`: the 30-odd scales from `midinojs/src/constants/scales.ts` (intervals) with `snap(note, scale, root)`, `step(note, n, scale, root)` (the relative-note arithmetic from `ScaleManager.ts`). This is the only part of midinojs's music theory that is needed by both systems, and `emit` code uses it directly: `note(1, snap(40 + y * 48, 'dorian', 62), vel)`.

**Outputs** (`send(bytes, atTime)`; the scheduler calls them inside the look-ahead window):

- **`gm`**, the built-in sound so tests need no MIDI. A straight port of Underscores' `internalMidiSynth.js` / `generalMidi.js`, cut down: a ~50-line wrapper over `jzz` + `jzz-synth-tiny` (both MIT, 320 KB, loaded with a dynamic `import()` on the first Play so it costs nothing until used), accepting raw bytes, a per-channel program table (`GM_PROGRAMS` names for the picker; channel 10 is drums), and `clear()` (CC 64/120/123 on all channels = panic). Lessons from the original that stay as comments in the port: use an *unnamed* TinySynth port, because a named one is a process-wide cache with stale voices; and never close the shared `AudioContext`, only the port. Dropped: the reset/dispose state machine, the mixer (`mixerSystem.js`, track fan-out), the expressive synth. Timestamps are converted to `setTimeout` in the original; here we pass them through the audio-clock scheduler instead. Backend injectable, so vitest runs a fake that records bytes.
- **`webmidi`**: ports and channel in Settings, permission requested on a button press, same `send`. About 60 lines.
- **`log`**: pushes messages to the console and a test array.
- Non-music sinks (`spawn`, `code`) stay as in §5; they are handler effects, not outputs.
- A *continuous* voice (a traveler held in pitch while it moves, for glissandi) is, in this scheme, a stream of pitch-bend and CC messages from a traveler's `tick` handler. It needs no extra synth; TinySynth supports pitch bend. A purpose-built continuous oscillator is left for later.
- OSC would go through the dev relay, since a browser cannot send UDP. Later.

## 6b. Midinous: the grid system on the same kernel

`~/dev/midinojs` (a port of Midinous) is a different *surface* on the same machinery. Read in our terms:

| Midinous | Here |
| --- | --- |
| point / node (note, CC, gate, counter, switch, terminator, anchor) | a **trigger** (a point mark) whose handler is a node type |
| connection (an L-shaped or straight edge between two nodes) | a **path** (a 2-point line, or a polyline with the L corner) |
| traveler running along an edge | a **traveler** with `speed` in cells per beat (1 cell = 1 beat; the original ticks at 1/16) |
| arriving at a node | an **`end`** event of the traveler (it finished its path) plus `enter` on the node's region |
| node emitting travelers on its outgoing edges (robin, split, random, portal) | a handler effect **`launch(pathId)`**, with the routing helpers `robin`, `split`, `random`, `portal` operating on the node's `out` list and its own `state` |
| counter, switch, gate nodes | a few lines of handler code over `state` (`state.n = (state.n | 0) + 1; if (state.n % 4) return`) |
| relative notes, force scale, range randomization | `scale.js` and `rng()` in `emit` |
| global tempo / beats / scale / root | the transport's tempo and signature (§3) and a scene-level `key` |

What the kernel therefore needs beyond §4, *for both systems*, and nothing midinous-specific:

1. an **`end`** event (traveler reached `u = 1`; with `loop` it fires each lap);
2. dynamic travelers, **`launch`** and `kill`, bounded (default 256 live) and deterministic;
3. a per-entity **`state`** object that survives between events and is part of the saved score;
4. optional **tick quantization** (`clock.tick`, default off; midinous sets 1/4 beat) so event times round to the grid.

Midinous nodes are drawn as dots and edges as straight/L-shaped lines. Nothing in AMS stops a score from being a node graph with the editor's existing Direct selection, snapping to the grid (`grid.snapMode`) and the Line tool in point-by-point mode; the L-shape is `path: 'straight'` with a corner point. A "Node graph" preset (grid on, snap on, nodes as dots, edges as straight lines) is a later convenience, not a new editor.

Logic *paths* (gate inputs wired separately from signal paths) are out of the first cut: AND/OR/XOR gates need two inputs whose arrival times are compared, which the `state` + handler form can express but is not worth building until a score asks for it.

## 7. IanniX import

Goal: load real `.iannix` scores to test the kernel and to look at, not to preserve IanniX behavior.

Format: a JavaScript file with `makeWithScript()` that calls `run("add curve 1000")`, `run("setPointAt current 1 0 24")` and so on; some with `ask(...)` parameters; some build everything from JS loops. So import means *running a script*, which is trusted code (the user's own files, behind a confirm, like board code).

Plan (`src/score/iannix/`):

1. **Parse**: run the file in a `Function` with `run`, `ask`, `title`, `load`, math helpers and seeded random stubs; collect the command stream. `iannixScript.js` in Underscores already does this (tokenizer, `current`/`lastCurve`, `setPointAt`, controls, `ellipse`, `setSpeed auto N`, `setPattern`, `setBoundsSource`, `setMessage`); port the pure parts rather than rewrite them, and cut everything that touches Excalidraw.
2. **Model**: `{ curves, cursors, triggers, groups, viewport }` in IanniX units, Y up.
3. **Convert** to AMS marks:
   - curve → `line` with `play.path`. Points with Bézier controls are sampled to points (destination-point semantics: for `p1→p2`, `c1 = p1 + p2.c1`, `c2 = p2 + p2.c2`); `ellipse` becomes a closed polyline.
   - cursor → `point` with `play.travel { on, dur | speed, loop }`. IanniX's pattern `0 0 1 0` once, `0 0 1` loop, negative values pingpong (the Underscores reading).
   - trigger → small `plane`/circle or `point`, with `play.trigger` and an `emit` built from the IanniX message (`notef 1 trigger_value_y trigger_value_x trigger_duration` becomes the equivalent mapping code, with the bounds written out).
   - Y is flipped, units are scaled to the board (`viewport.zoom/center`), `setGroup` becomes a stage, colors are kept.
4. **Test corpus**: `~/Documents/IanniX/Examples/*.iannix` (CC BY-NC-SA, so *not* copied into the repo; the tests read them from there and skip when absent). Order of difficulty: `Simple Javascript example (basic)`, `Grid`, `Xenakis Metastaseis linear`, `Rosette`/`Spirographe` (ellipses and math), `IanniX logo`, then the performance scores. Success per file: counts of curves/cursors/triggers match the command stream; the first N seconds' event list matches a fixture generated by hand for the simple ones; Underscores' own `iannixEngine.test.js` fixtures can be a cross-check on trigger times.
5. A direction for later: **export** to `.iannix` is cheap for the path/cursor/trigger subset and makes AMS scores playable in IanniX.

### 7b. Midinous import

`.nous` files are JSON (`~/dev/midinojs/docs/midinous-schema.md`; no sample files are on this machine, so the first test files are written by hand from the schema or exported from midinojs). Conversion is simpler than IanniX's, with no script to run:

- `_note_points`, `_cc_points`, `_counter_points`, `_switch_points`… → point marks at `Origin` (the 144 px grid scaled to the board), each with `play.trigger` and a handler from its node type (note: `Primary` note, `Secondary` velocity, `Channel`, `Duration` in beats, `Repeat`, probability; relative-note fields become `step(...)` and `snap(...)` calls);
- each `SerializablePathTo` entry → a 2-point line (with the L corner when `PathMode` is horizontal or vertical) with `play.path`;
- starters (`isStart`) → travelers launched at play;
- play mode → `out` routing; label, color → mark label and color.

## 8. Where it lives, and what changes

New: `src/score/` (kernel, clock, music, outputs, import), `src/time/` (ported Underscores time helpers), `src/workbench/scorePlayer.js` (overlay, look-ahead scheduler; listens to `app.player`), a Score section in Properties, a transport control, `docs/` page, MCP verbs.

Touched: `src/process/script.js` (verbs `play` options and `world`), `src/process/document.js` (normalize `play`, keep it through `boardDoc`, parts, export), `canvasView.js` (overlay hook), `docsContent.js`, `shortcuts.js`.

Not touched: brushes, sculpts, the take format (until §M5).

## 9. Build order

Each step ends with tests and a visible result, and `npm run build` before any commit.

| # | Result | What |
| --- | --- | --- |
| M0 | Kernel in tests | `paths`, `travel`, `regions`, `detect`, `events` (incl. `end`, `launch`, `state`), with swept and wrap cases; offline `renderEvents(doc, seconds)` |
| M1a | One transport | `src/time/` port with its tests; `TakePlayer` plays without a take, tempo/signature/loop range in `doc.transport`, beats ruler in the Timeline; no score code yet |
| M1 | Hear it | scheduler on `app.player`, `music.js` + `scale.js`, `gm` output (fake backend in tests), `play` in the score language; a score that draws a line, a traveler and three planes and plays them |
| M2 | See it | overlay (travelers, trigger flashes), transport glyph, Space, Properties → Play with glyphs |
| M3 | IanniX in | importer, first three example files playing through `gm` |
| M4 | Grid music | `nous.js` importer, node/edge presets, robin/split/random/portal, counter/switch; a `.nous` project plays |
| M4b | MIDI | `webmidi` output, ports in Settings |
| M5 | Record | events and audio into a Take; render a Take with sound to the video export; `ams_play` MCP verbs |
| M6 | Worlds | free travelers, spatial hash, traveler-as-trigger, `spawn`; the gas demo |
| M7 | Reach | p5 export of a score (kernel embedded as `envelope.js` is), MIDI file export, `.iannix` export |

M0 to M3 is the minimum that proves the idea; M0 is also what keeps everything else honest.

## 10. Decisions I would like from you

1. **Clock and Space.** Settled: no separate clock. The Timeline's playhead (`app.player`), promoted to work without a take, is the one transport (§3).
2. **Roles.** Playing as a separate `play` property (above) versus new roles `traveler`/`trigger`. I recommend the property; roles stay about drawing.
3. **Scope of a score.** A board (so a lesson board can have its own piece) or the whole scene? I recommend per board, with a scene-level clock.
4. **Default trigger policy**: latched with a small lockout (matches the reference scores) or retrigger on every entry.
5. **Names on screen.** Path, traveler, trigger as proposed, or something nearer to the drawing vocabulary (line, point, plane are already the roles: *walker*? *marker*?).
6. **Importer trust.** Running `.iannix` as JS in the page (as board code is) behind a confirm, or a stricter command-only parser that refuses scripts with loops? Several examples depend on JS loops, so I recommend the former.
7. **Sound dependency.** Add `jzz` and `jzz-synth-tiny` (MIT, 320 KB, lazy) for the built-in GM sound, as Underscores does. The single-file build inlines dynamic imports, so it grows by that much; I'd accept it. The alternative is ~60 lines of oscillator voices (like midinojs's `SynthService`) with no GM instruments.
8. **Midinous scope.** Nodes note/CC/counter/switch and the four routing modes in M4; logic gates and logic paths later. OK?

# Scores everywhere: paths, travelers and events through `__`

Status: plan (24 Oct 2026), nothing built. Goal: every path, traveler and event of a score is readable (and, where it makes sense, writable) from any code in AMS, and from any project that embeds Poliplan or talks to AMS, so a drawn score can drive automation: Genereti nodes, p5comp circuits, MIDI, anything that reads `__`.

## What exists

- **In AMS:** the score lives in marks (`play.path`, `play.travel`, `play.trigger` = event, `play.node`). One kernel (`src/score/world.js`), one clock (`app.player`), worlds built per board by `compileDoc`, `ScorePlayer` runs them 0.2 s ahead, `ScoreOverlay` draws where things are *now* (`world.positions(t)`), `ams_score {events}` renders ahead of time. Nothing outside the score panel can read this state.
- **Genereti's `__` facade** (docs/performance-time.md, docs/browser-perception-plan.md): `__.time/beat/bar/bpm/ticks/phase/playing/rate/transport` (project clock), `__.data.get/set` (JSON, 64 KB per value), `__.commands.play/pause/seek`, `__.streams.list()/read(name, maxAgeMs)` (named streams of `{features: {'pose.nose.x': …}}`, stale = null), `__.events.on(name, cb)` (entry/exit pulses). Host code uses `window.generetiPerformance` / `generetiPerception`. Genereti already embeds Poliplan through the `ams-editor-v1` iframe protocol (docs/EMBEDDING.md).
- **Poliplan** (`ams-editor-v1`): `change`/`draft`/`selection`/`camera`/`pointer` messages, `export`, `call` (any `ams_*` tool), `ams-editor.js` client.

So the shapes to meet already exist on both sides. The plan is to publish the score *as a stream and as events* in Genereti's vocabulary, and to let a host's clock drive AMS.

## The model: one addressing scheme

Everything is addressed by **name** (the mark's label, else its id; the same rule links already use), with the board as a prefix when ambiguous: `ams/<board>/<name>`.

| Thing | Read (features) | Write / call |
| --- | --- | --- |
| path `p` | `len` (units), `seconds`, `closed`, `at(u)` → `{x, y, tx, ty}` (board-normalized, y up, like `nx ny`) | `launch(p, {dur, data})` |
| traveler `t` | `x y` (0..1, y up), `u` (0..1 along its path), `phase`, `speed`, `lap` (count), `active`, `path` | `seek(u)`, `phase = …`, `attach(path)`, `detach()` |
| event `e` | `active` (inside now), `count`, `last` (score time of last hit), `lat`, `u`, `value` (what its code last published) | `fire(data)` (as if touched), `arrive` |
| node `n` | the event features plus `lit`, `note`, `n` (counter) | `fire` |
| score | `time` (the one clock), `playing`, `tempo`, `beat` | `play/pause/seek` |

Event *code* gets one more helper, `out(name, value)`: an event can publish a number or object under its own name (`ams/main/gate.value`). That is how a drawn gesture becomes a control signal without MIDI (a plane that outputs `ny` as `filterCutoff`).

## Pieces

1. **`src/score/bus.js` (pure).** After each runner step the worlds' state is sampled into a `ScoreFrame { t, playing, travelers[], events[], paths[] }` and the world events (`enter exit cross end arrive collide`) are queued as `ScoreEvent { t, name, phase: 'entry'|'exit'|'pulse', data }`. Sampling is on demand (readers ask for `frame(t)`, no cost when nobody listens), events are always recorded into a small ring (last 256). Tests against `renderScore`.
2. **`__` inside AMS.** The Code panel, board code, p5 boards and `emit` code get `__` with the same surface as Genereti: `__.time/beat/…` from `app.player`, `__.streams.read('ams/main/lead')`, `__.events.on('ams/main/gate', cb)`, `__.data`, `__.commands`. `ams.paths.name`, `ams.travelers.name.u` read like plain objects (proxy over the frame), so a board can say `circle(__.score.travelers.lead.x * W, …)`.
3. **Poliplan messages** (`ams-editor-v1`, additive): editor → host `score-frame { t, playing, features }` (throttled, only after the host sends `subscribe-score {names|'*', hz}`), `score-event { t, name, phase, data }`; host → editor `transport { time, playing, rate, tempo, loop }` (see 5), `score-call { name, op, args }` for the write side. Client: `editor.score.subscribe({names, hz}, cb)`, `editor.score.on('event', cb)`, `await editor.score.read(name)`.
4. **Genereti bridge** (their side, small): the Poliplan node registers `ams` as a stream in `__.streams` (`features` flattened as `lead.x`, `lead.u`, `gate.active`…, stale after 500 ms like every stream), forwards `score-event` into `__.events` (`entry`/`exit`), and maps `__.commands.play/pause/seek` and the project clock onto `transport`. A Livecode node then reads `__.streams.read('ams')?.features['lead.x']`, a CHOP node gets channels, a GLSL node gets uniforms. No new concept for Genereti users.
5. **One clock.** Two modes, chosen by `init { clock: 'own' | 'host' }`. `own` (today): AMS's transport runs, the host *reads*. `host`: `app.player` follows the host's `transport` messages (position = host time, rate/loop from the host) and never runs its own timer; the runner already tolerates jumps (rebuilds on a seek, no cut notes) and the score is deterministic from time alone, so scrubbing in the host scrubs the drawing. Latency: the host sends `transport` at ≥ 30 Hz and AMS extrapolates between (same trick as `player.position()`).
6. **Standalone export.** The p5 export of scores (not built yet) and the Poliplan JSON export carry the score marks; a tiny runtime (`score-runtime.js`: kernel + compile, ~25 KB) plays them in any page and exposes the same frame/event API without the editor, so "export the score as an automation" means: JSON + runtime, host feeds it a clock.
7. **Writes are opt-in and safe.** Host → AMS writes (`score-call`) are limited to `launch`, `fire`, `seek`, `phase`, and attach/detach through the existing tools, each one undo step marked `by: 'host'`, and refused unless `init { score: { write: true } }`.

## Phases

1. `bus.js` + `__` in AMS (items 1–2). Docs, tests, an exercise that draws from `__.score`.
2. Poliplan read side (3, subscribe/event), `ams-editor.js`, the demo page; Genereti bridge for streams and events (4).
3. Host clock (5), then the transport commands in Genereti.
4. `out(name, value)`, writes (7).
5. Standalone runtime and export (6).

## Open questions

- **Coordinates.** `x y` in 0..1 of the *board* (y up) is proposed so a score is resolution-independent; a stream may also want the board's pixel size (`w h`). OK to give both?
- **Names across boards.** Prefix with the board title always, or only when two marks share a name?
- **Rates.** 30 Hz frames are plenty for control; sample-accurate timing needs events carrying `t` (they do) and the host clock agreeing (phase 3). Is 25 Hz (Genereti's CHOP rate) the right default?
- **Who owns the document.** Genereti owns the saved drawing today; the score would travel inside it (marks with `play`), so no change, but a workflow that *only* wants the score (no picture) may want a score-only board type.
- **Security of `emit` code in hosts.** Event code is JavaScript. A host loading someone else's drawing runs it inside the iframe (sandboxed), but `out()` values then reach host code: treat them as data (numbers, short strings), cap sizes as `__.data` does.
- **MIDI.** Keep MIDI out through the browser (Web MIDI in the iframe, needs the permission policy `midi`) or also expose the *messages* as an event stream (`score-event` with `name: 'midi'`) so the host can route them?

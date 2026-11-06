# Handoff: integrate the capture timeline into p5comp (and update Poliplan)

For an agent working in `~/dev/arduino/p5comp` (a separate harness). Written 6 Nov 2026. Read this whole file first; it is self-contained. The AMS repo is `~/dev/artistmodelstudio` (read-only reference unless told otherwise; do not push to it from here).

## Goal

p5comp (Arduino + p5 teaching environment) should be able to **record a student's work as a "take"** and **play it back**, using AMS's recording/timeline system, without forking it. Two layers, in order:

1. **Update the vendored Poliplan** (the AMS drawing editor p5comp already embeds) to the build that carries take messages. This alone lets p5comp record and replay the *drawing board's* work.
2. **Add a p5comp-side recorder** for what AMS cannot see: the sketch code, upload/run actions, serial signals, circuit changes. It writes the same `ams-take` JSON with its own clip kinds, so takes open in AMS (generic kinds play; unknown kinds are no-ops).

Do 1 first; it is small and verifies the pipeline. Do not start the large refactors (extracting a shared core, porting the circuit simulator): those are planned separately in `docs/recording-system.md` in the AMS repo.

## Facts about both sides

**AMS / Poliplan** (repo `~/dev/artistmodelstudio`, branch `main`, commit `d11233d` or later)
- Poliplan = the lean embeddable AMS editor: an iframe (`embed.html`) speaking the `ams-editor-v1` postMessage protocol, plus a client `ams-editor.js`. Built by `npm run build:embed` into `dist-embed/`; copied into a host by `scripts/sync-embed.sh <host-dir> [full]` (writes a `VERSION` file). Protocol and integrator checklist: `docs/EMBEDDING.md`.
- **New (6 Nov 2026):** take messages. Host → editor: `record-start { title }`, `record-stop` (result `{ take }`), `take-load { take }`, `take-play`, `take-pause`, `take-seek { t }`, `take-state`. Editor → host events: `recording { on }`, `take { id, title, duration }`. Client methods: `recordStart / recordStop / loadTake / playTake / pauseTake / seekTake / takeState`; subscribe with `editor.on('recording' | 'take', fn)`.
- **These messages were added but not yet exercised in a browser.** The first job is to try them and fix what breaks (fix in AMS: `src/embed/bridge.js`, `src/embed/client.js`).
- The lean build omits the Timeline panel UI. Playback of a loaded take is driven by the host (`take-play` etc.) and draws on the editor canvas. If p5comp needs the full Timeline UI, use the chunky build (`AMS_EMBED_FULL=1`, `npm run build:embed:full`, `sync-embed.sh <dir> full`).
- Take format and the whole recording system: `docs/recording-system.md` and `docs/workbench.md` (History, recording and the timeline) in the AMS repo. Take model: `src/process/take.js`.

**p5comp** (`~/dev/arduino/p5comp`, branch `main`; earlier spike branch `ams-editor-integration`, check whether it is merged)
- Vendors Poliplan at `public/vendor/ams-editor/`. Update with `npm run vendor:ams` (or `vendor:poliplan`; `AMS_DIR` overrides the AMS path; `AMS_FULL=1` for the chunky build). These scripts build AMS and run `sync-embed.sh`, so AMS must be on a clean, built-able commit.
- Structure: `sim/` (Workbench.js, CircuitCanvas.js, DrawingBoard.js, SerialMonitor.js, P5SignalsPanel.js…), `ide/main.js`, `firmata/`, `shared/` (serial, compile, p5, editor), `server/`. `sim/DrawingBoard.js` is where the AMS editor is hosted (check it; it uses the `ams-editor.js` client).
- Serial: `shared/serial/` (SerialConnection, signals.js). Signals are named values; the p5 sandbox gets a `signals` object (`shared/p5/P5Bridge.js`).
- Tests: `npm test` (node --test). Run them before and after.

## Step 1: update Poliplan in p5comp

1. In AMS: `git pull` (or confirm commit ≥ `d11233d`), `npm ci` if needed, `npm run build:embed`.
2. In p5comp: `npm run vendor:ams` (set `AMS_DIR` if AMS is not at `~/dev/artistmodelstudio`). Confirm `public/vendor/ams-editor/VERSION` shows the new commit.
3. Run p5comp (`npm run dev`), open the drawing board, and in the console exercise the client the host already holds (find it in `sim/DrawingBoard.js`):
   ```js
   const ed = /* the editor client instance */
   ed.on('recording', e => console.log('recording', e));
   ed.on('take', e => console.log('take', e));
   await ed.recordStart({ title: 'test' });
   // draw something on the board, wait a few seconds
   const { take } = await ed.recordStop();      // plain ams-take JSON
   await ed.loadTake(take); await ed.playTake(); console.log(await ed.takeState());
   ```
   Expected: `take.clips` contains `draw` clips; playback redraws the strokes; `takeState` reports `playing`/`t`/`duration`. If any message errors, read `src/embed/bridge.js` in AMS (the `'record-start'`… handlers sit just above `camera:`); they use `app.recorder` and `app.player`. Fix in AMS, rebuild, re-vendor.
4. Add a **Record / Play** control to p5comp's drawing board UI that uses those calls, and a place to store takes with the project (opaque JSON; store next to the project's other files, e.g. `takes/<name>.ams-take.json`).

Done when: a student records a drawing, reloads the page, and replays it from the saved file.

## Step 2: p5comp-side recorder (code, run, serial, circuit)

Create `shared/takes/` in p5comp (no AMS dependency; plain JS). It writes the `ams-take` shape:

```
{ type:'ams-take', version:1, title, created, duration, baseline, clips:[], tracks:[], source:'p5comp', meta:{} }
clip: { id, track, lane, start, dur, … }   // times in ms from take start
```

Use these existing clip kinds so AMS can show them:
- `title` `{ text, sub }`: lesson title cards.
- `say` `{ text }`: narration/captions, and also the **serial monitor lines** (a line received or sent = a `say` clip with `meta:{ dir:'rx'|'tx' }`).
- `action` `{ name, label, ui:{ kind, target } }`: Run, Upload, Connect, Compile errors; `target` is a stable control name (like AMS `data-guide` attributes) so a pointer can travel to it on playback.

Add p5comp-specific kinds (AMS will treat unknown kinds as no-ops; keep them documented in this repo):
- `code` `{ file, diff }`: sketch edits as a line-range text diff against the previous state; `baseline` holds the initial files.
- `signal` `{ name, value }` or a sampled `{ names, values[] }` clip: sensor values received, and values sent back. Sample, do not log every message (e.g. at most 20 Hz per name).
- `circuit` `{ diff }`: wiring/component changes (only if the circuit sim exposes a change event).

Recorder rules (copied from AMS, they matter):
- One clock: `start` = `performance.now() - t0`. **Compress idle gaps over 2 s** (long thinking pauses) the way AMS's `liveClock` does, or takes are mostly empty.
- Do not record the recorder's own UI (it feeds itself).
- A take is view-only while playing; never mutate the project from playback unless the user presses "restore this state".
- Save by writing the JSON; keep it small (diffs not snapshots).

Playback in p5comp: `code` clips type into the editor (or just set the state at time t), `signal` clips drive the signals panel so the p5 sketch reacts with **no board attached** (a free mock-hardware mode for classrooms), `action` clips pulse the named control. Provide a transport (play/pause/seek) and show `say` clips as captions.

Done when: a student records "write sketch, upload, wiggle a sensor", saves, and later replays it with no Arduino connected.

## Step 3 (only if asked): tell the AMS side

Record in p5comp's `docs/` what clip kinds you added so the AMS side can later add real support (`docs/recording-system.md`, section "Making it interoperable"). The long-term plan is a shared no-DOM take core plus a per-host adapter (`snapshot / diff / apply / describe / cues / render`), so keep your recorder shaped like that: state snapshot, diff function, apply function, describe function.

## Not in scope here

- Porting the circuit simulator into AMS, the Arduino toolbar/Code mode in AMS, the comms package extraction, the three.js/threeditor integration. These are planned in the AMS conversation; do not start them.
- Do not run `scripts/sync-embed.sh` into other repos (Genereti etc.).
- Never use Gemini or paid OpenRouter models in any test; use Ollama or NVIDIA NIM.

## Report back

When finished, leave in p5comp: a short `docs/takes.md` (what is recorded, file layout, clip kinds), the commit(s), and a list of anything that needed a change in AMS (with the file and the fix) so it can be applied there too.

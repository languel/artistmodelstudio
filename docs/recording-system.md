# The recording system (takes), and how to reuse it elsewhere

Status: built and working in AMS, 6 Nov 2026. This is the map for anyone (human or agent) who wants to reuse it in another project, in particular the Arduino + p5 environment (`~/dev/arduino`, p5comp) and `~/dev/threeditor`. User-facing behaviour is in `docs/workbench.md` (History, recording and the timeline); the embed protocol is in `docs/EMBEDDING.md`.

## The idea in one paragraph

Everything a person or an agent does in the studio can be written down as a **take**: a plain JSON document of timed **clips** on **tracks**. A take plays back by *showing* the work (drawing replayed, an agent pointer travelling to each control, captions, narration, camera moves), it is edited on a Timeline, exported as text or video, and the same take format holds an eval run, a lesson, a walkthrough, or training data for a model. Nothing in the format knows about drawing: the drawing is one clip kind (`draw`, a document *diff*); a host project supplies its own kind of change and its own way to apply it.

## The take format (`ams-take`)

```
{ type: 'ams-take', version, title, created, duration, baseline, clips, tracks, assetId, source, meta }
```

- `baseline`: the document the take starts from. For AMS a full document; for another host, whatever its own state is.
- `clips[]`: `{ id, track, lane, start, dur, … }` in milliseconds on the take's clock. Kinds (by `track` kind): `title` (text card), `say` (narration/captions, also the annotation channel: evals put PASS/FAIL here), `draw` (a diff of the document, with point timing `[x,y,t,pressure]`), `action` (a tool call or an interaction cue), `camera`, `audio`, `comp` (a nested set of tracks and clips; History is one).
- `tracks[]`: `{ id, kind, name, muted, live }`. `live` tracks are rebuilt from the recording while it runs (History, Interactions) and are frozen afterwards; a saved take keeps them as plain clips.
- `flatClips(take)` (`src/process/take.js`) is the one function everything that plays a take reads: it opens comps out in place.
- Document diffs: `diffDocs`/`applyDiff` over `DOC_KEYS` (title, artboard, stages, decisions, groups, brushes, lines, meta, boards, train). **This is the part a host replaces**: the clip kinds around it (title, say, action, camera, audio, comp) are generic.

## The pieces and where they live

| Piece | File | Job |
|---|---|---|
| Take model | `src/process/take.js` | create, clip ids, reading time, `flatClips`, diffs |
| Recorder | `src/workbench/recorder.js` | start/stop, overdub onto an open take, `saveTake`, turns tool calls and document changes into clips |
| History | `src/workbench/history.js` | every change as an entry; `realClips/clipsFrom/durationOf` turn entries into draw clips with real timing |
| Interactions | `src/workbench/interactions.js` | the controls clicked, keys, drags, scrolls, selections, as steps (with `describe`, `steps`, `clips`) |
| User actions | `src/workbench/userActions.js` | where cues come from: the "Show user actions" panel; `effectsOf`, keycaps, drag paths, pop-ups |
| Live clock | `src/workbench/liveClock.js`, `liveTake.js` | one real-time clock for History + Interactions (gaps over 2 s compressed), live tracks while recording |
| Player | `src/workbench/takePlayer.js` | transport (play/seek/loop), draws the take to the canvas, fires cues, selection frames, scrub cursor |
| Guide | `src/workbench/guide.js` | the agent pointer: `cue/follow/pointAt/popupFor/pulse` with token cancellation; look settings |
| Timeline UI | `src/workbench/panels/timeline.js` | tracks, zoom, record toggles, takes list, delete/rename |
| Text view | `src/process/clipWords.js`, `src/workbench/transcript.js`, Code panel Take tab | take as Markdown/JSON for reading or handing on |
| Evals as takes | `src/workbench/evalTakes.js` | `recordEval(app, {engine, model})` → a take per model with titles, drawing, tool calls, verdicts |
| Agent surface | `src/workbench/mcp.js` | `ams_interactions` (steps/record/clear/state), plus all `ams_*` tools; every tool call becomes an action clip |

## Why this is training data

A take pairs *intent* (title/say clips, or the request log) with *action* (tool calls, interactions) and *result* (draw diffs, before/after through `baseline` + `changes`). `Interactions.steps()` gives numbered steps in words with the History entry ids each caused, so a step is checkable (before = drawing without them, after = with). Eval takes add a verdict. Directions not built yet: demonstrate-to-agent ("teach the agent" from a take), preference pairs from two takes of one task, exporting takes as SFT/DPO rows.

## Making it interoperable (the Poliplan approach)

Poliplan is the drawing editor as an iframe with the `ams-editor-v1` message protocol and a small client (`src/embed/client.js`, vendored by hosts with `scripts/sync-embed.sh`). The recording system should travel the same two ways:

1. **Embedded (done, 6 Nov 2026).** The editor's bridge now carries take messages, so a host can record and play the *editor's* work without knowing the format: host → editor `record-start`, `record-stop` (→ the take JSON), `take-load { take }`, `take-play`, `take-pause`, `take-seek { t }`, `take-state`; editor → host events `recording { on }` and `take { id, title, duration }`. Client methods: `recordStart/recordStop/loadTake/playTake/pauseTake/seekTake/takeState`. Hosts store takes as opaque JSON.
2. **Host-native (next).** For a project that is not an AMS drawing (Arduino + p5 sketches, a three.js editor) the editor iframe is not the thing recorded; the host's own state is. That needs the take core extracted from AMS as a small package, with these seams:
   - **Core (no DOM, no AMS):** take model, `flatClips`, the live clock, transport maths, `clipWords` text view, JSON schema.
   - **Host adapter** (what each project supplies): `snapshot()` (baseline), `diff(a, b)` and `apply(state, diff)` for its own state, `describe(diff)` for words, a `cues` source (what controls were used, with a `data-guide`-style target name), and `render(state)` to show a frame.
   - **Player/Guide** stay UI-side but only need an element lookup by target name and a pointer overlay.
   - Keep `type: 'ams-take'` and bump `version` for any change; keep unknown clip kinds playable as no-ops so takes from one host open in another (showing titles, narration and cues even if the diff cannot be applied).
3. **Standalone viewer.** A takes player that opens any `ams-take` file with only the generic kinds (titles, narration, cues) would let a lesson recorded in one project be watched anywhere. Poliplan's score runtime (`src/score/runtime.js`, built into `dist-embed/score-runtime.js`) is the precedent for a tiny standalone player.

## Integration notes per project

**Arduino + p5 environment (p5comp, `~/dev/arduino/p5comp`, already a Poliplan host on branch `ams-editor-integration`).** Closest to AMS in spirit (code, a sketch, a circuit, a teaching environment). Record: the sketch source as the diffed document (text diffs by line/range), tool-like actions (run, upload, wire a component), interactions (which panel/button), serial output as `say`/`action` clips. Plays back as the code being typed in the editor with the pointer travelling to Run. First step needs no refactor: vendor the latest Poliplan build, use the new take messages to record the *drawing board* inside p5comp, and add a p5comp-side recorder for code and circuit state that writes the same `ams-take` JSON with its own clip kinds.

**threeditor (`~/dev/threeditor`).** A three.js scene editor: the document is the scene JSON (objects, transforms, materials). A diff is a list of object/property changes (three.js `Editor` already has a command history with undo/redo, which is exactly an History-entries source). Interactions are the editor's own panels and viewport drags. Camera clips map to the editor camera. Needs the host adapter above; the Timeline UI could be reused as is by embedding AMS's Timeline panel as a component.

Open design question for both: reuse by **embedding AMS** (iframe, Poliplan-style, the host sends its state as a "document" and receives takes) versus **extracting the core** (a shared package both import). The embed route is cheap and works today for drawings; the extracted core is the right route once two non-drawing hosts exist. Suggested order: do the p5comp spike on the embed route to learn what the host adapter really needs, then extract the core from that.

## Known limits (6 Nov 2026)

- Menus, dialogs and pop-ups other than the colour picker are recorded as cues but not reopened on playback.
- An agent run that moves its own pointer while overdubbing is untested.
- Drag path timing against History stroke timing is only verified logically.
- Pointer shapes (ring, crosshair, dot) have not been looked at on screen.
- Unsaved takes are lost on reload; only saved takes (Assets) persist.

# Plan: the camera, automation and render (the studio metaphor)

Written 7 Nov 2026. Status: a plan, nothing here is built except where it says so. It follows the Timeline work of 6–7 Nov (media clips, board clips, the Program board, ffmpeg export), which built a *video switcher*. This plan replaces that metaphor with the one the project is really after: **Lotte Reiniger's studio, at the scale of AMS**: a camera over a stack of planes, shooting one frame at a time, with puppets and parameters moved by hand and recorded.

## 1. Goal

1. A **camera** that looks at the canvas world (any board, frame or region), moves, and cuts from one thing to another.
2. **Automation recorded for anything**: marks, boards, code-sketch parameters. Arm a lane, move a control, play it back.
3. A **render**: step the timeline frame by frame, apply the automation, photograph what the camera sees, encode to a file. Deterministic: the same scene renders the same film.
4. Keep what already works: clips of video and stills, per-scene timelines, the Mediathèque, ffmpeg export.

## 2. The metaphor, mapped

| Reiniger's studio | AMS today | Missing |
|---|---|---|
| Glass planes, layered scenery | Boards as layers: order, opacity, blend, masks | — |
| Silhouette puppets, lightbox | Marks, sprites, p5 / three.js sketches with parameters | — |
| Animation stand, rostrum camera | Take *camera* track: view keyframes `{cx, cy, z}` over the **main artboard only** | A camera that looks at any board or region; rotation; several cameras |
| Cutting between sets | Scenes; frame boards; board clips (a fixed full-board shot) | Cuts as camera shots with a target |
| Shooting frame by frame | Stop-motion board: shutter, fps, onion skin, in/out, record, save as video | Driven by the timeline instead of a person pressing the shutter |
| Her hands moving puppets | Direct editing; recorded History (drawing) and Interactions (clicks) | Recorded *parameter* motion |
| The film | Take export: real-time recording of the tab; ffmpeg cut of a clip | Frame-exact render of the camera's output |

What the current build is, in these terms: the **Program board** is the camera's **viewfinder** (keep it; make the camera its source). A **board clip** is a shot with the camera fixed on one whole board (keep it as a shortcut for that case). The **media track** places footage: it moves into the world (see 3.4).

## 3. The camera

### 3.1 Objects
- **Camera** (per scene): `{ id, name, w, h, fps }`: the frame it shoots (default 1280×720, 25 fps from the scene transport). One by default, more allowed (a second camera for an insert, a different aspect).
- **Shot**: a clip on the Camera track: `{ track: 'camera', camera, start, dur, target, move }`.
  - `target`: `{ board: id }` (frame the whole board), `{ frame: id }`, or `{ rect: [x, y, w, h] }` in world units.
  - `move`: optional keyframes `[{ t (0..1 of the shot), cx, cy, z, rot, ease }]` relative to the target. No keyframes = a locked-off shot.
  - A **cut** is two shots touching. A **dissolve** is two overlapping with `fx.fade` (the existing clip fade).
- The existing camera clips (`{cx, cy, z}` over the artboard, `cameraAt` in `src/process/take.js`) become shots whose target is the main board. They keep working unchanged.

### 3.2 Output
The camera's frame is drawn by one function `renderCamera(app, camera, t) → canvas`: find the shot at `t`, compute the view (target + move), draw the scene's boards through that view (the same board compositing the canvas uses; masks and effects included). The **Program board** shows `source('timeline')` = that canvas, so everything downstream (pin, window, full screen, `source('timeline')` in code) is unchanged. `timelineSource.js` calls `renderCamera` instead of the media overlay.

### 3.3 Viewing and framing
- Camera frame drawn on the canvas as a thin rectangle (safe area optional), draggable and resizable: the **viewfinder in the world**. Selecting a shot shows its frame; dragging it edits the target or the keyframe under the playhead.
- A "Cut to here" button: new shot from the current view at the playhead.
- Looking through the camera: the Program board, or the canvas itself locked to the camera (a toggle).

### 3.4 Footage moves into the world
A video or still clip is a **board with a source** (this already exists: Assets › double-click, `placeSource`). To put it in the film you aim the camera at it. The media track stays for the plain-edit case ("▶ Timeline" on a card): it creates the board *and* a shot at the playhead, so the NLE-style workflow keeps working and is just the simplest use of the camera. Media clips that exist in saved takes keep playing over the Program picture as today (compatibility), and are converted on request.

## 4. Automation

### 4.1 What can be automated
Anything with an **address**. An address is a string `scope:id.property`:
- mark: `mark:<id>.opacity`, `.x`, `.y`, `.rotation`, `.scale`, stroke width, colour channels
- board: `board:<id>.x|y|opacity|width|height`, effect and mask parameters
- camera: `camera:<id>.cx|cy|z|rot`
- sketch control: `ctl:<boardId>.<name>` for the parameters codeParams.js finds (`/* 0..1 */` numbers, `params: {…}`), which a sketch already receives live (`f.vals` in `boardFrames.js`)
- scene: tempo, transport values

A registry `src/process/params.js` resolves an address to `{ get(), set(v), range, kind }`. Each scope registers its resolver; unknown addresses are kept in the take and ignored on playback (a take stays valid if a mark is deleted).

### 4.2 Lanes and recording
- A take gets **automation lanes**: `{ track: 'auto', address, points: [[t, v, ease]] }` stored as a clip with `dur`.
- **Arm** a lane (or "record what I touch": arm the scene), press play or record, and every change to an automatable value made by the hand is written as points. Points are thinned (Ramer–Douglas–Peucker on the curve, tolerance by range) so a slider drag is tens of points, not thousands.
- Edit in the timeline: lanes draw as curves; drag points, change ease; the existing clip operations (move, split, copy) apply to the lane as a clip.
- Playback: each frame `set(address, value(t))`. While playing, a lane owns its value; touching the control mid-playback records over it (overdub) if armed, else it is ignored until stop.

### 4.3 Relation to History and Interactions
History records *drawing* (diffs of marks) and Interactions records *clicks*. Automation records *continuous values*. They share the clock (`liveClock.js`). A drag of a mark can still be a History entry; if the mark's position is also an automation address, the user chooses (a setting): record drawing (default, as now) or record motion.

## 5. Render

### 5.1 Principle
**The playhead is the clock.** To render, stop real time: for frame `n` set `t = n / fps`, apply every lane, advance every sketch to that frame, draw `renderCamera`, store the picture. This is what the stop-motion board does by hand with its shutter; the render is the same loop with the timeline as the finger.

### 5.2 Deterministic sketches
Sketches (p5, three.js) run in sandboxed frames on the wall clock. Needed:
- a **fixed seed** per sketch per render (exists: `seeds` / `reseed` in `boardFrames.js`, `Math.random` is replaced when a seed is set);
- a **frame stepper**: the sketch frame already holds `requestAnimationFrame` callbacks (`held`); a render releases exactly one per output frame and waits for it to finish (`painted`);
- a **time shim**: `millis()`, `performance.now()` and `Date.now()` inside the frame return `frame × 1000/fps` during a render, so time-driven sketches match.
- Open question (verify first): how many existing sketches read other clocks (`frameRate()`, audio). The shim is a layer, not a rewrite; sketches that do not cooperate are rendered "live" with a warning.

### 5.3 Capture and encode
- Capture at the camera's size into an `OffscreenCanvas`; frames go to ffmpeg.wasm as they are made (image2pipe or a numbered file sequence in its virtual disk), MP4 or WebM at the end. Memory bound: a few hundred frames at 720p are fine; longer renders write in segments and concatenate.
- Audio: the take's audio clips and narration mixed with `amix` (the take-export code already does the math for video + audio; reuse).
- A **render dialog**: range (all, In–Out, selected shot), camera, size, fps, format, "Preview at half size". Progress with frames per second and time left. Cancel keeps nothing half-written.
- Same job, other outputs: PNG sequence zip (frames for another editor), a single frame (poster), the contact sheet.

## 6. Data model (additions, all optional so old takes load)

```
take.cameras = [{ id, name, w, h, fps }]
clip { track: 'camera', camera?, target?, move? }       // old clips: { cx, cy, z } still valid
clip { track: 'auto', address, points: [[t, v, ease]], dur }
doc  (scene)  program board = the board whose source is 'timeline'   // as built
```
Per-scene, as today: the take belongs to the scene; cameras live in the take.

## 7. Phases

Each phase ends with something visible and a check in the browser; each is one or two commits.

**Phase 1: the camera (no automation yet).**
- `renderCamera`, shots with targets, locked-off and keyframed moves, the camera frame in the world, "Cut to here", old camera clips as main-board shots, Program board fed by the camera, board clip becomes "shot at this board".
- The "▶ Timeline" card button makes a board+shot (the NLE path keeps working).
- Check: three boards, three shots with a pan between two of them, plays on the Program board, pins to a window.

**Phase 2: automation for boards, marks and the camera.**
- `params.js` registry; lanes; arm/record; curves in the timeline; playback; thinning.
- Check: record a board sliding and fading, play it back identically; record a camera drift; a mark's rotation.

**Phase 3: automation for sketch parameters.**
- `ctl:` addresses from codeParams; push values into running sketch frames without a rebuild; record a slider move on a p5 sketch.
- Check: a sketch parameter recorded while the sketch runs, replayed, identical on two runs.

**Phase 4: the render.**
- Stepper and time shim for sketch frames; offscreen capture; ffmpeg encode; the render dialog; cancel and progress; PNG sequence.
- Check: render a 10 s scene with a moving camera, a video clip, a sketch with an automated parameter; the file is the right length and two renders are frame-identical (compare hashes of frames 0, 100, last).

**Phase 5: the Reiniger pieces.**
- Multiplane parallax: per-board depth so a camera move shifts planes at different rates (`z` on a board, applied in `renderCamera`).
- Puppet-style animation: stop-motion board as a *source of poses* the camera can shoot; onion skin through the camera.
- Several cameras, a switcher (live cut by hand, recorded as shots).

## 8. What we keep, change, drop

- **Keep:** per-scene take; Media lane and ▶ Timeline; media clips in saved takes; stills; ffmpeg clip export; Mediathèque; split/ripple; board clips.
- **Change:** `timelineSource` draws from the camera, not from the media overlay; "board clip" is a shot; the Program board is the viewfinder.
- **Drop (late):** drawing media over the main board without a Program board (already off when a Program board exists).

## 9. Risks and open questions

1. **Sketch determinism** is the largest unknown (5.2). Mitigation: Phase 4 starts with a spike on three existing sketches before the dialog is built.
2. **Memory and speed** of in-browser encoding for long renders; segments if needed.
3. **Parameter addresses must survive edits** (rename, delete, reorder). Use stable ids, never indexes; unknown addresses are kept and ignored.
4. **Real-time vs recorded values** while playing: a clear rule (4.2) and a visible state on the lane (armed, playing, overdubbing).
5. **Camera on the canvas vs the main artboard**: old takes assume the artboard; the main-board shot keeps them identical.
6. **Cross-origin video frames** in a render need CORS-clean media (the Mediathèque is; some streams are not). Frames that cannot be read are reported, not skipped silently.
7. Questions for the author: one camera or many from the start? Is parallax in scope for Phase 5 or a later plan? Should automation of *drawing* (a mark's points over time, as the History track does) and automation of *values* share a lane type?

## 10. First steps (if approved)

1. Phase 1 spike: `renderCamera` for a board target and a locked shot; Program board fed from it; compare against what the Program board shows now.
2. Phase 4 spike (parallel, independent): step a p5 sketch N frames with a seed and a time shim; render 50 frames; verify two runs match. This decides how much of section 5.2 is real.

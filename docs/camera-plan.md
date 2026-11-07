# Plan: the camera, automation and render (the studio metaphor)

Written 7 Nov 2026; decisions of the author added the same day (section 0). Status: a plan, nothing here is built except where it says so. It follows the Timeline work of 6–7 Nov (media clips, board clips, the Program board, ffmpeg export), which built a *video switcher*. This plan replaces that metaphor with the one the project is really after: **Lotte Reiniger's studio, at the scale of AMS**: a camera over a stack of planes, shooting one frame at a time, with puppets and parameters moved by hand and recorded.

## 0. Decisions (author, 7 Nov 2026)

1. **Several cameras from the start.** The camera list is part of Phase 1, and shots name their camera.
2. **Multiplane parallax is in scope**, as part of the first automation phase (a board's depth is a parameter like any other, so a camera move can shift planes at different rates).
3. **One consistent way to automate any parameter, like Blender's keyframe dot.** Every parameter that can be animated shows the same small control next to it, wherever it appears (Properties, board and mark panels, camera, sketch controls, effects). One lane type, one gesture. Drawing (a mark being drawn on) is expressed through the same lanes where it can be (a `reveal` value), and the recorded History/Drawing clips stay as they are for compatibility (see 4.5).

## 1. Goal

1. A **camera** that looks at the canvas world (any board, frame or region), moves, and cuts from one thing to another.
2. **Automation for anything, in one consistent way**: marks, boards, cameras, effects, code-sketch parameters. A keyframe dot beside every parameter; or arm a lane and move the control; play it back.
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
- **Camera** (per scene, any number): `{ id, name, w, h, fps, depthRange? }`: the frame it shoots (default 1280×720, 25 fps from the scene transport). A new scene has one (*Camera 1*); add more for an insert, a different aspect, a second angle on the same set. Each camera has its own viewfinder frame on the canvas (own colour) and its own output: the Program board shows the **active camera**, and any other camera can be shown on a board of its own (`source('camera:<name>')`).
- **Shot**: a clip on the Camera track: `{ track: 'camera', camera, start, dur, target, move }`.
  - `camera`: which camera takes the shot. Shots of different cameras on the same time make a **multi-camera** edit: the **Program** cut (a track of `cut` clips choosing the active camera over time, like a switcher) is what the Program board and the render use. Recording a live switch by hand writes these clips.
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

## 4. Automation: one consistent way (the keyframe dot)

### 4.1 The control
Every automatable parameter, wherever it is shown, gets the same small **diamond (◆) beside it**, drawn by one shared helper that wraps the common field widgets (`numberField`, `rangeInput`, `selectField`, colour and toggle fields in `src/workbench/ui.js`, the sketch control widgets in `codeParams.js`). A parameter has one of these states, shown by the diamond:

| State | Look | Meaning |
|---|---|---|
| Not animated | hollow, dim | a plain value |
| Animated | filled, muted colour | has keyframes; the field shows the value at the playhead and cannot drift |
| Keyframe here | filled, bright | there is a keyframe exactly at the playhead |
| Changed, not keyed | filled outline, warm | you changed the value at a time with no key (Blender's orange): press the diamond to key it |
| Recording | red | armed: changes while the transport runs are written |

Gestures (the same everywhere):
- **Click** the diamond: insert a keyframe at the playhead with the current value (on a keyed frame: remove it).
- **Hover a field and press I**: insert; **Alt+I**: remove. (The Timeline already uses hover for its keys.)
- **Right-click** the diamond or the field: Insert, Delete, Clear all keyframes, **Show in Timeline**, Copy/Paste keyframes, Interpolation (constant, linear, ease, bezier), Add to the armed lane set.
- **Typing or dragging a field on an animated parameter** at a time without a key shows the warm "changed" state; with *Auto-key* on (a button in the Timeline bar, like Blender's record dot) it writes the key at once.
- **Show in Timeline** reveals the parameter's lane (and groups lanes under the thing that owns them: board › property, mark › property, camera › property).

### 4.2 What can be automated
Anything with an **address**: `scope:id.property`:
- mark: opacity, x, y, rotation, scale, stroke width, colour channels, `reveal` (0..1: how much of the stroke is drawn)
- board: x, y, width, height, opacity, blend (stepped), `depth` (parallax), effect and mask parameters
- camera: `cx, cy, z, rot` and the shot target's blend between two targets (a rack from one board to another)
- sketch control: `ctl:<boardId>.<name>` for the parameters codeParams.js finds (`/* 0..1 */` numbers, `params: {…}`), which a sketch already receives live (`f.vals` in `boardFrames.js`)
- scene: tempo, transport values

A registry `src/process/params.js` resolves an address to `{ get(), set(v), range, kind: 'float' | 'int' | 'bool' | 'enum' | 'color' | 'vec2', step? }`. Each scope registers its resolver. **The field widgets read the registry** (that is how the diamond knows what it is beside, and what a keyframe stores). Addresses use stable ids, never indexes; an address that no longer resolves is kept in the take and ignored on playback.

### 4.3 Lanes and keyframes
One lane type: `{ track: 'auto', address, keys: [{ t, v, ease }] }`, a clip with `dur` like any other: move, split, copy, mute and fade work on it. Value kinds interpolate by kind (floats and vectors by the chosen curve, colours in a perceptual space, bool/enum held). Lanes draw as curves in the Timeline (a curve editor: drag keys, tangents, ease presets); several lanes can be shown overlaid.

### 4.4 Recording and playback
- **Insert by dot or I** is the precise way. **Record** is the live way: arm a lane (or *Record what I touch*), press play, move the control: every change is written as keys, thinned (Ramer–Douglas–Peucker, tolerance by range) so a slider drag is tens of keys.
- Playback: each frame `set(address, value(t))`, for animated parameters only. While playing, a lane owns its value; touching the control mid-playback records over it if armed (overdub) and is otherwise reverted at the next frame (the field shows the lane's value, with the warm state).
- Scrubbing and stepping evaluate the lanes at the playhead (so Properties always shows the value at the playhead).

### 4.5 Drawing, History and the one lane type
The author asked for one consistent way for *any* parameter. So: a mark being drawn on is the parameter `mark:<id>.reveal`; a mark's movement is its transform parameters; a stroke whose points are edited over time is keyed on its vertices only if asked (`mark:<id>.points`, a *path* lane, off by default). The existing **recorded Drawing clips** (History diffs revealed over time) and **Interactions** stay as they are, so no take is invalidated; the Timeline offers *Convert to lanes* (a draw clip becomes `reveal` keys). A setting says what a drag of a mark records: drawing (as now) or motion.

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

**Phase 1: cameras (several), no automation yet.**
- `renderCamera`, the camera list (add, rename, colour, size), shots with targets, locked-off shots, the camera frame in the world, "Cut to here", the Program cut track (active camera over time), old camera clips as main-board shots, Program board fed by the active camera, any camera on a board of its own, board clip becomes "shot at this board".
- The "▶ Timeline" card button makes a board+shot (the NLE path keeps working).
- Check: two cameras on the same set, a cut between them, a locked shot of each of three boards, plays on the Program board, pins to a window.

**Phase 2: the keyframe system (the dot) and parallax.**
- `params.js` registry; the shared diamond wrapper on the field widgets; keys, lanes, the curve editor, auto-key, record, thinning, convert drawing to lanes; camera moves become keyframes on the camera parameters; board `depth` and parallax in `renderCamera`.
- Check: the diamond appears beside the same parameters in Properties, the board panel and the camera; key a board sliding and fading, a camera pan, a mark's `reveal`; a three-plane parallax move; play identically twice.

**Phase 3: sketch parameters.**
- `ctl:` addresses from codeParams, the diamond on sketch control widgets in the editor and on exported controls; values pushed into running sketch frames without a rebuild; record a slider move.
- Check: a sketch parameter keyed with the dot and recorded live; replayed, identical on two runs.

**Phase 4: the render.**
- Stepper and time shim for sketch frames; offscreen capture; ffmpeg encode; the render dialog (camera or Program cut, range, size, fps, format); cancel and progress; PNG sequence.
- Check: render a 10 s scene with two cameras and a cut, a moving plane, a video clip and a sketch with a keyed parameter; the right length; two renders frame-identical (hash frames 0, 100, last).

**Phase 5: the Reiniger pieces.**
- Stop-motion board as a source of poses the camera shoots; onion skin through the camera; live switching between cameras recorded as cuts; lightbox (a board that lights what is behind it); per-camera depth of field if wanted.

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
7. Resolved by the author (section 0): several cameras; parallax in scope (Phase 2); one lane type with a keyframe dot everywhere. Still open: the exact look and keys of the dot (this plan proposes Blender's: click, I, Alt+I, right-click); whether *path* lanes (per-vertex keys) are worth building at all; whether auto-key is on by default (proposed: off).
8. **A shared wrapper is only as consistent as the fields that use it.** Today panels build fields in several ways (`ui.js` helpers, hand-made inputs, CodeMirror widgets). Phase 2 begins with an audit of where parameters appear and moves them onto the shared widgets, so the dot is not missing in half the panels.

## 10. First steps (if approved)

1. Phase 1 spike: `renderCamera` for a board target and a locked shot, two cameras and a cut; Program board fed from it; compare against what the Program board shows now.
2. Phase 2 spike: the registry and the diamond on **three** different kinds of field (a Properties number, a board panel slider, a sketch control) keyed and played back; this tests whether one wrapper really fits.
3. Phase 4 spike (parallel, independent): step a p5 sketch N frames with a seed and a time shim; render 50 frames; verify two runs match. This decides how much of section 5.2 is real.

## 11. Keyframe dot spike: result (7 Nov 2026)

Built as a spike on `main` (not a finished feature): `src/process/keyframes.js` (lane model, interpolation, tests), `src/workbench/params.js` (address registry: `board:`, `mark:`, `ctl:`), `src/workbench/keyframeDot.js` (the diamond, `withDot`, the I key), automation applied by `TakePlayer.applyAutomation`, `BoardFrames.setCtl/getCtl`, styles `.wb-kf`.

**Result: one wrapper fits three very different fields.** The same dot and the same lane type drive (1) a **board's Opacity** in the Board panel, (2) a **mark's Opacity** in Properties › Look, and (3) a **sketch control** in the board code panel's control strip (`ctl:<board>.<name>`), all keyed at 0 and 2 s: values at 1 s are exactly half-way (board 0.65, mark 0.55, control 3.5 with the default ease), the same while playing (990 ms: 0.66, 0.56, 3.45), and the sketch's code is untouched (the lane overrides the live value only).

States seen: hollow, animated (filled), keyframe here (bright), changed-not-keyed (warm); the field follows its lane (shows 0.2 at 3 s). Not yet: the right-click menu and the I key were written but not exercised by hand; Auto-key, record, the curve editor and the Timeline lane drawing are not built (lanes show as an `auto` row).

**Findings that change the plan**
1. **Code values fight automation.** The board frames re-send a sketch's control values from its code on every document update, which reset an automated control within 200 ms. Fixed with an `automated` set: a control a lane drives is skipped by that sync. Any other place that pushes values from a source of truth needs the same rule (Phase 3 must audit them).
2. **Automation writes into the document (transiently).** A value set from a lane stays in the saved scene at the last frame played (as in Blender). Options for Phase 2: restore the keyed "rest" values when the take closes, or accept it and show the dot as animated when a scene is reopened. To decide.
3. **Scrub must re-apply.** A value changed by hand, then a jump of the playhead to a time whose lane value is unchanged, must go back; `seek` clears the applied cache (playback keeps it so nothing is redrawn for nothing).
4. **Only fields on the shared widgets get the dot** (here: three call sites changed by hand). The audit in section 9.8 is still the main cost of Phase 2: this spike wrapped three of the dozens of fields.
5. The `auto` track needs a name, an icon and a curve view in the Timeline (it appears as a plain row labelled `auto`).

### Update after the author's first try (7 Nov 2026, later)
Feedback: lanes were dark on dark and hard to read, keys were hard to see, the dot only appeared on Opacity, and in code the dot wrapped to a new row. Changed:
- **Lanes are legible.** Each parameter gets **its own row, named for it** ("line · Width", "Board 5 · back"), a light bar with its keyframes drawn as diamonds (value and ease in the tooltip). The first keyframe fits the view to the take. Keys are stored **relative to the lane's start**, so moving a lane moves its keys.
- **The dot is on many more fields.** `numberField({ address })` is all a field needs (the keyframe dot registers a decorator); done for a mark's brush parameters (Width, Pressure, Taper, Wobble, Opacity), plane stroke width, look Opacity, board Width/Height/Opacity and the source's Opacity, and every sketch control. Marks and boards pass a stable address (`mark:<id>.brush.width`, `board:<id>.height`).
- **Value kinds.** Numbers ease; `#rrggbb` colours blend in RGB (the grey mid-way seen on a sketch's `back`); toggles, choices and palettes hold their value until the next key.
- **In the code panel the dot sits in the control row** (a fourth column), not on a new row.
- Keying a parameter no longer re-evaluates every other parameter (a value you changed and have not keyed stays until the playhead moves).
Still open: colour pickers, selects and blend modes in Properties (only numbers are wired), the camera-style board X/Y, and the audit of the many remaining numeric fields.

### Update after the second try (7 Nov 2026, evening)
Feedback: no clear difference between "driven by a key" and "changed by hand"; keying showed no visual change; wanted auto-key and colour/palette/choice interpolation; key diamonds did not sit on the lane's edges. Changed:
- **State tint.** The field (or a sketch control's row) is green while a lane drives it, yellow with a key at the playhead, orange when changed since (Blender's scheme). A user move of a sketch slider on an animated control now sets the running value (the code keeps its default) and shows orange.
- **Auto-key** (Timeline bar button, `ams_autokey` in localStorage): with it on, a change to an animated parameter at the playhead writes a key. Parameters set by a lane never trigger it (the player marks `applying`).
- **Value kinds** (`mix` in `src/process/keyframes.js`, tested): colours, palettes (per colour), choices (index through the options, snap to nearest), toggles (snap half-way). A lane keeps `meta.options` for choices.
- **Lane geometry.** Lane bars are square-ended and keys sit exactly on `x(t)`, so a key at 0 or at the end is on the edge.
Open: choices in Properties (selects, blend modes), colour pickers, board X/Y, a curve editor, record. Possible refinement: auto-key on a not-yet-animated parameter (today only animated ones key).

### Update: the dot on colours, choices, position and effects (7 Nov 2026, night)
Colour fields, blend modes (a stepped choice), a board's X/Y, effect parameters and mask feather now carry the dot. Checked on a board: X 1046→1446 over 2 s, paper `#1b1c1f`→`#e63946` (`#812b33` at 1 s), blend normal→multiply (1 s)→screen (1.5 s). Findings: **effects are addressed by index** (no ids), so reordering or removing an effect changes what a lane drives: effects need stable ids before this is relied on. A board's X/Y moves its marks with it (that is what you want for a film). Remaining reach: Play section, note size/width, tool and sculpt settings, timeline clip fields.

### Phase 1 status (7 Nov 2026, night): cameras built
Done: camera list per take (`take.cameras`), `shot` clips (target board or region, pose, move), `renderCamera` (boards as pictures, opacity/blend, sketch snapshots, sources kept running via `Sources.seeCamera`), the Program feed (the shot that started last), a board per camera (`source('camera-1')`), viewfinder frames in the world (dashed, solid for on air), Insert menu items, a shot section in Properties, board *Put on the Timeline* now makes shots. Checked: Butterfly board shot (video playing through the camera), a Camera 2 shot on Board 5 with a zoom move cutting over it, viewfinders on the canvas, Program output at 1.0, 4.8 and 6.5 s. Unit tests in `camera.test.js`.
Deferred from the plan's Phase 1: an explicit Program cut track (the later shot wins today), conversion of old Camera-track clips, "▶ Timeline on a card makes board+shot" (media clips still overlay), camera size/fps editing UI, per-camera depth. Phase 2 will turn the shot's pose (`z`, `dx`, `dy`) into keyframe lanes through `camera:<id>.*` addresses.

### Phase 2 status (7 Nov 2026, night): done
Shot pose lanes (`shot:` scope), board `depth` + parallax (`parallaxRect`, tested), curve view with draggable keys and a key menu on the Timeline lanes, record automation with thinning (`thinKeys`, tested; `keyHere`), plus everything from the dot work (colours, choices, board X/Y, effects). Checked in the browser: a shot's zoom and shift keyed through the dots and shown in the Program (zoom 1.75 at 1 s); a key dragged with the mouse (t 1500→1693, value 2.5→1.61); a recorded opacity ramp (42 keys while playing, 4 after thinning). Not done: "convert drawing to lanes" (a draw clip to `reveal` keys), `reveal` as a parameter, per-key tangents/bezier handles, a multi-lane overlay, effects by stable id. A shot's `to` move and its lanes can both exist: the lane wins while it has keys.

### Phase 3 status (7 Nov 2026, night): sketch parameters
The sketch-control lanes (`ctl:<board>.<name>`) were built in the spike; Phase 3 closed the gaps. **A sketch that starts again keeps its automated values** (`TakePlayer.ctlValuesFor` seeds `f.vals` before the frame is built: before, a structural code edit reset every automated control to the code's default until the playhead moved). **Choices step through their options** (`/* a|b|c|d */`: keyed a→d, at 1 s it is `c`, at 1.5 s `d`; the lane keeps `meta.options`). **Recording a slider move** works (a 1.5 s drag on `speed` made 28 keys while playing, 3 after thinning). Audit of the other places that push values into a sketch: the code→control sync (`BoardFrames.ctl`, guarded by `automated`), the restart path (fixed), output windows (`outputs.ctl` is called from `setCtl`, so twins follow). Checked on a temporary p5 board (removed afterwards). Still open: a control that exists only in the exported page (no running frame).

### Phase 4 status (7 Nov 2026, night): the render
Spike first, as planned: a p5 sketch using `random()`, `millis()` and `frameCount` rendered twice, 51 frames each, gave identical frame hashes (50 distinct, none blank, about 0.5 s for 2 s of film). What it took: a render mode in the sketch bridge (`frameDoc(..., renderMode)` in `boardFrames.js`: fixed seed, `performance.now`/`Date` shim, a queue instead of `requestAnimationFrame`, an `advance` message that runs 60 steps a second and sends back an ImageBitmap), a warm-up of the first frames (p5 does not paint its first one or two and registers the next a moment later: three frames are run at the first advance, so the sketch clock leads by 3 frames), and readiness after the sketch's setup (not the page load). Then `renderTake` (frame loop), `startEncoder` in `ffmpegRunner.js` (JPEG frames to MP4/WebM), the dialog and the Timeline button. Checked end to end: two shots (a sketch with a keyframed zoom, then the Butterfly board playing) rendered at 640×360, 12 fps, 24 frames: a 2.00 s MP4, and **two renders byte-identical**; frames seen at 0.1 s, 0.9 s (zoomed) and 1.4 s (the film). Not done: sound, a PNG sequence, rendering a chosen camera instead of the Program, long renders in segments, sketches that read other clocks (`setInterval`, audio).

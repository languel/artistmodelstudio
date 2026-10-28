# Three.js for body and sound: series plan

Pages are plain static HTML + ES modules; three.js (r186) is vendored in `vendor/`, so a lecture works offline.
Serve with `python3 lessons/threejs/serve.py 5199` (static + saves recordings to `data/`). MediaPipe runtime and models (~35 MB, git-ignored): `lessons/threejs/fetch-mediapipe.sh`.

Every demo lives in one navigable scene (OrbitControls) so the body, the sound and the marks share a space the audience can walk around.

## Lesson convention (every lesson)
- A page `NN-name.html` holds the sidebar and the stage only; its code lives in `NN-name.js` (plus shared `lib/*.js`), never inline, so the viewer can show it.
- The page ends with `mountCodeView({ files: [...] })` (`lib/codeview.js`): a `‹›` button opens a drawer with **Key ideas** (cards of highlighted snippets) and **Full code** (whole file, syntax highlighted, line numbers, key lines tinted, comments on/off, copy).
- Mark key code in the source with `// @key Title | one-line explanation` ... `// @/key` (markers are hidden in the viewer). Keep each key block syntactically balanced; check with a quick parse of the file.
- The viewer's `⇩ html` button exports the page as ONE html file: markup, CSS and every JS module (three.js included) embedded, loaded through blob URLs, no bundler or esbuild. Lessons 00 and 01 then run by double-click (verified: no network requests). Lessons 02-04 also have `⇩ html + models`: the models/wasm/data listed in the page's `exportAssets` are embedded as gzip + base64 and unpacked into blob URLs at open (02 is ~32 MB, 04 ~58 MB; unpacking takes a few seconds). Big files must be reached through `assetUrl(path)` (`lib/assets.js`); fetch() of a relative path is also served from the embedded files.
- Verified for 02 and 04: the standalone export tracks a clip and fetches nothing from the server (only the film clip itself comes from the network). Not verified: opening from file:// (the test pane cannot), 03's export, the webcam path, Safari/Firefox.
- `tutorial-export.html` teaches this to students (modules, bundlers/esbuild, embedding, base64, blob URLs, file:// limits) with a live "what is inside" report.
- Comment as you go: a header line per file and per section, and the why of anything non-obvious.

## Done
- 00 `00-cube.html` + `cube.js`: the whole program (scene, camera, mesh, renderer, loop).
- 01 `01-anatomy.html`: scene graph, camera frustum + inset view, objects/groups, materials, light.

- 02 `02-body.html` + `lib/` (`tracker.js`, `body.js`, `bodyview.js`): MediaPipe pose/hands/face from webcam, Mediatheque clips (proxy.webm over CORS) or recorded JSON; `Body` with scene + world positions and smoothed velocity; image and world space; record to `data/` (format `body-frames/1`, documented in `lib/body.js`).
  - Findings: Sandow and the Marey athletes track; the Lumière serpentine dancer does not (the dress breaks the pose model). Hands and face only show up when the figure is large in frame (webcam). Webcam path not exercised in the headless pane.
- 03 `03-pinboard.html` + `lib/pinboard.js`, `lib/depth.js`: pin screen (instanced shafts + heads, pins slew toward targets) driven by the MediaPipe person mask and Depth Anything V2 small depth (transformers.js, int8, local from `vendor/depth`). Modes: subject (person raised by depth), scene, silhouette. `?device=wasm` forces the CPU path.
  - Findings: mask and depth both work on clips. Depth on WebGPU compiled in ~8 s and then stalled in the headless pane (software GPU), so WebGPU speed on a real machine is unverified; the wasm fallback runs at ~3 fps with the page blocked (onnxruntime's worker proxy hung on load). Depth is relative, not metres.

- 05 `05-laser-harp.html` + `lib/harp.js` (pure logic, 7 unit tests in `test/lessonHarp.test.js`), `lib/synth.js` (sustained Web Audio voice, scales), `lib/rig.js` (shared depth stage, also used by 04): after Jean-Michel Jarre's laser harp. Beams rise from emitters on the floor and fan out; a fingertip at the plane in depth (5 cm, 9 cm once held) and on a beam INTERRUPTS it: the beam is drawn only up to the hand, with a flare at the cut. The note is organ-like: it fades in over `attack`, sustains while held, fades out over `release`; the hand's height along the beam sweeps a resonant low-pass (exponential, 250 to 6500 Hz by default). Looks: UnrealBloom (threshold ~1, so only over-bright beam cores glow), dust haze lit near beams, floor pools, dimmed point-cloud room.
  - Tuning: default is 9 beams of D Dorian from D3 (a modal-minor reconstruction of the Rendez-Vous mood). NOT a transcription: searches found that Jarre's harp has about nine beams and foot pedals that change the scale between pieces, that it is used in Second Rendez-Vous (Part 3) and Oxygène VII, and that its sound is an Elka Synthex preset, but no published note list. The saw-pad voice (detuned saws plus sub through a sweeping filter) is a nod to that sound, not a copy.
  - Findings: on the Sandow clip the cut beam, flare, bloom and held notes (e.g. G3 at 84% height) work; I cannot hear the audio, so timbre and filter range are untuned by ear. Not tried with a webcam.

## Next, in order
02. **(done)** Body in the scene (MediaPipe Holistic, live + recorded). Landmarks (33 pose, 21 per hand, face mesh) as joints and bones in 3D. Sources: webcam, and clips from `languel/mediatheque` (the catalog marks items suited to pose with `--demo pose`; pose landmarks can be precomputed to JSON so the lecture needs no camera). Output: one `Body` object (named joints, velocities) that every later demo reads.
04. **(done)** Fusing depth with the body (`04-fusion.html`, `lib/fusion.js`). Anchor relative depth to the pose's world scale (hip/shoulder width) to get metres per pixel, so each joint has a depth-corrected z and the mask gives a surface to touch.
06. **Body Drum (Laurie Anderson, *Body Drum*).** No depth needed: world-landmark distances and speeds are enough.
   Original note for the drum: Body measurements (limb lengths, joint speed) and collisions (a hand meets torso/thigh, hand meets hand) trigger drum voices through Web Audio; each body zone has a pitch/timbre. Collision = distance between joint spheres under a threshold, with a refractory time. Scene shows hit zones lighting up.
07. **Triadic costumes (Oskar Schlemmer, *Triadisches Ballett*).** Geometric costume parts (spheres, cones, discs, spirals, tubes) parented to joints and scaled by measurements; a puppet rig that can also run from the live body.
08. **Unicursal line (Picasso).** One continuous line through a chosen joint set, drawn as a single tube/line in 3D; the line never lifts, and the body steers it.
09. **Ghostcatching (Bill T. Jones, OpenEndedGroup).** Hands, feet and head leave persistent paint marks (ribbons/strokes) in space; the viewer orbits the trace after the body has left.

## Open questions
- MediaPipe Tasks Vision (`@mediapipe/tasks-vision`) has separate Pose/Hand/Face landmarkers; "Holistic" in the legacy API is one model. Plan: use Tasks Vision's three landmarkers, vendored with their WASM and model files for offline use.
- Rights: record the source and licence of every mediatheque clip used, for later publishing.

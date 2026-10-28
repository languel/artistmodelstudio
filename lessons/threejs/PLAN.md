# Three.js for body and sound: series plan

Pages are plain static HTML + ES modules; three.js (r186) is vendored in `vendor/`, so a lecture works offline.
Serve with `python3 lessons/threejs/serve.py 5199` (static + saves recordings to `data/`). MediaPipe runtime and models (~35 MB, git-ignored): `lessons/threejs/fetch-mediapipe.sh`.

Every demo lives in one navigable scene (OrbitControls) so the body, the sound and the marks share a space the audience can walk around.

## Lesson convention (every lesson)
- A page `NN-name.html` holds the sidebar and the stage only; its code lives in `NN-name.js` (plus shared `lib/*.js`), never inline, so the viewer can show it.
- The page ends with `mountCodeView({ files: [...] })` (`lib/codeview.js`): a `‹›` button opens a drawer with **Key ideas** (cards of highlighted snippets) and **Full code** (whole file, syntax highlighted, line numbers, key lines tinted, comments on/off, copy).
- Mark key code in the source with `// @key Title | one-line explanation` ... `// @/key` (markers are hidden in the viewer). Keep each key block syntactically balanced; check with a quick parse of the file.
- Comment as you go: a header line per file and per section, and the why of anything non-obvious.

## Done
- 00 `00-cube.html` + `cube.js`: the whole program (scene, camera, mesh, renderer, loop).
- 01 `01-anatomy.html`: scene graph, camera frustum + inset view, objects/groups, materials, light.

- 02 `02-body.html` + `lib/` (`tracker.js`, `body.js`, `bodyview.js`): MediaPipe pose/hands/face from webcam, Mediatheque clips (proxy.webm over CORS) or recorded JSON; `Body` with scene + world positions and smoothed velocity; image and world space; record to `data/` (format `body-frames/1`, documented in `lib/body.js`).
  - Findings: Sandow and the Marey athletes track; the Lumière serpentine dancer does not (the dress breaks the pose model). Hands and face only show up when the figure is large in frame (webcam). Webcam path not exercised in the headless pane.
- 03 `03-pinboard.html` + `lib/pinboard.js`, `lib/depth.js`: pin screen (instanced shafts + heads, pins slew toward targets) driven by the MediaPipe person mask and Depth Anything V2 small depth (transformers.js, int8, local from `vendor/depth`). Modes: subject (person raised by depth), scene, silhouette. `?device=wasm` forces the CPU path.
  - Findings: mask and depth both work on clips. Depth on WebGPU compiled in ~8 s and then stalled in the headless pane (software GPU), so WebGPU speed on a real machine is unverified; the wasm fallback runs at ~3 fps with the page blocked (onnxruntime's worker proxy hung on load). Depth is relative, not metres.

## Next, in order
02. **(done)** Body in the scene (MediaPipe Holistic, live + recorded). Landmarks (33 pose, 21 per hand, face mesh) as joints and bones in 3D. Sources: webcam, and clips from `languel/mediatheque` (the catalog marks items suited to pose with `--demo pose`; pose landmarks can be precomputed to JSON so the lecture needs no camera). Output: one `Body` object (named joints, velocities) that every later demo reads.
04. **Fusing depth with the body.** Anchor relative depth to the pose's world scale (hip/shoulder width) to get metres per pixel, so each joint has a depth-corrected z and the mask gives a surface to touch.
05. **Body Drum (Laurie Anderson, *Body Drum*), then air instruments (laser harp in space).** Body measurements (limb lengths, joint speed) and collisions (a hand meets torso/thigh, hand meets hand) trigger drum voices through Web Audio; each body zone has a pitch/timbre. Collision = distance between joint spheres under a threshold, with a refractory time. Scene shows hit zones lighting up.
06. **Triadic costumes (Oskar Schlemmer, *Triadisches Ballett*).** Geometric costume parts (spheres, cones, discs, spirals, tubes) parented to joints and scaled by measurements; a puppet rig that can also run from the live body.
07. **Unicursal line (Picasso).** One continuous line through a chosen joint set, drawn as a single tube/line in 3D; the line never lifts, and the body steers it.
08. **Ghostcatching (Bill T. Jones, OpenEndedGroup).** Hands, feet and head leave persistent paint marks (ribbons/strokes) in space; the viewer orbits the trace after the body has left.

## Open questions
- MediaPipe Tasks Vision (`@mediapipe/tasks-vision`) has separate Pose/Hand/Face landmarkers; "Holistic" in the legacy API is one model. Plan: use Tasks Vision's three landmarkers, vendored with their WASM and model files for offline use.
- Rights: record the source and licence of every mediatheque clip used, for later publishing.

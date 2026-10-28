# Three.js for body and sound: series plan

Pages are plain static HTML + ES modules; three.js (r186) is vendored in `vendor/`, so a lecture works offline.
Serve with `python3 lessons/threejs/serve.py 5199` (static + saves recordings to `data/`). MediaPipe runtime and models (~35 MB, git-ignored): `lessons/threejs/fetch-mediapipe.sh`.

Every demo lives in one navigable scene (OrbitControls) so the body, the sound and the marks share a space the audience can walk around.

## Done
- 00 `00-cube.html` + `cube.js`: the whole program (scene, camera, mesh, renderer, loop).
- 01 `01-anatomy.html`: scene graph, camera frustum + inset view, objects/groups, materials, light.

- 02 `02-body.html` + `lib/` (`tracker.js`, `body.js`, `bodyview.js`): MediaPipe pose/hands/face from webcam, Mediatheque clips (proxy.webm over CORS) or recorded JSON; `Body` with scene + world positions and smoothed velocity; image and world space; record to `data/` (format `body-frames/1`, documented in `lib/body.js`).
  - Findings: Sandow and the Marey athletes track; the Lumière serpentine dancer does not (the dress breaks the pose model). Hands and face only show up when the figure is large in frame (webcam). Webcam path not exercised in the headless pane.

## Next, in order
2. **(done)** Body in the scene (MediaPipe Holistic, live + recorded). Landmarks (33 pose, 21 per hand, face mesh) as joints and bones in 3D. Sources: webcam, and clips from `languel/mediatheque` (the catalog marks items suited to pose with `--demo pose`; pose landmarks can be precomputed to JSON so the lecture needs no camera). Output: one `Body` object (named joints, velocities) that every later demo reads.
3. **Body Drum (Laurie Anderson, *Body Drum*).** Body measurements (limb lengths, joint speed) and collisions (a hand meets torso/thigh, hand meets hand) trigger drum voices through Web Audio; each body zone has a pitch/timbre. Collision = distance between joint spheres under a threshold, with a refractory time. Scene shows hit zones lighting up.
4. **Triadic costumes (Oskar Schlemmer, *Triadisches Ballett*).** Geometric costume parts (spheres, cones, discs, spirals, tubes) parented to joints and scaled by measurements; a puppet rig that can also run from the live body.
5. **Unicursal line (Picasso).** One continuous line through a chosen joint set, drawn as a single tube/line in 3D; the line never lifts, and the body steers it.
6. **Ghostcatching (Bill T. Jones, OpenEndedGroup).** Hands, feet and head leave persistent paint marks (ribbons/strokes) in space; the viewer orbits the trace after the body has left.

## Open questions
- MediaPipe Tasks Vision (`@mediapipe/tasks-vision`) has separate Pose/Hand/Face landmarkers; "Holistic" in the legacy API is one model. Plan: use Tasks Vision's three landmarkers, vendored with their WASM and model files for offline use.
- Rights: record the source and licence of every mediatheque clip used, for later publishing.

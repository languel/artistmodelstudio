# Explainers: how a script becomes a video (protocol, first run)

First run: the three.js lesson as an explainer (`examples/lessons/threejs/explainer.js`, 1 Nov 2026). Written so a model can
author the next one and a local model can run it. Each step below is what the first run actually needed.

## 1. Author the script (a capable model)

A script is data: `{ id, title, summary, lesson, cues: [...] }`. Cues run in order; `say` is the narration and the subtitle.

- **Targets are names, never coordinates.** `goto`, `restart`, `drag.on`, `draw.on`, `formula.on`, `set.on` name a board title.
  A slide is a frame (a board of kind `frame`); a cue `goto` to a frame shows that slide.
- **Code is selected by text.** `select: { code: '<board> · code', from, to }` picks the lines from the first line containing
  `from` to the first line containing `to`. Use text that appears once in the sketch (`crossFadeTo`, not `current.crossFadeTo`:
  the sketch may write `current?.crossFadeTo`).
- **Maths is drawn over the board.** `formula: { on, tex, at, align }` and `draw: { on, space, shapes }` (scriptDraw.js). Points
  are in the sketch's camera units when `space: { frame }` is given.
- **A control is changed as a person would.** `set: { on, name, value }`. The name is the control's variable in the sketch.
- **Narration sets the length.** Without narration a cue lasts for its `hold` or its reading time. With narration each cue lasts
  until its clip has finished.

Check the script before running it: every target must be a board the lesson builds. `test/explainer.test.js` does this for
the threejs explainer; copy it for the next one.

## 2. Prepare the lesson

- Lessons that need a file (a model, a picture) list it in `LESSON.models` (fetched once into Assets, kind `model`, shown as a
  card) or `LESSON.sources`. A sketch reads a file by name: `window.__amsFiles['Fox.glb']` (three.js) or `loadImage('x.jpg')`
  (p5.js). The page carries the same file as data.
- Set `LESSON_NEWEST` (workbench/lessons.js) to the newest board, so an open scene built from an older lesson is rebuilt.

## 3. Run it (the studio, or a local model)

- Studio: `app.script.play(id, { narrate: false })` is a quick check. It has no sound and no recording.
- Recording: `app.script.play(id, { record: {} })` records this tab. The browser asks for the tab, so a person must click.
  This is the one step a local model cannot do unattended.
- Export: `app.script.exportPage(id)` writes one HTML file that plays on its own, with narration as audio.

## 4. Check

- Play the export in the browser pane, read the console, and watch the slide trace: the slide changes at each `goto`,
  the subtitle matches the cue, and no error appears. The first run caught three real bugs this way: a missing bracket in
  `filesOf`, a glb that the thumbnailer tried to decode as an image, and a code anchor that did not match the sketch's text.
- Play it to the end once with narration on, so the length of each cue is known.

## Known limits (first run)

- **Size:** every three.js sketch in a page carries its own copy of the library (about 2.3 MB). The threejs explainer is
  15 MB. A shared copy is the next fix.
- **Asset fallback:** narration and models are kept in Assets; an export made before the clips exist plays with subtitles only.
- **Recording** needs a click to share the tab, and its crop to the stage is not yet checked in a real recording.
- **Dance:** Khronos's glTF samples have no dance clip under a licence we can check. The fox walks and runs (model CC0; rig and
  clips CC-BY, credited in the bibliography). A dancer is loaded the same way once one is found.

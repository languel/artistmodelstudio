# Films: lessons and explainers made with the camera system

A film is data in `examples/films/<name>.js`, built into a take on the Timeline (`src/workbench/film.js`), rendered frame by frame to an MP4 and a standalone page. Open one in the studio with the palette: `/film moon | silhouette | threejs | pointillism | condense` (add `render` to make the files; needs `npm run dev`).

## A film

`{ id, title, summary, credit, lesson, language, camera: { w, h }, cameras: [{ w, h, name }], fps, voice, boards, boardGap, beats }`. 16:9 (1920×1080) by default.

A beat is one thing on screen for a while: `board` (a title or id) or `rect`; `pose` / `to` (zoom and shifts, fractions of the board); `camera` (1, 2, … : cameras are made as needed); `cuts: [{ at: 0..1, camera, pose, to, board, rect }]` (more shots inside the beat); `say` (narration: Kokoro voices it, its length sets the beat), `caption`, `title` / `sub` / `titleDur`; `set: [{ board, name, from, to, at, over, ease }]` (a sketch control moved by keyframes); `code: { board, from, to, before, after, side, note }` (the board's code beside the picture, the lines lit; long lines wrap, nothing is cut); `chapter`; `dur`, `hold`, `overlap`.

`film.boards` brings sketches of its own (`kind: 'p5' | 'three'`). A p5 sketch that calls `noLoop()` redraws when a control changes, so a control declared `let p = 0 /* 0..1 */;` can be the sketch's whole timeline: everything on screen is a function of `p`, and a keyframed `p` plays it back exactly (the condense explainer is built this way).

## Outputs (exports/film/, git-ignored)

`<id>.mp4`, `<id>.html` (the film inside one page with captions and chapter buttons), `<id>.vtt`, `<id>.notes.md` (every beat with its start time, to write notes against), `<id>.take.json` (the take; voices stay in Assets › Narration). The dev server encodes with the machine's ffmpeg (`/__film/*` in `vite.config.js`).

Render from the studio tab on the dev server: `window.__ams`, `makeFilm(app, film, { width, height, crf })`. Don't edit src/, examples/ or docs/ while it runs (Vite reloads the page).

## Limits

A time-driven sketch (the moon) runs from the render's start, so its shots go first. Only `let` controls with a comment are keyframable. The standalone page is the rendered film, not the live studio. The scenes of the condense explainer are diagrams of the features, not recordings of the real UI.

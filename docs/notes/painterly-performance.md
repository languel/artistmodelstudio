# Painterly demo: where the time went, and what to turn

The *Painterly, fading strokes* demo (1300 to 2400 textured marks, redrawn 12 times a second, most of them
fading or drawing themselves on) was too heavy to be a live demo. This is what was measured, changed and found.
Method and code: `experiments/klee-painterly/` (`bench.html?live=1`, `?sweep=1`, `?prof=1`, `?store=1`).

## The loop, before

One frame of a live board is a **run** (the board's code, its marks into the store) and a **draw** (the canvas).
On Castle and Sun, 1460 marks, zoom 0.4 on a 2× screen: 33 ms a run and 44 ms a draw, **77 ms a frame**.

| where | cost |
|---|---|
| a draw: 87 marks *painted* each frame (a stroke drawing itself on was cut to a new path each frame, so its layer was new each frame) | 22 of the 44 ms |
| the layer cache: those layers stayed, 10 000 of them, and pushed useful ones out | thrash |
| zooming in (zoom 1.33 on a 2× screen): the working set no longer fit, every mark repainted every draw | **1.2 s a draw** |
| a run: the marks copied and normalized again after the code ran | 6 of 15 ms |
| a run: the demo's own code (model rebuilt each run, the source's blur redone, arrays of arrays) | 8 ms |
| a draw: 22 to 60 a second, every one a full draw, for marks that were only holding | wasted |

## What changed

- **Drawing on is a clip.** A textured mark is painted once, from its whole path; a stroke that draws itself on shows
  that layer through a strip along the part drawn so far (`revealClip` in `render.js`; the p5 export does the same).
  87 misses a frame became 10 (the marks born that frame).
- **A known layer is only blitted.** `txKnown` / `txBlit` (`texture.js`): once a mark has been painted, drawing it
  is a hash, a lookup and `drawImage`, without asking its brush (no walk, bounds or kit). About 3 µs a mark of
  JavaScript.
- **The cache keeps what is in use.** Layers carry a last-used stamp (no reordering), the least recently used go
  first, a layer of a mark long gone is given back after 20 s. If a layer that was in use had to go, layers are
  painted at a smaller share of the screen's pixels (quality 0.3 to 1), and grow back after calm frames (with backoff).
  A layer is at most 250 000 pixels. Zoom 1.33 on a 2× screen: 9 ms a frame, not 1.2 s.
- **Only what is on screen.** The canvas passes the view to the renderer; marks outside it are neither drawn nor painted.
- **Animation is throttled.** Marks that fade or draw on redraw at most 15 times a second and never use more than
  about a fifth of the main thread (a 10 ms draw waits 50 ms). Marks that only *stay* need no animation frame at all
  (`nextChange` in `envelope.js`): a board with no fades redraws once per run.
- **A run is cheap.** `runScript` no longer copies its own document before normalizing it (15 ms to 8.7 ms); the
  demo keeps the source's blurred layers until the source's picture changes, keeps its model in flat typed arrays and
  rebuilds it twice a second (new strokes go in at once), and emits its marks layer by layer in order (no sort). A run:
  **3.8 ms** (script 2.7, store 1). The store's part was never the problem (1 ms).
- **The demo's knobs** (sliders in its code): `density`, `detail`, `size`, `fade`, `drawOn`, `linger`, `tolerance`, `speed`, `stop`.
- **The board's performance line** (View → performance under boards, or a board's own switch) now reads
  `runs/s · code ms · d<draw ms> · marks · <layer cache MB>` (and `q0.5` when layers are being painted smaller to fit).

## After

Same loop: run 2.5 ms, draw 5.3 ms, **7.8 ms a frame** (from 77). In the app, one board live: a run 5 ms, a draw 5 to 9 ms,
the main thread **15% busy without fades, 25% with them** (this pane rasterizes in software; a GPU will do the blits
faster). Measured with the pane in front: a hidden pane is throttled and shows 5× worse.

## What to turn (Castle and Sun, 40 s, zoom 0.4 on a 2× screen, this pane)

Share = main thread at 12 runs a second and up to 30 draws a second when fading (a still board: one draw a run).

| setting | marks | run ms | draw ms | share | SSIM | error |
|---|---|---|---|---|---|---|
| default (4 layers) | 1293 | 3.8 | 9.0 | 31% | 0.43 | 26.0 |
| density 0.5 | 847 | 3.1 | 7.0 | 25% | 0.35 | 29.5 |
| density 0.25 | 478 | 2.1 | 3.2 | 12% | 0.26 | 32.5 |
| detail 3 (three layers) | 339 | 1.3 | 2.1 | 8% | 0.26 | 32.9 |
| detail 2 | 56 | 0.5 | 0.8 | 3% | 0.15 | 36.0 |
| detail 5 (a finer layer) | 2433 | 6.2 | 18.4 | 63% | 0.48 | 24.4 |
| size 1.5 (bigger brushes) | 738 | 2.4 | 6.5 | 22% | 0.31 | 31.3 |
| size 2 | 588 | 1.9 | 3.3 | 12% | 0.26 | 34.2 |
| fade 0, drawOn 0 (nothing animates) | 1293 | 3.6 | 7.8 | 14% | 0.46 | 24.8 |
| fade 0.5, drawOn 0.5 | 1293 | 3.4 | 6.0 | 22% | 0.45 | 25.2 |
| density 0.5, detail 3, size 1.5 | 202 | 1.1 | 1.7 | 6% | 0.17 | 36.3 |
| the same, nothing animating | 202 | 1.1 | 1.0 | 2% | 0.17 | 35.6 |
| chalk instead of oil | 1293 | 4.0 | 11.1 | 38% | 0.51 | 23.9 |

Reading it: cost follows the number of marks (about 8 µs a mark a draw here); the fine layers are most of the marks
and most of the fidelity. **Not animating is worth a half** and costs nothing in fidelity (the fade dims strokes a
little). For a demo that must stay light: `fade 0`, `drawOn 0`, `density 0.5` to `0.7`. For the best picture that still
runs: the default, no fades. `detail 5` is for a machine that can draw 2400 marks.

## Not done

- A draw still touches every mark. Marks that are not changing could be kept in a bitmap and only the changed
  region redrawn (dirty rectangles); the z-order (small strokes over big ones) makes it a real piece of work.
- The 30 µs of the cached path is about 3 µs now, but a mark's key is still hashed each frame (its points can change in
  place in the editor, so it is not kept).
- Takes (recordings) and the static p5 export still draw timed marks without a clock.

# Reference Fitter, continuous mode and p5 export

## Reference Fitter

`src/fitting/fitReference.js` approximates a target image with Core DSL shapes by greedy search, the idea behind Michael Fogleman's *primitive* (2016):

1. Try random shapes (rect, triangle, circle); for each, the best opaque colour is the coverage-weighted mean of the target under it.
2. Hill-climb the best one by small mutations.
3. Keep it if it lowers squared RGB error; repeat.

Geometry matches `FlatCanvasMedium`, so a fitted program renders the same in the studio.

**In the studio:** choose **Reference Fitter** as the engine and a reference in the **Reference** tab. The model menu is the shape budget (12 sketch · 40 abstraction · 120 study · 300 mosaic · 800 dense mosaic). Candidates A–D use mixed, rectangle, circle and triangle shapes. Refining a candidate continues fitting on top of it. Non-square references are letterboxed with their mean colour.

**Probe pages** (dev server): `/probe.html` compares fits with text-only baselines and flat vs watercolor at several budgets; results land in `fixtures/seeds/<set>/`.

## Continuous mode

`src/fitting/continuousFit.js` turns the fitter into an endless painting. The population holds about **Density** shapes and turns over once every **Cycle** seconds. Each new shape is fitted against the picture as it will look once that shape has faded in, so new shapes also make up for shapes that are fading away.

| Style | Behaviour |
| --- | --- |
| Strokes (default) | One shape per beat (beat = cycle ÷ density). Each lives exactly one cycle, so the oldest leaves as the newest arrives: a looping stroke-by-stroke time-lapse. Fade in / out last 1 + 20 × setting beats. |
| Fade | Lifetimes vary ±20% and each shape fades in and out over a share of its life, so many shapes are fading at once. |

**Render** (`src/fitting/continuousWatercolor.js`)

- **Flat** redraws every living shape each frame with its current opacity.
- **Watercolor** paints each stroke once with p5.brush on white and on black with the same seed (p5.brush output is deterministic per seed), recovers per-pixel opacity and colour, and caches the stroke as a sprite. Every frame draws the paper and each living sprite at its current opacity, so strokes fade in and out individually like flat. A new stroke costs ~33 ms; drawing is nearly free. Sprites are built newest first within a per-frame time budget; a stroke whose sprite arrives late starts its life when it appears (so it keeps its whole fade-in), and while sprites are queued the fitter holds back new strokes. On an M5 Max that caps watercolor at about 28 new strokes a second, so the most it can show is about 28 × cycle (≈140 at a 5 s cycle); longer cycles allow more. Flat has no such limit. **Pigment** (0–1) pulls the recovered colour, which p5.brush paints as a pale wash, toward the stroke's fitted colour while keeping the brush texture.
- **Watercolor, layered** paints each stroke once onto one sheet (~5 ms) and fades everything together under thin paper-coloured washes every half second; **Fade out** sets how much survives one cycle, and traces linger for several cycles. p5.brush holds a single drawing surface, so if anything else paints with it, the layer repaints the living shapes.

**Opacity** sets each stroke's strength at full life in every render.

**Fit** (Reference tab): how the reference is placed when its aspect differs from the canvas. *Cover* (default) crops to fill, so nothing outside the reference is sampled. *Contain* shows all of it: the padding is masked out of fitting and painting is clipped to the reference's area. *Stretch* distorts to fill. It applies to the Reference Fitter engine, continuous mode, the overlay and exports (live exports also have a Fit control).

**Ground**: *Transparent* (default) paints no ground; strokes fill the picture in. *Fixed* uses the reference's average colour, taken at Play and on every Clear. *Follow* re-takes it from each sampled frame (it can shift with live sources). *Drift* eases toward each frame's average over **Ground s** seconds, smoothing flicker and cuts into slow colour shifts (watercolor paper is repainted only when the colour has moved noticeably). The fitter always assumes the average colour internally. The layered watercolor keeps its paper, which is part of its painting.

**Live references** (`src/fitting/referenceSource.js`): choose **Webcam** in the reference menu, or upload a video (mp4, webm, mov) or an animated GIF / WebP / APNG (decoded frame by frame with `ImageDecoder`). The **Source** controls then set how continuous mode follows it:

| Sampling | Behaviour |
| --- | --- |
| Continuous | refit to every frame (live portraits) |
| Interval | take a new frame every *Interval* seconds |
| Hold | keep the current frame; the painting settles on it |

**Rate** changes video/animation playback speed independently of sampling (0 pauses). The fitter swaps in each sampled frame as its new target; the ground colour changes only with Ground *Follow*, and then only when the frame's average moves noticeably. The Reference Fitter engine, overlay and Reference aspect use the current frame.

**Overlay** shows the reference on the canvas: **Under** replaces the plain ground with the reference (at its own opacity), **Over** lays it on top for comparing, **Solo** shows it alone. It also works on the static preview. All drawing goes through `src/fitting/continuousScene.js`, shared with the export.

Fitting runs at 128 px; drawing is at full resolution. On *Senecio* at 150 shapes the displayed picture settles around pixel RMSE 12, about a static 150-shape fit.

**In the studio:** Reference tab → **Play** (**Clear** wipes the canvas and repaints from blank). While playing, the Density row reads *visible / requested* (e.g. `140 / 460`). Render, Style, Density, Cycle, Fade in, Fade out, Opacity, Pigment, Shapes and Overlay change the running painting live; typed values may go past the slider ranges.

## p5.js export

From the code editor's **p5.js** tab (any candidate) or **Export p5** in the Reference tab (continuous). Both download a zip that opens from disk:

- `index.html`, `sketch.js`, `p5.min.js` (p5.js 2.3.3, LGPL-2.1), `brush.js` (p5.brush 2.2.2, MIT), `README.md`.
- The studio's own rendering and fitting code is embedded verbatim (`watercolorBrush.js`, `fitReference.js`, `continuousFit.js`, `continuousWatercolor.js`, with import/export lines stripped), so exports match the studio.

Press **U** in an exported sketch for its control panel (bottom of the window; hover for key hints).

| Static sketch | Continuous sketch |
| --- | --- |
| R re-render · A animate · L loop · F fit/fill · W watercolor/flat · S save PNG | Panel mirrors the Reference tab controls, including the *visible / requested* density readout. Space pause · C clear · W render · M style · `[` `]` density · `,` `.` cycle · O overlay · F fit/fill · S save PNG |

Notes:

- Pixel programs replay frames pre-rendered by the studio's pixel medium.
- Invalid colours are skipped rather than stopping the sketch.
- `brush.js` defines globals `t` and `e`, and p5 defines globals such as `set`, so sketch code avoids those names at top level (tests guard this).
- Continuous exports embed the reference at the canvas aspect for the overlay, and start with the studio's settings at export time.
- Every continuous export has **Source** (Exported / Webcam / Upload…), **Aspect** (as exported, Source, or a ratio) and **Fit** in its panel, so the viewer can point it at their own camera or files; a new aspect starts the painting over. Still exports pack the original reference uncropped so aspect and fit can change; nothing else is packed unless it was the exported source.
- Live sources travel with continuous exports: a webcam export asks for the camera when opened (falling back to the frame captured at export); an uploaded video or animation is embedded in `sketch.js` as base64, because a media file loaded from disk would make the canvas unreadable to the fitter. The panel adds Sampling, Interval and Rate, and **H** toggles Hold.

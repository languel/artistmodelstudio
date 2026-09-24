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

**Render**

- **Flat** redraws every living shape each frame with its current opacity.
- **Watercolor** (`src/fitting/continuousWatercolor.js`) paints each stroke once with p5.brush as it lands (~5 ms) and fades old paint with a thin paper-coloured wash every half second. A full p5.brush repaint of 150 shapes takes about a second, too slow to redraw per frame. **Fade out** sets how much of a stroke survives one cycle. p5.brush holds a single drawing surface, so if anything else paints with it, the layer repaints the living shapes.

Fitting runs at 128 px; drawing is at full resolution. On *Senecio* at 150 shapes the displayed picture settles around pixel RMSE 12, about a static 150-shape fit.

**In the studio:** Reference tab → **Play continuous**. Render, Style, Density, Cycle, Fade in, Fade out and Shapes change the running painting live.

## p5.js export

From the code editor's **p5.js** tab (any candidate) or **Export p5** in the Reference tab (continuous). Both download a zip that opens from disk:

- `index.html`, `sketch.js`, `p5.min.js` (p5.js 2.3.3, LGPL-2.1), `brush.js` (p5.brush 2.2.2, MIT), `README.md`.
- The studio's own rendering and fitting code is embedded verbatim (`watercolorBrush.js`, `fitReference.js`, `continuousFit.js`, `continuousWatercolor.js`, with import/export lines stripped), so exports match the studio.

Press **U** in an exported sketch for its control panel (bottom of the window; hover for key hints).

| Static sketch | Continuous sketch |
| --- | --- |
| R re-render · A animate · L loop · F fit/fill · W watercolor/flat · S save PNG | Space pause · W watercolor/flat · M strokes/fade · `[` `]` density · `,` `.` cycle · F fit/fill · S save PNG |

Notes:

- Pixel programs replay frames pre-rendered by the studio's pixel medium.
- Invalid colours are skipped rather than stopping the sketch.
- `brush.js` defines globals `t` and `e`, so sketch code must not declare top-level variables with those names (a test guards this).

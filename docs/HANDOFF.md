# Handoff: 27 September 2026

Where Artist Model Studio stands, how the new parts fit together, and what is next. For the features themselves see [workbench.md](workbench.md); for agents, [mcp.md](mcp.md).

## State

Everything is on `main`. The tag `milestone-sculpt-params` marks the state before scenes and boards. There are 170 tests (`npx vitest run`). Always run `npm run build` before committing: quoting in the docs strings has broken the build before. The dev server is at `localhost:3017`.

In one session (26 Sep) these were added, in order:

1. **Sculpt tools** (after threegrease) as code: `src/process/sculpt.js`.
2. **Parameters as controls** in code: `src/process/controls.js` (the parser), `src/workbench/codeParams.js` (sliders on lines or beside the preview, Cmd-drag scrubbing), and the Opt+right-click popover in `src/workbench/toolParams.js`.
3. **The active brush** (B), brush slots, stroke and fill, and per-tool icons (`src/workbench/icons.js`: `brushIcon`, `sculptIcon`, captured icons).
4. **Boards** (`src/process/boards.js`).
   - The main board is the old artboard at the origin, and cannot move.
   - `e.board` is the board id; absent means the main board, `'_'` means the blackboard.
   - `boardDoc(doc, id)` gives one board as its own document (export, training).
5. **Board code**: `store.runBoardCode`, and the Code → Board mode (`panels/boardCode.js`).
6. **Pages**: `src/process/page.js`, one HTML file that carries the studio's renderer and the drawing, with replay and live sliders.
7. **Present** (Opt+Cmd+P) with eased camera moves; recording writes camera clips.
8. **Scenes**: `src/workbench/scenes.js`, with each scene's document in IndexedDB `ams-scenes` and the list in localStorage `ams_scenes_v1`. There is a Scenes panel.
9. **A minimal interface**:
   - Movable islands (`app.makeMovable`), `app.setUI` / `ams_ui`, Cmd+. to hide everything.
   - Shift+double-click renames in place (`editable()` / `editInPlace()` in `src/workbench/ui.js`).
10. **Lazy drawing and smooth plane closure**: `src/process/strokes.js`.
11. **Scores run into the active board** (`runScoreInto` in `src/process/script.js`) instead of replacing the drawing.

Then (26–27 Sep), the drawing and editing tools:

12. **Simplify live while drawing** (with Lazy and Smoothing): `lazy.simplify`, using `rdp` in `src/process/sculpt.js` (it handles closed paths). Curves are sampled by span length (`smoothPath` in `brushes.js`), so sparse points stay smooth.
13. **Path smooth or straight** per mark (`e.path = 'straight'`): `kitFor` in `brushes.js` swaps `smoothPath`. Double-tap CapsLock flips it (`canvasView.flipPath`).
14. **Point by point** drawing (`canvasView.startClickPath` / `clickPathClick` / `finishClickPath`), with lines that close themselves.
15. **Direct selection** (`tool 'direct'`, Shift+V; `canvasView.startDirect`, `insertPointAt`, `deletePoints`).
16. **Snapping:**
    - Ctrl while drawing, moving and scaling, through `canvasView.snapTarget`.
    - Modes in `grid.snapMode`: `points`, `increments`, `objects`.
    - The Snap operation: `store.snapMarks`, `ams_snap`.
17. **Tool settings popovers** on right-click (`openToolDefaults` in `toolParams.js`); **Pen** brush; Ink width smoothed along the line.
18. **Selection export:**
    - Copy or Add to Assets as SVG, PNG or p5 code (`app.selectionDoc`).
    - **Minimal p5**: `src/process/p5min.js`, for p5 2.x by default (`app.p5Version()`, Settings → Export).
    - **Board p5 sketches** are standalone: the recorded board with its brushes (`toP5` normalizes in `setup`).
19. **Workspace:**
    - Background and transparency (`app.setBackground`, slash commands in `palette.js`).
    - The single-file build (`vite.single.config.js`, `npm run build:single`).
    - Tab reordering (`dock.reorder`), movable islands, a performance readout (`app.togglePerf`).

Then (27 Sep), **sources** (streams), bringing back the classic reference work as code:

20. **Sources:** project-wide, by name.
    - `src/workbench/sources.js` (`app.sources`): the list in localStorage `ams_sources_v1`; media from Assets or the camera through the classic `LiveSource` and `SourceSampler`; a 256 px sampled frame.
    - `src/process/streams.js`: `getSource(name, rect)` samplers for pure code, `streamState` for processes that keep state between runs, and `readRecently`.
    - Landmarks: `detectRaw` in `src/perception/mediapipe.js` (pose, hands, mask).
21. **In code:**
    - `source(name)` and `fit(source, opts)` in scores; `fit` is in `src/process/fit.js`, over `ReferenceFitter`.
    - `k.source(name)` in the brush and sculpt kits; `env.board` is the mark's board rect.
22. **Following:**
    - `board.follow` re-runs a board's code on new frames of the sources it reads (`app.followSources`, throttled by run time).
    - Live runs are `transient` changes: no undo step, no log.
    - `board.source` shows a source under a board (`app.drawReference`).
23. **UI and agents:** the Sources panel (`panels/sources.js`) and `ams_source`.
24. **Live and paused boards:**
    - `app.isBoardLive`: the board you are on, or `board.live`. `app.isBoardActive` adds "on screen".
    - Paused boards are baked by `canvasView.drawBaked`, a per-board picture at a half-octave zoom. A live redraw drops only its own board's picture (`store.lastLiveBoard`); any other change drops them all.
    - `sources.wanted` pauses sampling.
    - `getSource(…, { peek })`: frozen renders don't keep sources awake.
25. **Bake to image:** `app.bakeMarks(ids, { rect })` and `app.bakeBoard(id)` make one image mark with `e.bake` provenance, in one undo step.
26. **Fixes:** autosave is throttled (a live board starved the debounce) and flushed on `pagehide`; video assets; large GIFs; MediaPipe video mode for streams.
27. **Live redraws are quiet:** store listeners get transient changes only with `subscribe(fn, { live: true })` (the canvas, autosave). Panels no longer rebuild under the pointer.
28. **p5 for teaching:** `p5min` writes long runs as data and a loop; `src/process/p5code.js` (`toP5Code`) exports a board's own code as p5 (Export → p5 (its code), `ams_get p5code`, `app.p5CodeFor`). p5 2.x has no `preload()`: files load with `await` in an async `setup()`.
29. **The sampling lesson:** `examples/lessons/sampling/` (lesson as data, PD media), the scene “Lesson: Pointillism and Expressionism, by sampling”, a tour take in Assets, `scripts/lesson-sampling-p5.mjs` and `scripts/lesson-sampling-report.mjs`.

## How the model fits

```
project (shared: Assets, brush & sculpt libraries, settings)
└─ scene = one process document (own undo, History, Timeline)
   ├─ boards: main (artboard at 0,0) + doc.boards[] {id, title, x, y, width, height, ground, text?, code?, follow?, source?}
   ├─ blackboard: marks with board '_'
   ├─ stages, marks (points [x, y, t, pressure]; pressure may exceed 1 after Thicken)
   └─ meta.intro (page intro), train (the board models learn from)
```

- **Scores:** `board('Title')` switches or creates a board, with fractions relative to that board. `artboard(w, h)` sizes the board the score runs into.
- **Agents** have the same reach through `ams_scene`, `ams_board` (including code), `ams_page`, `ams_ui`, `ams_active_brush`, and a `board` option on `ams_add`, `ams_get`, `ams_snapshot` and `ams_process_sheet`.

## Checks you can rerun

- `npx vite-node scripts/senecio-report-scene.mjs` writes `exports/senecio-runs/report-scene.html`: the Senecio run report as 9 boards.
- `npx vite-node scripts/point-line-plane-demo.mjs` writes `exports/demos/point-line-plane.html`: a lecture with live code.
- `exports/` is ignored by git.

## Next (agreed, not built)

- **Curve and SVG optimization filters:** like Simplify, but for SVG output. Hatching and stipple make huge SVGs, which is why pages embed the renderer instead.
- **A modifier stack per mark:** non-destructive, with Apply; the idea is borrowed from underscores' `evaluateModifierStack`.
- **Richer range comments:** colors, choices, switches. The aim is every value in code as a live control.
- **Group frames** (Excalidraw-style), and per-board grid and snapping.
- **Cameras separate from boards**, and sequencing scenes (use case 3: a lecture of chapters).
- **Performance:** effects, and an AI drawing jam. The tools exist: `ams_active_brush`, board keys, slots.
- **A rendering cache per mark:** redraws only what changed. The readout shows about 20 ms per redraw for about 20 heavy marks.
- **Direct selection handles** (Bézier-style tangents) if Catmull-Rom proves too limiting.
- **Construction brushes selectable** for the gesture and guide tools (they draw with the built-in `guide` brush, which is already code).

- **Streams, next:**
  - More kinds: model outputs as streams (depth, edges, segments by class), audio, and data over MCP.
  - Sources as *modifiers*: a sculpt or a stack step driven by a stream (points pulled toward pose landmarks, for example).
  - Redraw strategies beyond shape fitting: the classic contour and hatching redraws as `fit` variants.
  - A source in exported p5 sketches (`createCapture`).

## Open questions

- Walkthrough and study scripts may still assume a single artboard. Check them when touching boards.

## Conventions the user asked for

- Live boards run only while on screen: keep it.
- Pedagogical demos favor few, simple, smooth curves (use Simplify), not dense point lists.
- p5 exports stay minimal and clean (no extra UI); many points go in a data array with a loop, not long `vertex` lists.

- **Interface:**
  - Minimal chrome: icons over text labels, panels opened as needed, right-click and Opt+right-click for properties.
  - No explanatory text in the visible interface; explanations go in hover tips and the docs.
  - One slider look (`rangeInput`).
- **Everything as code:** brushes, sculpt tools, board code and more are forkable code, and agents can reach everything through MCP.
- **Names:** project > scene > board > stage and marks.
- **Commits:** gated on the build and tests. Commit and push when the user asks. The end-of-work reports went out as artifacts.

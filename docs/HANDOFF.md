# Handoff: 30 September 2026

Where Artist Model Studio stands, how the new parts fit together, and what is next. For the features themselves see [workbench.md](workbench.md); for agents, [mcp.md](mcp.md).

## State

Everything is on `main`. The tag `milestone-sculpt-params` marks the state before scenes and boards. There are 200 tests (`npx vitest run`). Always run `npm run build` before committing: quoting in the docs strings has broken the build before. The dev server is at `localhost:3017`.

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
30. **ml5.js and brushes in p5 exports; memory and saving:**
    - `toP5Code` loads ml5 models for the landmarks the code reads, only for the sources that read them, and keeps custom brushes as functions with a small kit.
    - Undo is capped by memory (`trimPast`). Baked pictures are let go off screen.
    - The open scene persists to IndexedDB (`scenes.persist`, `restoreNewer`); localStorage is used only when the drawing fits.
    - The performance readout shows the browser's fps and canvas redraws.
    - Animated sources detect each frame with the full pose model; video mode kept only for video and cameras. MediaPipe still misses some Muybridge frames, where ml5's BlazePose does better.

31. **How we see:** the lesson opens with five diagrams drawn by board code, with notes as labels (dark ground). p5 notes keep size, color, font and width. The lesson report uses the studio's dark theme.
32. **Play and pause:** `board.paused` (explicit, wins over being the active board) and `board.live` (runs elsewhere). `app.toggleBoardRun` backs the canvas title button (`canvasView.runButtons`, any tool), the Boards panel and the board menu.

33. **Idle in the background:** `sources.tick` does nothing while `document.hidden`. Landmark requests expire 2 s after code last read them (`e.want` holds times). A detection that never returns is given up after 5 s. Before this, a pinned source kept MediaPipe running 3 times a second in a hidden pane for hours.

34. **Flight recorder** (`src/workbench/diagnostics.js`): every 2 s one line (visibility, frames given to the page, redraws, heap, samples, detections, live runs, lag, long tasks), plus page events. Kept in localStorage `ams_flight_v1` for 30 min. Read it with `window.ams.diagnostics()` or `ams_diagnostics`. Found on 27 Sep: a pane freeze showed the studio tab as visible but given 0 frames. Re-selecting the tab brought it back, and a fresh tab in the pane ran at 120 fps.

35. **Parts** (`src/process/parts.js`): `scenePart`, `boardPart` and `selectionPart` write `.ams.json` with `meta.part`. `importPart` brings any of them into the open scene (new boards, or a group at a point; stages matched by name, new ids). The app wires it through the board and selection menus, *Import into this scene…*, *Import here…*, drag and drop, and paste.

36. **GitHub Pages:** `.github/workflows/pages.yml` runs on every push to `main`: test, build with `BASE_PATH=/<repo>/` (`vite.config.js` `base`), deploy. Live at https://languel.github.io/artistmodelstudio/ (public, though the repo is private). The dev-server features (the `/__ams` relay, probe saving, the Decide proxy) and cross-origin isolation are not available there.

37. **Document and program boards:** `board.kind` is `drawing`, `markdown`, `html` or `p5`, and `board.code` is its source.
    - `src/process/markdown.js`: the Obsidian-flavored renderer (marked, KaTeX, Mermaid on demand, callouts, wikilinks, embeds, sanitized HTML). `md()` for Docs and pages wraps it.
    - `src/workbench/boardFrames.js`: the DOM layer over the canvas, drawn through `canvas.onDrawn`. HTML and p5 run in sandboxed srcdoc frames with a token-checked postMessage bridge, `window.ams`. p5 is inlined: a sandboxed frame cannot fetch it.
    - The code editor switches language (`setLanguage`); Code → Board has a kind selector.
38. **Console:** `src/workbench/console.js`, the `!` lines in the Assistant.
39. **The lesson as a scene:** `examples/lessons/sampling/scene.js`, `/lesson sampling`. It uses `app.runScript`: after a dev-server reload, a separately imported module has no sources.

40. **Pages as lessons:** `src/process/page.js` in the studio's dark theme. It:
    - follows reading order;
    - renders boards by kind, with Markdown documents and notes attached ("… · notes");
    - samples sources in the page, and runs following boards;
    - runs p5 and HTML boards in sandboxed frames.

    `app.pageHtml()` gathers the media, embed pictures and p5.js. The runtime adds `streams.js`, and `fit.js` with the fitter in its own scope. GIFs need `await dec.tracks.ready` before `frameCount`.

41. **Frames and fits:**
    - `kind: 'frame'` boards are slides (`boardsInFrame`, `slidesOf`, `frameOf` in `boards.js`). They carry their boards when dragged, present in order, make their boards live together, nest in the Boards panel, and export as side-by-side rows.
    - `source(name, { fit: 'contain' })` letterboxes (studio, page and p5), and `board.sourceFit` does the same for underlays.
    - p5 frames get an in-memory `localStorage` (ml5 and tfjs need one in a sandbox) and load ml5 from the CDN when the code uses it.
    - p5.js loads as raw text (`?raw`): the dev server's transformed copy was 5 MB.
    - The dev server ignores `exports/`, because writing there reloaded the studio.
    - Lesson builders wait for `sources.whenReady()`.

42. **Pages, code and the lesson report:** each board's code on a page is one box with tabs (Pseudocode, Studio, p5.js) and Copy (`codeBox` in `page.js`; boards keep `pseudo`). The run control is a small glyph under the picture. The sampling report (`scripts/lesson-sampling-report.mjs`) regenerates from the current lesson (4:3 pictures, the walk fitted whole, section 0's code folded, Studio first).
43. **Gestures** (`src/process/gestures.js`, `src/workbench/gestures.js`, the Gestures panel): `gesture(name, steps, action)` over named body points (`bodyFrom`: pose and hands matched to the person's own sides, in body units), sequences with `hold`, `within` and `cooldown`, learned poses (nearest examples), actions (`color next`, `undo`, `board next`, `!console`…). `source().point()` and `.fired()` reach board code. Only the pose and hands models feed it; a face model is the next step.
44. **Sources are streams, routing lives with what uses them:** the Sources panel lists sources with sampling and speed (`def.speed`, `def.volume`). A source can be dragged onto the canvas or double-clicked in Assets: `placeSource` / `previewAsset` make a preview board and, for a clip or GIF, a **player** board (`kind: 'player'`, `board.source`; `refreshPlayer` in `boardFrames.js`). `app.mediaState` and `app.mediaAct` are the one set of controls behind the player and the Media section of Properties (play, steps, seek, speed, mute, volume). A movie waits on its first frame, a GIF plays, clips are muted. The source's opacity, blend and fit under a board are `sourceOpacity`, `sourceBlend`, `sourceFit`.
45. **Demos** (`src/workbench/sourceDemos.js`, the board menu → *Draw from a source*): ordinary followed code, none special. `state(name)` in studio code keeps an object between runs. *Fit shapes, in code* writes the fitter out.
46. **Redraw rate:** `board.rate` runs a following board on its own clock (up to 60 a second, fresh seed each run, live fits keep going: `advance`), separate from the source's speed. Boards without a rate run once per new source frame.
47. **`fit()` in a worker** (`src/fitting/fit.worker.js`, `fitCore.js`, `process/fit.js`): the board shows its last fit while the next is made, and falls back to fitting in place where workers cannot start (single-file builds from disk, tests, exported pages). `quality: 'fine' | 'fast'`; `fast` is the p5 export's fitter. `ReferenceFitter` computes coverage (no canvas).
48. **p5 export bridge:** `fit()`, `state()` and `source().pixels()` are carried; GIFs play at their own timing and draw only on new frames (or at the board's rate, reseeded per frame); a canvas of another size is fitted whole and `createCanvas` follows the board's size.
49. **Board switches:** `locked`, `hidden`, `hideLabel`, `perf` (`BOARD_FLAGS` in `boards.js`, `app.setBoardFlag`) as glyphs in Properties → Board and the board menu. Hidden boards are not drawn, run or exported; a hidden player leaves no trace. The performance line under a board (`app.boardPerfText`, View → Performance under boards, or a board's own switch) is measured only while shown.
50. **Stock samples:** Assets › Samples and Test clips (`assetStore.seedClips`): the countdown clips (frame numbers, to see real update rates), the Muybridge horse (tracked), and the rest kept out of the repository in `examples/media/local/` with `samples.json` (sources and licences; two are CC BY-SA). Videos are H.264 MP4.
51. **Cmd/Ctrl+click** anywhere in a board selects it and opens Properties; page boards let clicks through while the key is held (`.wb-frames.mod`).

52. **Media in scenes:** clips and GIFs drag from Assets (or double-click) to a source, a preview board and **media controls** under it (a board switch, `board.controls`, drawn by `refreshPlayer` in `boardFrames.js`): play, steps, timeline, speed, loop or stop, in and out points, mute and volume (muted by default; the sound track is read from the clip's stream). Properties mirrors them (`app.mediaState`, `app.mediaAct`). A movie waits on its first frame, a GIF plays.
53. **Streams:** `resolveMediaUrl` (`mediaUrl.js`) turns a URL or a Wikipedia / Commons `File:` page into the file (licence and author from the wiki API); wiki videos use a smaller derivative (240 / 480 / 1080 / original; WebM or MP4 only). Sources of kind `url` are streamed, never stored; `lazy` ones start when a live board shows them big enough (`sources.lazyWanted`) and close after 30 s unseen. `streamSamples.js` lists clips (Metropolis, Vertov, Edison, Lumière, Méliès, dance, Ruttmann, Duchamp, Chaplin, Keaton), some cut to a moment (`start`, `end` become the in and out points). They are also assets (kind `stream`, Assets › Streams: a reference of ~100 bytes). `/samples` builds a scene of them and the stock samples.
54. **Asset properties:** selecting an asset shows its title, folder, tags, rating, a stream's address, size and range, and **Starts with** defaults (speed, loop, volume, underlay opacity, blend, fit) that a dragged-in source gets (`applyAssetDefaults`). `assetStore.update` is queued.
55. **Trackers** (`perception/mediapipe.js` registry: pose, hands, face, mask; `registerTracker` adds one): `source().face` (478 points, expression scores and blends), `.track(kind)`; gesture conditions `expr`; the *Face and expressions* demo; `underlay({ source, opacity, blend, fit })` in board code. Note: `docs/notes/accidental-art-unicursal-faces.md` (the kiss drawn as one-line faces; revisit with ~/dev/sketchcam).
56. **Board switches and groups:** `locked`, `hidden`, `hideLabel`, `perf`, `controls`; Shift+click titles or a box select boards as a group (`canvas.boardSet`), and dragging one moves the group with its marks; Opt+click a play button solos a board; Cmd+click anywhere in a board opens its Properties; *Create board from selection*.
57. **Boards as sources and playlists:** *Use as a source* (`boardSource.js`: a board's picture, live and small, read by name). Playlist boards (`kind: 'playlist'`; `process/playlist.js` reads and writes the code, `workbench/playlists.js` plays it): media items are routed to a target board, board items run alone, each ends at its range or after `for` seconds; the board has its own controls and a **+** menu, and the code and the controls edit the same text.

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

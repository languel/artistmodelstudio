# Handoff: 1 October 2026

Where Artist Model Studio stands, how the new parts fit together, and what is next. For the features themselves see [workbench.md](workbench.md); for agents, [mcp.md](mcp.md).

## State

Everything is on `main`. The tag `milestone-sculpt-params` marks the state before scenes and boards. There are 257 tests (`npx vitest run`). Always run `npm run build` before committing: quoting in the docs strings has broken the build before. The dev server is at `localhost:3017`.

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
   - Movable islands (`app.makeMovable`), `app.setUI` / `ams_ui`, Alt+Z / Cmd+. (zen) to hide everything; one paint picker popup with Fields/Disc/Cube modes (`openPaintPicker`, Ctrl+right-click or the toolbar swatches); Ctrl+Shift+right-click = grid menu; board `hideLabel`/`hideBorder`; Opt+right-click on a board = `openBoardParams`.
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

58. **Time envelopes** (`process/envelope.js`): a mark can carry `time: { in, hold, out, life, draw, curve, loop }` (seconds) and `born` (epoch ms). `renderDocument(…, { now })` fades it by its age, draws its stroke on (`cutPath`), drops it after its life; `timedActive` keeps the canvas redrawing until nothing changes. Brushes read `k.age`. Callers that want a still of a live picture pass `now: Date.now()` (snapshot, bake, board sources do); the p5 exports and takes do not yet.
59. **Textured brushes** (`process/texture.js`, embedded in exports): a mark is painted white into a cached layer (world units, `ppu` in half-octave steps, cap 2048 px, 96 MB LRU), the paper's grain (`paper | canvas | fibre | noise`, anchored to the world) is multiplied in, and it is tinted. Kit: `k.paint / dabs / hairs / wash / bounds / hash / grain`. Brushes: charcoal, chalk, pencil, bristles, **oil** (packed hairs, streaks, taper, ragged ends), marker, wash. The layer cache survives a lost canvas context (`txReady`: nothing is painted while contexts are lost, then everything kept is dropped) and gives evicted canvases back; the canvas view repaints on `contextrestored`. We saw the browser pane lose every canvas at once after ~40 s of heavy painting.
60. **Painterly, fading strokes** (board menu → Draw from a source; `sourceDemos.js`, id `paint`): plain board code, after Hertzmann. Four layers, each seeing the source blurred as much as its brush is broad (`s.pixels(64, …)` on a grid); a coarse model of the live strokes (weighted by their envelope); each layer looks at blocks the size of its brush and starts a stroke at the worst place of a block that differs and that the layer has not painted itself (`own` coverage); the first layer always paints; the paper is toned to the source's mean (`memo.ground`, a plane under the strokes); `state('paint')` keeps strokes so `born` and `seed` are stable and the layer cache hits. Four earlier versions failed in instructive ways (see `exports/klee-painterly/report.html`, *How it got here*): worst-cell placement stacks strokes on the hardest zones; blocks without own coverage repaint the same blocks; without a toned paper and an always-on underpainting quality decays as strokes fade.
61. **AMS → p5.js for our brushes** (`p5code.js`): a board's code exported as a sketch carries the studio's textured brushes it names (`brushSource(id)`, flagged `texture: true`), the walk (`walk.js`: `smoothPath`, `walkFrames`, split out of `brushes.js` and embedded with it in exports, pages and takes), the layer kit (`texture.js`) and time envelopes (`envelope.js`: `fade`, `drawn`, expired marks skipped), each in an IIFE so the sketch's globals stay clean; `useBrush` seeds a rng per mark. A still picture's pixels are read once and an empty read is not kept (a browser can drop canvases; the sketch then painted every stroke black). Round trip to studio code unchanged. Sample: `exports/klee-painterly/p5-sketch/`. Live, the p5 boards match the AMS ones in look and in number.
62. **The Klee experiment and report:** `experiments/klee-painterly/` (harness: simulated clock and seeded random, snapshots and metrics: error, SSIM, covered; `receiver.py` saves to `exports/klee-painterly/`, which is git-ignored) and `scripts/klee-painterly-report.mjs` (builds the report as a drawing with boards, `report.html` and a document the studio opens as a scene). Findings: stable for 60 s; about a 24×24 mosaic in fidelity; chalk and bristles beat oil and charcoal on faithfulness; tolerance barely matters; a fifth layer +0.06 SSIM for double the marks. Scenes in the pane: *Klee · AMS (painterly, only AMS)*, *Klee · p5 (same sources, our brushes in p5)*, and the report scene.

63. **Performance of textured, timed marks** (details and numbers: `docs/notes/painterly-performance.md`; bench: `experiments/klee-painterly/bench.html`): a textured mark's layer is painted once and blitted (`txKnown` / `txBlit`, `drawTextured` in `render.js`); drawing on is a clip (`revealClip`, also in the p5 export); the cache keeps last-used stamps, sweeps layers of long-gone marks, caps a layer at 250 000 px and paints smaller (`txQuality`) when layers in use had to go; `renderDocument({ view })` skips marks outside the view; timed animation redraws at most 15 times a second and only while something moves (`nextChange`, `nextTimed`); `runScript` no longer copies its own document (`normalizeDocument(doc, { own: true })`); the demo caches the source's blurred layers by `s.frame`, keeps flat typed arrays, rebuilds its model twice a second. Frame (run + draw) 77 ms to 7.8 ms; in the app the main thread is 15% (no fades) to 25% busy with one board live, pane in front (a hidden pane is throttled). Demo sliders: `density`, `detail`, `size`, `fade`, `drawOn`. The board's perf line shows `d<draw ms>` and the layer cache (`MB`, `q` when painted smaller). Boards have a `mask` switch (`BOARD_FLAGS`; Properties glyph, board menu, `mask()` in code): `renderDocument` crops the board's marks to its rectangle, clipping only marks that reach over the edge; unmasked, everything may spill (the default). Masks of other shapes, of assets and of sources are the next step. Scene *Klee · playlist (one painting at a time)*: a playlist board runs each painting board alone (press play; its `for` is 60 s).

64. **Masks and effects** (opt-in; `docs/workbench.md` → *Masks and effects*): `process/fx.js` (pure: a stack of effects, point effects compiled to lookup tables, `toMask`), `workbench/masks.js` (`Composer`: composes a board that has `maskWith` / `fx` into a canvas of its own: paper, source with `sourceFx`, marks, `fx`, kept apart from the masked picture; masks from a source's view or from another board composed transparent, with their own `fx`, `feather`, `res`; caches by a per-board signature of its marks, the source's `sources.stamp(name)`, and the specs; fails open when a mask is missing; cycles cut at depth 3), `panels/fxEditor.js` (the stack editor), Properties → Mask / Effects / Source effects, board menu → Mask / Effects, selection → **Make mask** (`app.makeMask`: marks move to `<board> · mask`, the target gets `maskWith { board, mode: 'alpha' }`). Board fields: `maskWith`, `fx`, `sourceFx` (beside the `mask` rectangle-crop switch); code: `mask(true | false | { … })`, `fx([…])`, `underlay({ fx })`; agents: `ams_board update` patches, `ams_vocabulary` lists the effects. The canvas draws composed boards after the rest (`drawComposed`, `composedIds` skip their paper, underlay, baked picture and marks; outlines are drawn separately); board-as-source (`boardSource.js`) and PNG export / clipboard use the composer; a mask source counts as *wanted* and invalidates the canvas on its frames. Costs: unchanged composed board 0.01 ms; live clip as mask with threshold, blur and gradient map, 4 ms a frame (13% of the main thread here). Not yet: document / sketch / player boards, SVG / p5 / page pictures, masks on single marks or assets on a board (put them on a board and mask the board), GPU effects.
65. **Scenes as files** (`exports/scenes/`, git-ignored; its `README.md` says what each is): the lesson (studio and p5.js), the *Draw from a source* demos (studio and p5.js), and the Klee scenes (studio, p5.js, playlist, report) as `.ams.json` scenes, with `sources.json` and `media/` for the named sources they read (add each source under its name, then *Import into this scene…*). The lesson report has three pages: `report.html` (tabs), `report-studio.html`, `report-p5.html` (`scripts/lesson-sampling-report.mjs [both] [studio] [p5]`). The lesson scenes come from `/lesson sampling` and `/lesson sampling p5`. In them the boards inside frames have `hideLabel` (their play button stays: a hidden title no longer hides ▶), and the *How we see* boards have `codeMin`: a new board switch (`BOARD_FLAGS`) that makes a page's code box start as a bar of tabs; a click on the open tab minimizes any box (`page.js`, and the report script's own copy of it).

66. **Scores that play** (23 Oct 2026; design and decisions: `docs/notes/paths-travelers-triggers.md`; user docs: Docs → Scores → *Scores that play*). A mark with `play` runs on the Timeline: a **path** (a line), a **traveler** (a point running a path), **triggers** (planes, points, lines; `emit` is code), **bodies** (a gas). Pure kernel in `src/score/`: `paths.js`, `travel.js` (local time as in Underscores), `regions.js` (swept detection), `world.js` (events enter, exit, cross, end, arrive, collide; latched/pair/every; gate, lockout; `launch`, `arrive`, `spawn`, `effect`; bodies on a fixed 1/120 s step with a grid; `seek` replays bodies silently), `compile.js` (marks → world; times read as times; `emit` as expression or statements), `music.js` (note, cc, route…, voice tracker), `scale.js` (the 32 Midinous scales), `runner.js` (looks 0.12 s ahead of the playhead; rebuilds on seeks and edits; `renderScore` renders ahead of time), `outputs/` (`gm.js`: TinySynth over jzz + jzz-synth-tiny, loaded on first play; `webmidi.js`; log), `midifile.js`, `import/iannix.js` and `import/nous.js` (write AMS score code; `/iannix`, `/nous`, `app.importIannix` / `importNous` → a new board whose own code is the score). Studio side: `workbench/scorePlayer.js` (listens to `app.player`, owns sound prefs `ams_sound_v1`, applies effects as live marks), `scoreOverlay.js` (travelers, bodies and lit triggers over the canvas), Settings → Sound, `/midi`, `ams_score` (events, import, settings, sound, export). **One transport:** the Timeline's playhead (`app.player`, `TakePlayer`) now plays without a take; tempo, signature, fps, ruler (time / beats / frames) and loop range are the scene's (`doc.transport`, `src/time/`, the Underscores helpers ported with their tests); Shift-drag the ruler marks a loop; the playhead also ticks from a timer, so it and the sound keep going where animation frames stop (the browser pane gives none). The score is whatever drawing the playhead shows (`canvas.previewDoc` during a take). Not done: Properties editor for `play` (it is code: Code → Selection), recording a performance's events into a take (replays work because the marks are in the take), `.iannix` export, p5 export of scores, Midinous gates and logic paths, IanniX cursor messages and OSC, continuous (glissando) voices, a global Space shortcut, envelopes still read the wall clock.
    - **Authoring** (24 Oct): Properties → Play (`panels/playSection.js`; pure parts in `process/playparts.js`): chips for path / traveler / trigger / body, a traveler's Path as an *object field* (`workbench/objectPicker.js`: a name or id, a datalist, and an **eyedropper**: `canvas.startPick({ accept, onPick })`, hit-tested with `hitTest(x, y, accept)`), time fields read as times, sound presets (`score/presets.js`: settings in a comment on the code's first line; `readPreset` gives them back only while the code is exactly what they would write, else "custom"), the emit code box. **Names:** the mark's `label` (Name row; Outliner renames it too), id when unnamed; `travel.on`, `trigger` ids and routes resolve ids and labels. **Markers are brushes:** `traveler`, `path`, `trigger` (plane / point / line), `body` in `brushes.js`; a mark that plays gets its marker unless it has a brush of its own (`realizeAfter`); score code does the same (`markerFor`). `app.scoreView.names` (View: the tag button) draws names and traveler→path links (`scoreOverlay.annotate`). Next, by choice later: midinojs-style glyphs and score tools, context-menu verbs, Score panel, stage = voice.
66. **The diffusion lecture:** `/lesson diffusion` (`examples/lessons/diffusion/lesson.js`, built by the sampling lesson's `buildLessonScene(app, { lesson })`, which now takes any lesson: `main`, `sources`, `bibliography` columns with `page` and `width`, boards with `p5`). Six studio-code diagrams, five p5 simulations with exact scores (see `docs/workbench.md` → *Diffusion models*), two frames of bibliography (arXiv ids and titles checked). p5 boards cannot use the names `step` or `round` as globals ("Cannot redefine property"). Files: `exports/scenes/lecture-diffusion.ams.json`, `exports/lecture-diffusion/index.html`. Next: flow matching, the same way (diagrams, simulations, bibliography: Lipman et al. 2210.02747, Liu et al. 2209.03003, Albergo and Vanden-Eijnden 2209.15571).
67. **Lessons in the app:** `src/workbench/lessons.js` (`LESSONS`, `buildLesson(app, id, { language })`, used by `/lesson` and the Docs); a **Lessons** Docs section (`docsContent.js`: *Lessons as scenes*, sampling, diffusion, painterly, line walk, each with Build the scene / As p5.js / Take the tour); three walkthroughs (`walkthroughs.js`: `lesson-sampling`, `lesson-diffusion`, `painterly-klee`; helpers `goTo` and `openLesson`, which builds a lesson the first time and opens it after). Checked in the pane: the diffusion tour builds the 44-board scene and the painterly tour runs to its sliders, with no errors.
68. **Beginner p5.js sketches for the sampling lesson (`p5expl`):** each of examples 1–8 has a plain, copy-pasteable p5.js 2.x sketch (async `setup`, `await loadImage`, no studio helpers) beside its studio code; `/lesson sampling expl` builds the scene with them, and the report script's `expl` variant writes them (`lesson-sampling-p5.mjs --expl`). Examples 9 and 10 (ml5 pose) are held back until tried in editor.p5js.org; GIF examples 7–8 read only the first frame there. The studio's page export does not yet offer a p5expl tab. The `generiti` branch holds the earlier version (p5 1.x `preload`) and is frozen.
69. **Genereti's two performance patches, taken (uncommitted at the time of writing):** the embed `export` takes `format: 'bitmap'` (an `ImageBitmap`, no PNG encode: 6 ms against 24 ms at 512 px in the demo page; `src/embed/bridge.js`, documented in `docs/EMBEDDING.md` and the client JSDoc), and the `ink` brush fills one outline polygon plus caps and a disc every 4th point instead of a quad and a disc per point (60 strokes of 250 points at 1024 px: about 14 ms against 210 ms; no visible difference to the old one on waves, curls, loops, hairpins and zigzags at widths 6 to 80). The outline is used only when Wobble is 0 and the stroke is open with 3 or more points: with wobble the radii jump and an outline through them spikes, so that case keeps the old union. Not done: `draftOnly` export (the optional follow-up).

**Round 2, next:** (1) **Dirty rectangles** for a live board (redraw only what changed; the z-order of small over big strokes is the hard part); a mark's key is still hashed each frame. (2) **Fidelity**: longer, edge-following strokes, color variety inside a stroke, seeding detail from the face tracker or from *Fit* shapes. (3) Takes and recordings should render timed marks with the frame's own clock (`now`), as should the p5 export's static sketches. (4) A p5.brush option is not built (we chose our own brushes). (5) Documentation of the kit in the Brush tab hover docs.

**Masks and effects, next:** masks on single marks and on assets placed on a board (today: put them on a board and mask the board); masks and effects on document, sketch and player boards (CSS `mask-image` from the composed mask is one route); SVG, p5 and page pictures that honor them; a GPU path for effects (a shader for the compiled stack) if live video stacks need it; more effects (edge, dither, color balance); the Boards panel showing which boards are masked.

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

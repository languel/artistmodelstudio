# The workbench

`npm run dev` → http://localhost:3017. The previous studio is at `/classic.html`.

## Layout

An infinite canvas with the artboard at its center. Panels dock left, right or bottom, float,
and collapse, as in underscores:

- **Tab icon:** click to activate. Drag it past a small threshold to float the panel, and drop it at an
  edge to dock it. Right-click for placement options.
- **Resizing:** drag a dock's canvas-facing edge. Drag it past the edge to collapse the dock, and
  double-click or drag the edge to bring it back. **Cmd+B**, **Cmd+Opt+B** and **Cmd+Shift+B** toggle
  the left, right and bottom docks.
- **Floating panels:** move them by the header and resize from the corner. **Shift+double-click** the
  icon to minimise.
- The layout persists. **Menu → Reset layout** restores the defaults.

| Panel | What it holds |
|---|---|
| Boards | The drawing's boards in order (click to go, double-click to rename, the dot marks the training board), the blackboard, the page intro and page export. |
| Stages | The process as ordered layers: show, lock, rename, kind, reorder. New marks go to the active stage. |
| Outliner | Every mark by stage and group: select (Shift for a range, Cmd to toggle), rename, drag to reorder or move between stages and groups, hide, lock, delete. Cmd+G / Shift+Cmd+G group and ungroup. |
| Assets | Saved processes, takes, earlier generations, imports (images, audio, text, SVG, JSON; files or whole folders, subfolders kept), and the Klee references. Search, folders (right-click to remove), stars, tags; click, Shift and Cmd select several to drag or delete. |
| Properties | The selection, or the current tool's defaults: role, stage, brush and its parameters, color, the reason (why), the author. |
| Code | Everything as code, in modes. **Score:** write or load a score (Cmd+Enter runs it; the exercises live here). **Brush:** read, fork and write brushes with a live preview. **Sculpt:** the sculpt tools, with a preview sweep. **Selection:** the selected marks as score code; edit and Apply, and they change in place (same ids). **Clip:** a timeline clip as `clip({ … })`. Right-click a mark or a clip → Show code. Parameters are sliders (see *Parameters in code*); two glyphs at the right of the tabs toggle line numbers and where sliders go. |
| Process | Picture or process view, stage scrub and replay, a filmstrip, decisions, reasons, the editing record, and the process sheet. |
| Generate | Engines and models write scores. Candidates can be opened, saved, or read as scores. |
| Assistant | Chat with any engine (Ollama, WebGPU, OpenRouter…). It acts through the same tools as an agent, visibly. *How did you do that?* replays its last session. |
| Decide | The drawing as a sequence of typed decisions, answered by a policy you can train (see below). |
| Docs | The documentation, with search and collapsible contents. Parts are generated from the code: brushes, vocabulary, exercises, tools. It also holds the walkthroughs and the training estimator. |
| Settings | Artboard size (presets, rotate) and paper, theme, accent color (record, playhead, points), grid (on the paper or everywhere, lines or dots, spacing, subdivisions, color, snap), reference opacity, the guide. Cmd+, |
| Shortcuts | Every command and its keys, searchable. Click a key to reassign it; a key taken from another command moves. Shift+Cmd+/ |
| Timeline | Record, review and edit takes (bottom dock): transport, tracks of clips, summary, walkthrough, export (playable HTML, project zip, video, JSON). |
| Log | What happened, including every agent action (in purple). |

**Cmd+K** opens the command palette, which finds every command, panel, exercise, walkthrough and docs topic by name. Anything else you type goes to the Assistant. **?** opens the Docs.

**Walkthroughs** (after underscores) move the guide cursor to the real controls and run actions through the agent tools, so they are logged and undoable. Some steps wait for you. The narration card has Back, Pause, Next and Stop. The walkthroughs:
- *Taking a line for a walk*, a lesson after Klee and William Ngan.
- *Tour of the workbench*.
- *Teaching a decision policy*.
- *Study: Senecio*: study a painting, write its methods as brushes and a score (typed live), reproduce it, then draw a new subject in its manner.

Walkthroughs set the layout they need (through `ams_layout`) and put yours back when they end.

## Tools

| Key | Tool |
|---|---|
| V | Select: click, shift-click, marquee; drag to move; Delete removes |
| H / Space | Pan (also the wheel; Cmd/Ctrl+wheel or pinch zooms) |
| O | Point |
| P | Line: freehand; time and pressure are recorded (with a mouse, speed sets pressure) |
| A | Plane: freehand lasso |
| E | Gesture: construction, hidden in the picture view |
| G | Guide: straight; Shift snaps to 15° steps |
| B | Brush: draw with the active brush (click the button again or right-click for the list; picking one with marks selected applies it, Cmd-click only picks) |
| S | Sculpt (see below); Shift+drag over a mark sculpts it with most tools. `[` `]` radius, Shift+`[` `]` strength |
| T | Note (after the grid toggle in the toolbar) |
| ' | Show every mark's points as faint dots |
| Opt+right-click | The active tool's parameters as sliders, where you click |
| F | Fit the artboard |
| \ | Toggle the picture / process view |
| R | Toggle the reference underlay |
| Cmd+Z / Shift+Cmd+Z | Undo / redo |
| Cmd+S | Save to Assets |

**Stroke and fill:** two swatches in the toolbar. New marks take them, and selected marks change with them. Right-click for none, brush ink or swap; the color picker has a None button (or type `none`).

Opening an image asset (or an image file) puts it under the artboard as a reference. It isn't part
of the picture, and the Generate panel can send it to vision models.

## Editing

- **Transforms:** select, then hover near the frame. A corner scales (Shift keeps proportions, Alt from the center), a side stretches, just inside (or outside) a corner rotates (Shift snaps to 15°).
- **Right-click** a mark: arrange, move to stage, brush, sculpt, simplify (fewer points, same shape), duplicate, group, lock, hide, delete. Right-click the empty canvas: select all, fit, grid, snap, a note there.
- **Image layers:** drag an asset from Assets (or image files from the desktop) onto the canvas. Pictures become image layers that move, scale and rotate like any mark and travel inside the drawing; a saved drawing comes in as a group of its marks.
- **Look:** every element has an opacity and a blend mode (Properties → Look).
- **Notes:** notebook (handwriting on the page), sticky, index card or plain; font, size, width, paper. Drag a side to re-wrap, a corner to scale the lettering. A new note starts from the last note you styled.
- **Color:** the picker has a saturation/brightness field, hue, opacity, hex or a color's name (pigments such as *payne's gray*, CSS names), palettes (Klee, Kandinsky, Bauhaus, inks, grays, pigments, your own, or sampled from the reference), recent colors, and an eyedropper (I).

## History, recording and the timeline

**History** captures every change to the drawing (its own capture button pauses it): preview any past state, restore it (undoable), or drag entries onto the Timeline as clips. The **Timeline** is what you produce: tracks of clips as in a video editor (any number of narration, drawing, title, camera or audio tracks; rename, mute, delete; drag clips between tracks of a kind). Drag sound, text or saved drawings from Assets onto it; audio plays in review, in the standalone player and in video exports.

A **take** records how a drawing was made: the starting drawing, then clips on tracks (titles, narration, drawing changes, actions, camera, audio). Record by hand; walkthroughs and agent activity record themselves (agent recordings stop after 90 s of quiet), so a long run can be reviewed later. Takes are in Assets → Takes.

In the Timeline, clips are rectangles: drag to move, drag the right edge to retime, double-click text, right-click for speed, reveal and delete; the selected clip's properties are in Properties. **Summary** distills a run (narration at reading pace, the drawing brisk, analysis and waiting sped through, a hold at the end). **Walkthrough** makes a live walkthrough from a take. **Export** writes a standalone playable HTML file (the renderer inlined; `window.amsPlayer.seek(ms)` / `frame(ms)` for frame-by-frame capture), a project zip, a video (MP4 or WebM), or JSON. Agents use `ams_record` and `ams_timeline`.

## The interface

It is kept minimal.

- **Two islands:** the tools sit top centre; the menu island sits top left (menu, picture or process view, points, present, theme).
  - Drag either island, or the zoom control, by its dotted grip; double-click the grip to put it back.
  - **Cmd+.** hides all of the interface and leaves only the drawing. The command palette (and `ams_ui`) hides the tools, menu island, zoom control or panels one by one.
- **Panels on demand:** Scenes, Boards, Stages, Outliner, Assets, Properties, Code and the rest open as needed.
- **Right-click and Opt+right-click:**
  - Right-click a toolbar button for its list (Brush, Sculpt, Construction) or its settings (the grid button: grid and drawing).
  - Opt+right-click the canvas for the active tool's parameters.
- **Icons:** every built-in brush and sculpt tool has an icon; the toolbar shows the active one. Custom tools take theirs from their preview (the camera button in Code → Brush / Sculpt). In menus the active item has a soft background.
- **Names:** Shift+double-click renames anything with a name, in place: boards, scenes, stages, tracks, asset titles and folders, and marks, groups and stages in the Outliner. Enter keeps it, Esc puts it back. In the Outliner and the Boards panel a plain double-click frames the item.
- **Framing:** Home frames the active board, Shift+Home the selection.
- **Drawing:** Settings → Drawing (or right-click the grid button) has Lazy and Smoothing.
  - **Lazy** (screen pixels) is a string between the cursor and the pen. Wobbles shorter than it never reach the line, and corners get rounded.
  - **Smoothing** (0 to 0.95) is how much the pen holds back each step: 0.5 covers half the distance, so higher is smoother and lags more.
  - **Simplify** (screen pixels, 0 = off) keeps only the points the line needs, live while drawing: how far the shape may move from what your hand did. With Points on, the stroke being drawn shows its kept points.
  - Planes close smoothly: overshooting ends are cut and the seam relaxed.
- **Running a score** (Score panel, a generated candidate, an agent) draws into the active board and replaces that board's marks. The other boards and the blackboard stay.
- **Naming:** project > scene > board > stage and marks. New project starts over (after offering to keep the current one in Assets); New scene adds a drawing.

## Drawing and editing points

- **Point by point:** with a drawing tool, click without dragging; each click adds a point. Double-click or Enter finishes, clicking the first point closes, Backspace removes the last point, Esc finishes.
- **Closing:** a line drawn back to its start closes itself.
- **Smooth or straight:** double-tap CapsLock (it ends as it was) flips the path of the stroke being drawn, or of the selected marks. Properties → Look → Path sets it too.
- **Tool settings:** right-click Point, Line or Plane (or the gesture/guide button) for the brush, its settings, opacity, blend and path of new marks. They stay until changed.
- **Direct selection** (Shift+V, sharing the Select slot):
  - Click a mark to see its points, and drag points to move them.
  - Shift-click or a marquee selects several.
  - Double-click a segment to add a point; Delete removes points.
- **Snapping:**
  - Hold Ctrl while drawing, moving or scaling to snap.
  - **Snap to** (right-click the grid button) sets how: *Grid* puts the grabbed point on a grid point (the default), *Steps* moves in whole grid steps, *Objects* snaps to the nearest point of another mark.
  - Right-click → Snap works on a selection: points to grid, tidy, position (top-left or center), or quantize 2× or 4×.
- **Simplify** (with Lazy and Smoothing) keeps only the points a line needs, live while drawing.
- **Brushes:**
  - **Pen:** one constant width.
  - **Ink:** width follows pressure, smoothed along the line.
- **Copy and add:** right-click selected marks → Copy as SVG, PNG or p5 code, or Add to Assets as PNG (it opens again as a drawing) or SVG.

## Workspace

- **Background:** Settings → Workspace, or the command palette: `/background <color | transparent | default>` and `/transparent`.
  - Transparent shows what is behind the window, for a see-through browser overlay.
  - Other slash commands: `/ui`, `/present`, `/grid`.
- **One HTML file:** `npm run build:single` → `dist-single/ams.html` (about 3 MB), the whole workbench to open from disk (for example in CloudyWindow). In-browser WebGPU models are left out.
- **Panels:** drag a panel tab along its row to reorder it.
- **Toolbars:** drag an island by its grip; a moved island keeps its size.
- **Performance readout:** right-click the zoom control. It shows frames per second while redrawing, the last redraw time and the number of marks; a redraw over 16 ms shows in the accent color.

## Scenes, boards and pages

A **project** holds **scenes**, and a scene holds **boards**. It is enough to write a lecture, a blog post or a report, or to prepare a performance.

- **Scenes** (the Scenes panel) are separate drawings. Each has its own undo, History and Timeline; Assets, brushes and settings are shared by all. Opening a drawing from Assets, or a file, makes a new scene, so your drawing is never replaced. Alt+PageUp and Alt+PageDown step through scenes.
- **Boards** (Shift+O, or the Boards panel) are artboards in one drawing, in order, like slides.
  - **The main board** is the old artboard at the origin, so every older drawing, score and training record is unchanged.
  - **Editing boards:** drag out more with the Board tool. A board's title selects it, moves it (with its marks) and renames it; its right-click menu exports it, trains on it, reorders or duplicates it.
  - **Which board a mark is on:** marks belong to the board they are drawn on. Outside the boards is the **blackboard**: kept, but in no board's picture.
  - **Training** uses the board marked with the dot in the Boards panel.
- **Board code** (Code → Board): a board's own score, run with the board as its artboard. Each run replaces its last run's marks, so the board is live while you edit or move its sliders.
- **Present** (Opt+Cmd+P): the boards full-window, with eased moves between them.
  - Keys: →, Space, ←, 1–9, Esc.
  - Drawing still works.
  - While recording, the moves go onto the camera track, so replays and videos follow them.
- **Frames** are slides: a board whose kind is *Frame* (Code → Board) holds the boards whose centres lie inside it.
  - Dragging a frame by its title moves its boards, and their marks, with it.
  - Going to a frame fits the view to the slide, and its boards run together.
  - Presenting steps through the frames, in reading order, when a scene has any.
  - The Boards panel lists each frame's boards under it, numbered by slide.
  - An exported page shows a frame as one section, with its boards side by side as on the canvas.
- **Page** (Export → Page): the drawing as one HTML file.
  - The page uses the studio's dark theme, and follows reading order (as the boards are laid out: rows top to bottom, each left to right).
  - Each board is a section, depending on its kind:
    - **Drawing:** its picture, then ▶ (for a board that follows a moving source), Picture / Process / Replay, and its sliders, all below the picture. Under them, its code in one box with tabs: **Pseudocode** (a board's `pseudo`, when it has one), **Studio** and **p5.js**, with Copy. On the page, a notes board's folded pseudocode and code callouts give way to that box.
    - **Markdown:** the document itself. `[[links]]` jump to boards on the page, and `![[embeds]]` show their pictures. A Markdown board titled "*Board* · notes" joins that board's section.
    - **HTML:** its page, in a sandboxed frame.
    - **p5:** ▶ below the sketch starts it in a sandboxed frame; its code box has p5.js (and Studio, when the sketch came from studio code).
  - The pictures of the sources the boards read travel inside the page and are sampled there, so sliders and Run work without the studio. Pose and hands still need the studio.
  - A page that opens with a document uses it as its header.
  - The studio's renderer is inside the page, and so is the drawing, so File → Open the page to keep working on it.
  - Two examples: `scripts/point-line-plane-demo.mjs` (a lecture after Kandinsky) and `scripts/senecio-report-scene.mjs` (the Senecio run report).
- **Performing:** 1–9 go to a board; Shift+1–9 pick a brush slot; Ctrl+Shift+1–9 keep the active brush in a slot.

In a score:

```js
board('A line')                         // made if new, right of the others
line(walk({ from: [0.1, 0.5], steps: 80, turn: i => sin(i / 7) * 9 }))   // fractions of this board
board()                                 // back to the main board
```

## Brushes are code

Every brush, the built-ins included, is a small program written against a kit:

```js
brush({
  id: 'ticks', label: 'Ticks', roles: ['line', 'gesture'],
  doc: 'Short marks across the walk, as long as the hand was fast.',
  params: { len: [1, 40, 10, 'Longest tick'] },
  draw(ctx, e, p, k) {
    k.beginInk(ctx, e, { width: 1, opacity: 1 })
    for (const f of k.frames(e)) { const r = Math.min(p.len, f.speed * 1.5); k.segment(ctx, f.x - f.nx * r, f.y - f.ny * r, f.x + f.nx * r, f.y + f.ny * r) }
    ctx.restore()
  }
})
```

The kit: `k.frames(e)` (the walk with normals, speed and pressure), `k.smoothPath`, `k.spans` (for fills), `k.rotatePts`, `k.tracePath`, `k.segment`, `k.beginInk`, `k.draw(id, …)` (another brush), `k.rng()`, `k.noise(x, y)`, `k.image(src)`. The Brushes panel lists built-in, library and drawing brushes; scores define brushes with the same `brush({...})`; agents use `ams_brush`. A brush that fails draws plainly (and warns once) instead of breaking the drawing. Brush code runs in the page: open drawings from people you trust.

## Marks and points

A drawing is a set of **stages** holding **marks**. Each mark has:

- **role:** point, line, plane, guide, gesture or note (and image, for pictures placed as layers).
- **points:** `[x, y, t, pressure]`, in artboard units. `t` is milliseconds from the start of the stroke; pressure is 0 to 1 as recorded, and can go above 1 when a line is thickened.
- **brush and params:** the brush that realizes the mark (`realize: { brush, params }`).
- **color and fill:** stroke color, plus an optional fill (painted under the stroke for closed lines; for planes the fill drives the brush and the stroke outlines it).
- **why and by:** the reason for the mark and who made it (you, a model, an agent).

Curves are the points themselves. The renderer passes a Catmull-Rom spline through them, so a line is always smooth through every point. This keeps marks simple enough to write as code and to learn from.

## Sculpting

Sculpt tools come from threegrease's sculpt brushes. A smooth falloff across the brush circle weights every change. `[` and `]` set the radius, Shift+`[` and Shift+`]` the strength. With a selection, only the selected marks change. Each drag is one undo step.

| Tool | Does | Alt | Cmd |
|---|---|---|---|
| Push | points follow the cursor | | |
| Grab | picks up the points under the brush and moves them | | |
| Smooth | points move toward their neighbours; pressure evens out too | | |
| Relax | evens out spacing without changing the shape | | |
| Pinch | points gather toward the cursor | inflate | |
| Twist | points turn around the cursor | other way | |
| Jitter | a seeded tremor | | |
| Simplify | fewer points, same shape (tolerance) | resample: more points, graded by the falloff (density) | |
| Thicken | raises pressure, so pressure-aware brushes draw wider | thinner | past the usual limit (up to 10) |

Tools that bend lines add points under the brush first, so a mark with few points can still bend and swell smoothly.

A sculpt tool is code:

```js
sculpt({
  id: 'comb',
  label: 'Comb',
  doc: 'Points drift across the direction you move.',
  refine: true,
  params: { amount: [0, 1, 0.3, 'How strongly each pass acts'] },
  step(pts, s, p, k) {
    return pts.map(q => {
      const w = k.w(q) * p.amount
      return w ? [q[0] - s.dy * w, q[1] + s.dx * w, q[2], q[3]] : q
    })
  }
})
```

- `pts` are the mark's points.
- `s` is the stroke: cursor `x, y`, movement `dx, dy`, `radius`, `strength`, `invert` (Alt), `boost` (Cmd), the points when the stroke began (`orig`) and `state` kept for the stroke.
- `k` is the kit: `w(pt)` is the brush weight at a point, plus `falloff`, `mean`, `rdp`, `refine`, `nearMark` and `rng`.

**Code → Sculpt** shows every tool, with a preview sweep. Fork one or write your own; saved tools go to your library and appear in the toolbar list.

## Parameters in code

Parameters in code are controls:

- **Declared params:** `key: [min, max, default, 'doc']` in a `params` block gets a slider.
  - With marks selected that use the brush, the slider sets their value.
  - Otherwise it sets the active brush, the tool's defaults, or the sculpt tool in use.
  - Only when nothing uses it does it rewrite the default in the code.
  - Hovering a slider says what it acts on.
- **Range comments:** any number followed by one, like `0.4 /* 0..1 */`, gets a slider that rewrites the number.
- **Cmd-drag** any number in the code to scrub it (Shift for fine steps). Cmd-drag also works in every number box in the app.

Two glyph toggles at the right of the Code panel's tab bar set how the editors look: line numbers on or off, and where sliders go (on the code lines, beside the preview, or off). Sliders look the same everywhere: in the code, in the preview strip and in the Opt+right-click popover.

This is the first step toward every value in code being something you can play.

Ink draws round joins (a quad per segment and a disc per point, filled as one shape), so thick and thickened lines turn smoothly.

## Lines

Every line records its walk: points with time and pressure. Six line forms after William Ngan's *Taking a line for a walk* read the hand's speed from it: speed lines, restated, zigzag, inner lines, dotted walk, arcs.

A score can also create its own line, following Ngan's point that artists should make their lines before drawing them:

```js
defineLine('teeth', { params: { bite: [0, 60, 18] } }, (ctx, frames, p, env) => { /* frames: x, y, nx, ny, speed, pressure */ })
line(pts, { brush: 'teeth' })
```

The definition is stored in the drawing (`doc.lines`). It renders on the canvas and in SVG exports, and appears in Properties.

## Scores

A score is JavaScript that uses the vocabulary. Running it records the process document. Coordinates are **fractions of the artboard** (0..1), with `width` and `height` for its size, as in p5; `units('artboard')` switches to absolute units, and older absolute scores are recognized and still run:

```js
artboard(1000, 600, '#f3efe6')
stage('Construction', 'construction')
guide([[0, 0.66], [1, 0.66]], { why: 'horizon' })
stage('Marks', 'marks')
const path = walk({ from: [0.08, 0.7], heading: -10, steps: 200, step: 0.004, turn: i => sin(i / 13) * 5 })
line(path, { width: 4, taper: 0.4, pressures: t => 0.3 + 0.6 * sin(t * PI), why: 'an active line' })
plane(rect(0.6, 0.2, 0.2, 0.23), { brush: 'hatch', angle: 30, spacing: 8, why: 'a light plane, high right' })
decide('Where does the weight sit?', ['low left', 'high right'], 'low left', 'below and left feels heavy')
note(0.02, 0.03, 'A note shown in the process view')
```

The Score panel is a code editor (CodeMirror): line numbers, wrapping, folding, search, Cmd+/ comments, completion of the vocabulary, brush names and a brush's parameters, hover docs, and the failing line marked after a run.

The full vocabulary is in the Score panel (**Vocabulary**), in the Docs, and in `ams_vocabulary` for agents.

## Sources

Sources are the project's streams: the camera, and images and videos from Assets. Later they will include other data. The **Sources** panel (left dock) lists them by name, and every scene and board shares them.

- **Add:** the camera glyph adds the camera; **+ asset…** adds an image or a video.
- **Speed:** a clip plays at ¼×, ½×, 1×, 2× or 4× (or paused). This is the source's pace only: how fast the man walks.
- **Sampling:**
  - *continuous* samples every frame.
  - *every…* samples every N seconds.
  - *hold* keeps one frame.
- **Rename:** Shift+double-click the name.

Sources are time-based assets: the panel only lists them, with their own properties (sampling). What uses a source lives elsewhere, and any number of things can use the same one:

- **Preview:** double-click a picture, GIF or video in Assets, or drag a source onto the canvas. An asset becomes a source, and you get a board in its shape with the source shown underneath, whole and live (double-clicking the asset again goes to that board). The card's reference button still puts a picture under the main board as a faint reference.
- **Drop:** drag a source onto the canvas. You get a board in its shape, with the source shown underneath, whole and live.
- **Underneath:** a board's menu → *Source underneath* shows any source under any board (a reference, not part of its picture).
- **Draw from it:** a board's menu → *Draw from a source* puts a demo's code on the board (redraw as shapes, dots, strokes along forms, pose lines, fingertips), which the board follows. It is ordinary code: change it, or write your own.
- **Gestures** watch a source (see Gestures).

Code reads a source by its name:

```js
const cam = source('cam')         // fitted to the board (cover), fractions of the board
cam.color(0.5, 0.5)               // '#rrggbb'; also rgb(x, y), value(x, y) 0..1
cam.pose                          // [[{ x, y, v }] × 33 per person], MediaPipe, on demand
cam.hands                         // [[{ x, y }] × 21 per hand]
cam.mask(0.5, 0.5)                // 0..1: a person there (segmentation)
cam.frame                         // changes with each new sample
```

Landmarks are computed only after code asks for them, and are kept for the next frames. Without the studio (in tests or an exported sketch), a source is grey and empty.

Brushes and sculpts reach sources through the kit. `k.source('cam')` is fitted to the mark's board, and `.colorAt(x, y)` and `.valueAt(x, y)` take world units. A brush that reads a source redraws when it takes a new frame.

### Redraw from a source

`fit(source, { shapes, kinds, brush, stage, seed, ground, live })` redraws a source as plane marks by greedy shape fitting (the classic Reference Fitter):

- Rectangles and triangles are straight; circles are smooth.
- A ground plane in the mean color comes first.
- Every shape is a real mark: select it, restyle it, export it.

A board can **follow** its sources. Its code runs again on each new frame of a source it reads (`source('…')`, `fit('…')`), as a live redraw with no undo steps. Toggle it with the loop glyph in Code → Board.

With `live: true`, `fit` keeps its shapes between frames and replaces the oldest few each time. That is the continuous redraw:

```js
fit(source('cam'), { shapes: 120 /* 10..400 */, live: true })
```

`fit` runs in the background (a worker): the board shows its last fit while the next frame is fitted, so the studio stays smooth however many shapes it asks for. `quality: 'fast'` is about ten times cheaper (a 64-cell grid, rectangles and circles, each shape the best of random tries); the default, `'fine'`, also tries triangles and refines each shape with small changes. `'fast'` is the fitter the p5 export uses, so a board and its sketch match.

`fit` is built in (`src/process/fit.js` and `src/fitting/fitCore.js`, over the Reference Fitter in `src/fitting/fitReference.js`). To change how it works, a board's menu → *Draw from a source* → **Fit shapes, in code** writes the same idea out as board code: random tries, each shape the best of them (the one that brings the picture closest to the source), the oldest giving way on each new frame. Change how shapes are tried, kept or drawn. It keeps its shapes between runs with `state(name)`: an object that lasts across runs of the board's code, for any process that carries on from frame to frame.

In the Sources panel:

- The **redraw** glyph writes that code into the active board, shows the source under the board, and turns following on.
- The **eye** shows a source under a board as a reference, not part of the picture.

### Live and paused boards

Only live boards run. A live board:
- re-runs its code on new frames of the sources it follows;
- has brushes that read live frames;
- is redrawn every frame.

The board you are on is live unless you pause it. Play and pause a board with:
- the button after its title on the canvas;
- the button in its Boards panel row;
- **Play** / **Pause** in its menu.

The button shows what a click does: ‖ while it runs, ▶ while it is paused. A paused board stays paused, even while you are on it. Playing a board you are not on keeps it running while it is on screen. Following a source plays a board again.

Every other board is paused and **baked**: drawn once into a picture and shown as that picture until it changes or runs again. Boards off screen are not drawn at all. A source samples only while a live board on screen needs it, and paused sources look dimmed in Sources. 

**Bake to image** makes a bake permanent, after underscores' bake:
- On a board's menu, the board's marks become one image mark the size of the board, and the board stops following its sources.
- On the selection's context menu, the selected marks become one image mark.
- The image records what went into it (`e.bake`), and Undo brings the marks back.
- Baked images are ordinary marks: add them to Assets, or use them as thumbnails.

Agents use `ams_get` with `format: 'p5code'` for a board's code as p5, and `ams_source`: list, add, remove, update, sample (colors, values and landmarks at points), frame (a PNG), show, follow.

### Redraw rate

Two speeds, set separately: the source's (Sources → speed: how fast a clip plays) and the board's (Properties → Board → **Redraw**: how many times a second its code runs). With Redraw at 0 a board following a source runs once per new frame of the source. With a rate (up to 60) it runs on its own clock, each run with fresh randomness: a slow GIF still gives dots, strokes and shapes that are drawn again and again, and a live `fit` carries on refining while the clip changes slowly. The demos (board menu → *Draw from a source*) set a rate of their own, take the source from under the board (it changes with each frame, the paper should not) and leave the ground alone: `fit` runs with `ground: false`. A p5 sketch exported from such a board draws at that rate, reseeded each frame.

### Media controls

Drag a clip or an animated GIF from Assets onto the canvas (or double-click it) and you get a source, a board previewing it and, under it, a **player** board: play / pause, a frame back and forward, a scrubber with the time and frame, and the speed (¼× to 4×). The player is a board of its own (it moves and resizes like any other) and works on the source, so every board that reads the source follows it. A picture or a camera has nothing to play, so it gets no player.

Show or hide the controls from Properties → Board (the controls glyph, beside play, on a board that shows the clip or on the player itself) or the board's menu → Board → *Show / Hide media controls*. Hiding it hides the player board (a dashed outline marks where it is); showing it again brings it back, or makes one if there is none.

### Board switches

Properties → Board has four switches as glyphs beside its title (and the board's menu → Board):

- **Lock:** its marks cannot be selected, changed or drawn over, and the board cannot be moved or resized.
- **Hide:** not drawn and not run; a dashed outline marks where it is. Hidden boards are left out of the exported page.
- **Title:** hides the title above it (it shows while the board is selected, so it can still be moved).
- **Performance:** a line under it (see below). Only boards that show it are measured.

### Performance

**View → Performance under boards** (or click the performance readout by the zoom control) writes a line under every board; a board's own switch writes it under that board. Nothing is measured for boards that do not show it:

- **studio code:** runs a second, the code's time per run, the fit's time in the background, each source's new frames a second, and its marks;
- **p5:** frames drawn a second (of how many `draw()` calls: a sketch following a GIF skips frames that have not changed) and the time each took.

**Assets › Test clips** has a countdown (10 s, each frame showing its number, the time and a sweep each second) as a 30 fps video and a 10 fps GIF. Add one as a source and draw from it: the numbers show how often a board really updates.

A board following a source runs up to about 30 times a second, fewer when a run takes longer (it waits twice a run's time). Studio code makes real marks (each can be selected, restyled, exported), so thousands of marks per frame cost more than a p5 sketch painting the same dots.

## Gestures

The Gestures panel (the hand) watches a source (the camera, or a video to test with) for gestures and does something when one completes. Gestures are written as code:

```js
gesture('pick color', [{ touch: ['left.pinky', 'nose'], hold: 300 }], 'color next')
gesture('sample color', [{ pinch: 'right', hold: 500 }], 'color sample right.index')
gesture('undo', [{ fist: 'left' }, { open: 'left' }, { fist: 'left' }], 'undo', { within: 900 })
```

- **Steps** follow each other in order; each must hold for `hold` ms (default 120), and the next must come within `within` ms (default 1500). After firing, a gesture waits `cooldown` ms (default 800).
- **Conditions** (a step's keys, all must hold): `touch: [a, b, tol?]`, `apart: [a, b, tol?]`, `above` / `below: [a, b]`, `pinch`, `fist`, `open`, `point: side`, `fingers: [side, '01100']` (thumb to pinky), `still: point`, `move: [point, 'left' | 'right' | 'up' | 'down', speed?]`, `learned: 'label'`, `not: step`, `any: [steps]`.
- **Points:** `nose`, `mouth`, `neck`, and `left.` / `right.` + `eye`, `ear`, `shoulder`, `elbow`, `wrist`, `hip`, `knee`, `ankle`, `hand`, `palm`, `thumb`, `index`, `middle`, `ring`, `pinky`. Left and right are the person's own. Distances are in body units: a shoulder width (or the torso's length / 1.4, turned sideways).
- **Learned poses:** a step can be a label (`'palm out'`, the same as `{ learned: 'palm out' }`). The panel lists the labels the script uses; ● records 2 seconds of examples of each. The nearest examples decide. Sequences of learned poses make moving gestures (a wave: out, in, out).
- **Actions:** `color next` / `color prev` (the palette chosen in the panel, or `color next Bauhaus`), `color sample <point>` (the source's color there), `undo`, `redo`, `run` (play or pause the board), `board next` / `board prev`, `slot <n>`, `!<console command>`, or a function `(app, body) => …`.
- **In code:** `source('cam').point('right.index')` is where a point is (fractions of the board), and `source('cam').fired('pick color')` is true for half a second after it fires.

The script, the examples and the watched source are kept in the browser.

## Exports

From the menu:
- **PNG:** the picture view or the process view.
- **SVG:** one group per stage, and each element's full record in `data-ams-*` (it re-imports losslessly).
- **p5.js zip:** a standalone sketch of the active board (or a board, from its menu): the recorded board with its own brushes, drawn by the studio's renderer inside the sketch. R re-runs the board's code (or, for the main board, the drawing's score) with a new seed; P toggles the process view, 1–9 show the stages.
- **p5 (minimal code):** a short `sketch.js` of plain p5 calls for teaching (also Copy as → p5 code on a selection).
  - Lines are `beginShape()` with `splineVertex` (smooth) or `vertex` (straight); planes are filled shapes, points circles, notes text.
  - Only the points that shape each line are kept. Brush textures are left out; a comment names each mark's brush.
  - Runs of five or more marks of one kind (or many points) become a data array and a loop: `const dots = [[x, y, size, color], …]`, or a list of point lists for lines and planes. A small `shape()` helper draws them. Values that are the same for the whole run are set once.
- **p5 (its code):** a board's own code as a p5 sketch (zip: `index.html`, `sketch.js`, and the media of the sources it reads).
  - The score is kept as written. The studio words it uses are defined after it in plain p5, and only those.
  - `point`, `line`, `plane`, `rect` and `circle` clash with p5, so they become `drawPoint`, `drawLine`, `drawPlane`, `rectPoints` and `circlePoints`.
  - `source('name')` samples a `loadImage` (animated GIFs step with `setFrame`), a `createVideo` or `createCapture(VIDEO)`, fitted like the studio does.
  - For p5 2.x, files load with `await` in an async `setup()`; 1.x uses `preload()` and `curveVertex`.
  - **Landmarks** come from [ml5.js](https://ml5js.org/), loaded only when the code reads `.pose`, `.hands` or `.mask(…)`:
    - `bodyPose('BlazePose')`: the same 33 points as the studio.
    - `handPose()`: 21 points per hand.
    - `bodySegmentation('SelfieSegmentation', { maskType: 'person' })` for the mask.
    - Videos and cameras are watched with `detectStart`; pictures and GIF frames are asked with `detect` each time they are drawn. `index.html` loads ml5 too.
  - **Custom brushes** run as written: `brush()` keeps them, and `drawLine` / `drawPlane` / `drawPoint` hand a mark (`points` of `[x, y, t, p]` in pixels, `color`, `closed`) to the brush's `draw(ctx, e, p, k)` on p5's `drawingContext`. The kit is small: `frames`, `smoothPath`, `tracePath`, `segment`, `beginInk`, `rng`, `noise`, `source` (with `colorAt` / `valueAt` in pixels).
  - `fit()` comes as a compact greedy fitter (rectangles and circles; `live: true` keeps its shapes between frames), and `state(name)` as an object kept across `draw()` calls. `source().pixels(w, h)` is there too, so a fit written out in code exports as it is. What cannot be carried (decide, sculpt, guide, gesture) is named in a comment.
- **p5.js version:** Settings → Export: 2.x (latest, the default) or 1.x (`curveVertex`). The full export loads `p5@2` or `p5@1`.
- **Page (HTML):** see *Scenes, boards and pages*.
- **Process sheet:** a PNG of the stages and the decisions.
- **JSON (`.ams.json`), to import again.** A file holds a scene, a board or a selection (`meta.part`):
  - **Scene:** Menu → Export → *Scene (JSON)*.
  - **Board:** its menu → Export → *JSON*. Its marks come from its top-left; its size, paper, title, code, text and source come along.
  - **Selection:** *Export as JSON*, or *Copy as → JSON* for the clipboard.

  **Import into the scene you are in:**
  - *Import into this scene…* (Menu), *Import here…* (right-click the canvas), or the import button in the Boards panel.
  - Drop a `.ams.json` file on the canvas, or paste (Cmd+V) copied JSON.
  - Boards come in as new boards, right of the others. A selection lands where you drop, right-click or look, as a group.
  - Stages are matched by name, and brushes come along. *Open file* still opens a file as a new scene.
- **Excalidraw:** round-trips to underscores through `customData.ams`.

## Documents and programs on boards

A board holds one kind of thing. Choose it in Code → Board, where its source is edited:
- **Drawing:** marks, and optional studio code (the default).
- **Markdown:** a document.
- **HTML:** a page.
- **p5.js:** a sketch.

Documents show as you type. Marks drawn on a document board stay on top of it, as annotations.

**Markdown** renders on the canvas and stays sharp at any zoom. It is Obsidian-flavored:
- tables, task lists, `==highlights==`, `#tags`, front matter (not shown);
- math with KaTeX: `$…$`, `$$…$$`, `\(…\)`, `\[…\]`;
- Mermaid diagrams in ```` ```mermaid ```` fences;
- callouts: `> [!note] Title`, or `> [!tip]- Folded`;
- links into the drawing: `[[Board]]`, `[[Board|label]]` and `[[scene:Title]]`;
- embeds: `![[Board]]` shows a board's picture, `![[asset:Title]]` an asset.

A document longer than its board scrolls inside it: the wheel over it scrolls it (and a wide code block sideways) until it ends, then pans the canvas. Opening a fold scrolls it into view.

**HTML and p5.js** run in sandboxed frames over their boards, with a bridge to the studio, `window.ams`:
- `ams.width`, `ams.height`, `ams.board`: the board;
- `await ams.call(tool, args)`: any studio tool;
- `await ams.mark(role, points, opts)`: add a mark to the board;
- `await ams.frame('source')`: a source's picture.

A p5 board runs while it is live and on screen, like a drawing. Paused, it shows its last picture. Errors appear under the code and in the Log. A frame takes the pointer only on the board you are on.

### Converting, baking, copying, pasting

- **Convert** (a board's menu, or `/convert p5|studio`): a drawing's studio code becomes a new p5 board running the sketch the export writes, and the same code pastes into the p5 editor as it is.
  - A p5 board loads files by name (`loadImage("seurat.jpg")`) from the studio's sources: the name before the extension is the source. In the p5 editor, students upload the picture beside the sketch.
  - A sketch the studio wrote converts back to studio code exactly. A p5 sketch written by hand has no studio code inside it: bake it instead.
- **Bake** (the board and selection menus, `/bake png|svg`): marks become one image mark. PNG gives a picture; SVG gives a vector image, crisp at any zoom. Undo brings the marks back.
- **Copy as** (nested, on boards and selections, or `/copy …`): PNG, SVG, JSON, studio code, p5.js code. Cmd+C copies the selected marks (as JSON).
- **Paste** (Cmd+V) takes what it is given, where you are looking:
  - pictures become image marks;
  - studio JSON comes in;
  - SVG comes back as marks when it carries the studio's record, and otherwise as a vector image;
  - p5 code becomes a p5 board, sized by its `createCanvas`, and studio code a drawing board;
  - other text becomes a note.

## The console

In the Assistant, a line starting with `!` runs a studio tool by hand, with no model involved:
- `!board list`
- `!add role=point points=[[10,20]] color=#c8664f`
- `!get format=p5code board="3 · Scattered dots"`
- `!snap {"ids": […], "mode": "points"}`

The first word is the tool (`ams_` optional), and a bare word after it is the action. `key=value` pairs are read as JSON where they can be. `!help` lists the tools, `!help board` shows one tool's parameters, and ↑ and ↓ recall earlier commands.

## Lessons

`examples/lessons/sampling/lesson.js` is a lesson as data: *Pointillism and Expressionism, by sampling*.
- **Sections:** *How we see* (five diagrams drawn by code: the eye, the retina as a mosaic, the cone curves, a pixel, then and now), then Seurat, Munch and Muybridge, each a public-domain source (`media/`, with `RIGHTS.md`), and *The body as a source* (pose, and a custom brush; ml5.js in the p5 versions).
- **Examples:** each is a board with an idea, pseudocode and code.
- **Scripts:**
  - `scripts/lesson-sampling-p5.mjs` writes each example as a p5 sketch (`exports/lesson-sampling/p5/`).
  - `scripts/lesson-sampling-report.mjs` writes the lesson as one HTML page. It uses the board pictures saved from the studio.

Examples for teaching favor few, simple, smooth curves over dense point lists.

`/lesson sampling` (or `buildLessonScene(app)` from `examples/lessons/sampling/scene.js`) builds the lesson as a scene of 16:9 frames. `/lesson sampling p5` builds the same lesson with every board as a p5.js sketch (the pose boards load ml5.js). The scene has:
- a cover frame with the contents;
- an intro frame per section: its text beside its source picture;
- a frame per example: the 800×600 drawing beside its notes (the idea, and folded callouts with the pseudocode and the other language's code);
- the bibliography: the pictures' Commons pages, and the papers and books behind the history, with checked DOIs.

The boards are linked by `[[title]]`.

## Agents

The same actions are MCP tools on `window.ams`, on WebMCP where the browser supports it, and over the dev
relay for Claude Code (`.mcp.json` registers `ams`). Start with `ams_vocabulary` and `ams_wb_state`.

- **Author directly:** `ams_run_score {source, by}`, `ams_add`, `ams_stage`, `ams_decide`.
- **Inspect:** `ams_snapshot`, `ams_process_sheet`, `ams_get {format}`.
- **Be the engine:** `ams_generate {engine: "agent"}`, then `ams_pending` (the exact prompts a model
  would get) and `ams_answer {text}`.
- **Other engines:** `ams_generate {engine, model, count, exercise, withReference}`, then `ams_candidates`.
- **Decide:** `ams_analyze {mediapipe}`, `ams_decide_step {backend, apply}`, `ams_decision_pending`,
  `ams_decision_answer {answers, apply}`, `ams_decision_labels {export}`.
- **Show:** every call moves a visible cursor to the control it uses and narrates. The narration card sets
  the pace (0 = instant). Strokes are traced, and scores are revealed stage by stage.
  `ams_sessions {action: "replay"}` replays a recorded session from its starting point, and Undo returns to where you were.

The Assistant panel runs the same loop with the model you load. Its replies are JSON:
`{say, actions: [{tool, args}], done}`. It is outsourced to Ollama or WebGPU when no harness is attached.

## Decide

A **System One** loop: small, fast, typed decisions, not free text.

1. **Analyze reference** turns the reference into value masses and regions. Each region has a place, size,
   value, hue, edge activity and direction, plus a polygon. With **MediaPipe** on, you also get a figure
   region (selfie segmentation) and pose limbs, which you can add as gesture guides.
2. **Propose step** asks the policy six questions:
   - *next* (look, block, structure, value, accent, stop),
   - *region*,
   - *technique*,
   - *value* (a score),
   - *direction*,
   - *density* (a score).

   The answers come with probabilities.
3. Click any option to override, then **Apply step**. A small executor realizes the step on the region's
   geometry, and every mark records the decisions behind it as its *why*.
4. **Run ×8** lets the policy continue. It stops for you when its confidence is below *Ask me*.

Policies:
- **Rules**: a transparent baseline.
- **lev / kev**: a local TypeSafe `/v1/systemone` server, proxied at `/__decide`.
- **Agent**: answers over MCP.
- **You**.

What you choose and what the agent answers become labels in lev's format. Export them and train a local
policy with `training/decisions/` (see its README).

## Next

- **A modifier stack:** non-destructive, Blender-like operations on a mark, with Apply to make them destructive.
- **Richer range comments,** with colors, choices and switches.
- **Curve and SVG optimization filters:** like Simplify, but aimed at SVG output (fewer and simpler paths for hatching and stipple).
- **Group frames** (plain, Excalidraw-style) beside boards; per-board grids and snapping.
- **Sequencing scenes,** and cameras separate from boards (a view that travels across several boards).
- **Rendering cache:** keep each mark's rendering until it changes. Panning a drawing of about 20 heavy marks runs near 30 fps, with redraws around 20 ms.

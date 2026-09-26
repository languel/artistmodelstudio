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
  - Planes close smoothly: overshooting ends are cut and the seam relaxed.
- **Running a score** (Score panel, a generated candidate, an agent) draws into the active board and replaces that board's marks. The other boards and the blackboard stay.
- **Naming:** project > scene > board > stage and marks. New project starts over (after offering to keep the current one in Assets); New scene adds a drawing.

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
- **Page** (Export → Page): the drawing as one HTML file.
  - Each board is a section: title, picture, process view, replay, its text (Markdown, written in Properties) and its code with live sliders.
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

## Exports

From the menu:
- **PNG:** the picture view or the process view.
- **SVG:** one group per stage, and each element's full record in `data-ams-*` (it re-imports losslessly).
- **p5.js zip:** re-runs the score. P toggles the process view, 1–9 show the stages, R reseeds.
- **Process sheet:** a PNG of the stages and the decisions.
- **Process JSON.**
- **Excalidraw:** round-trips to underscores through `customData.ams`.

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
- **A direct point editor** building on the points view.
- **Richer range comments,** with colors, choices and switches.
- **Curve and SVG optimization filters:** like Simplify, but aimed at SVG output (fewer and simpler paths for hatching and stipple).
- **Group frames** (plain, Excalidraw-style) beside boards; per-board grids and snapping.
- **Sequencing scenes,** and cameras separate from boards (a view that travels across several boards).

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
| Docs | The documentation, with search and collapsible contents. Parts are generated from the code: brushes, vocabulary, exercises, tools. It also holds the walkthroughs, the Lessons (each with Build the scene and Take the tour) and the training estimator. |
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
- *Lesson: sampling Seurat and Munch*, *Lesson: diffusion models* and *Painterly, fading strokes (Klee)*: build the lesson as a scene (or open it, when it is already there) and walk through its slides; the painterly one builds a scene with Senecio as a source and shows the painter, its sliders, performance and an effect.

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
- **Drawing:** Settings → Drawing (or right-click the grid button) has Smoothing and Simplify.
  - **Lazy** is a toggle per tool: right-click Line, Plane, Gesture or Brush, set Pen to Lazy, and adjust Laziness (screen pixels, 0 to 120, 40 by default). It is a string between the cursor and the pen. Catch up (On by default) eases the pen to a still pointer, so the line reaches the cursor; Off leaves it where the string left it. Wobbles shorter than it never reach the line, and corners get rounded.
  - **Smoothing** (0 to 0.95) is how much the pen holds back each step: 0.5 covers half the distance, so higher is smoother and lags more.
  - **Simplify** (screen pixels, 0 = off) keeps only the points the line needs, live while drawing: how far the shape may move from what your hand did. With Points on, the stroke being drawn shows its kept points.
  - Planes close smoothly: overshooting ends are cut and the seam relaxed.
- **Running a score** (Score panel, a generated candidate, an agent) draws into the active board and replaces that board's marks. The other boards and the blackboard stay.
- **Naming:** project > scene > board > stage and marks. New project starts over (after offering to keep the current one in Assets); New scene adds a drawing.

## Drawing and editing points

- **Point by point:** with a drawing tool, click without dragging; each click adds a point. Double-click or Enter finishes, clicking the first point closes, Backspace removes the last point, Esc finishes.
- **Closing:** a line drawn back to its start closes itself.
- **Smooth or straight:** ` makes the path straight and ~ makes it smooth (double-tap CapsLock flips it; it ends as it was). With a drawing tool the choice is the tool's state: the stroke being drawn takes it now and the next strokes keep it. With Select or Direct it is the selected marks'. Properties → Look → Path sets it too. Starting a new stroke lets go of the mark selected before it.
- **Laser pointer** (K, next to Pan): press and drag; a dot in the current stroke color (red when there is none) leaves a trail that fades out in about a second. It adds nothing to the drawing, the undo history or a take, and works anywhere, over locked stages and boards and while presenting. (The trail has its own overlay canvas, so the drawing is not redrawn for it.)
- **Gesture and guide** (under Line, on the same button; Shift+1 cycles line, gesture, guide): construction, shown in the process view and not in the picture. A gesture is the movement behind a form, drawn freehand. A guide is a straight segment when you drag (Shift snaps its angle); click without dragging to place one point by point, straight by default and smooth (a curved construction line) with ~.
- **Circle and rectangle** (under Plane, on the same button; Shift+2 cycles plane, circle, rectangle): drag a box. Shift keeps the sides equal (a circle, a square), Alt draws from the center, Ctrl snaps to the grid. Both make plane marks with the plane's brush, color and fill. A rectangle is four corners, or rounded ones (Rounded, 0 to 1, a pill at 1) baked into its points; a circle is Sides points (12 by default, 3 to 48) on the ellipse, round when its path is smooth and a polygon when straight. Right-click the Plane button while the circle or rectangle is in use to set Sides or Rounded; they stay for the next shapes.
- **At the pointer:** Shift+Space shows a radial menu of the current tools in a circle (a stack's members, all the brushes, all the sculpt tools, or the top-level tools from Pan or Laser). Hold the keys, move toward a tool and release to pick it; a click picks too, Esc or releasing in the middle cancels. Shift+right-click shows the current tool's settings at the pointer, for every tool. Ctrl+right-click opens stroke and fill together at the pointer, in one popup with three modes (the small icons at the top; they all have the same size, the colors carry over when you switch, and it opens in the mode you used last). Fields: a field, hue, opacity and hex for each side, one shared palette (a swatch goes to the side you touched last), ⇄ swaps them, the slash button makes either none. Disc: hue is the angle and chroma the distance from the middle, in OKLCH, so the distance between the two dots is how different the colors look; lightness is the bar at each side (left fill, right stroke); click the disc to move the nearer dot. Cube: the two colors as points in a see-through, spinning RGB cube, standing on its black corner with white on top; the points can sit inside it, the tiny dots at the corners snap, drag the empty space to turn it (flick to coast, double-click to reset), and a dragged dot stays under the pointer, sliding along your line of sight only as far as it must to stay inside. The fill is a solid rounded square everywhere (the chip, the field cursor, the dots) and the stroke a hollow one, as in the toolbar. Recent and Mine stay in the toolbar's picker. Ctrl+Shift+right-click opens the grid settings at the pointer: the grid, its color, and the paper (artboard) and workspace background colors, so you can adjust them on the spot.- **Tool settings:** right-click Point, Line or Plane (gesture and guide share the Line button; circle and rectangle the Plane button) for the brush, its settings, opacity, blend and path of new marks. They stay until changed.
- **Sculpt preview:** while Direct is active, or with Option held in any tool, the sculpt brush's ring, the curve it would act on (highlighted) and its control points show under the pointer; the points within the ring are larger and stronger.
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
- **Boards** (;, or the Boards panel) are artboards in one drawing, in order, like slides.
  - **The main board** is the old artboard at the origin, so every older drawing, score and training record is unchanged.
  - **Editing boards:** drag out more with the Board tool. A board's title selects it, moves it (with its marks) and renames it; its right-click menu exports it, trains on it, reorders or duplicates it.
  - **Which board a mark is on:** marks belong to the board they are drawn on. Outside the boards is the **blackboard**: kept, but in no board's picture.
  - **Training** uses the board marked with the dot in the Boards panel.
- **Board code** (Code → Board): a board's own score, run with the board as its artboard. Each run replaces its last run's marks, so the board is live while you edit or move its sliders.
- **Present** (Opt+Cmd+P): the boards full-window, with eased moves between them.
  - Keys: →, Space, ←, Alt+1–9, Esc.
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
    - **Drawing:** its picture, then ▶ (for a board that follows a moving source), Picture / Process / Replay, and its sliders, all below the picture. Under them, its code in one box with tabs: **Pseudocode** (a board's `pseudo`, when it has one), **Studio** and **p5.js**, with Copy. A click on a tab opens it; a click on the open tab minimizes the box to its bar of tabs. A board opens with its code minimized when its **Code** switch is on (below). On the page, a notes board's folded pseudocode and code callouts give way to that box.
    - **Markdown:** the document itself. `[[links]]` jump to boards on the page, and `![[embeds]]` show their pictures. A Markdown board titled "*Board* · notes" joins that board's section.
    - **HTML:** its page, in a sandboxed frame.
    - **p5:** ▶ below the sketch starts it in a sandboxed frame; its code box has p5.js (and Studio, when the sketch came from studio code).
  - The pictures of the sources the boards read travel inside the page and are sampled there, so sliders and Run work without the studio. Pose and hands still need the studio.
  - A page that opens with a document uses it as its header.
  - The studio's renderer is inside the page, and so is the drawing, so File → Open the page to keep working on it.
  - Two examples: `scripts/point-line-plane-demo.mjs` (a lecture after Kandinsky) and `scripts/senecio-report-scene.mjs` (the Senecio run report).
- **Performing:** Alt+1–9 go to a board (0, 1 and 2 are the point, line and plane tools); Alt+Shift+1–9 pick a brush slot; Ctrl+Alt+Shift+1–9 keep the active brush in a slot (Shift+2 cycles the plane stack).

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

**Textured brushes** (*charcoal, chalk, pencil, bristles, oil, marker, wash*) paint each mark into a small layer of its own, multiply the paper's grain into it and tint it. The grain is fixed to the paper, so crossing strokes share one tooth; a layer is kept while its mark (points, parameters, seed, color, zoom) stays the same, so a mark that only fades is a bitmap, not painted again. The kit has `k.paint(ctx, { key, bounds, draw(layer ctx), grain: { kind: 'paper' | 'canvas' | 'fibre' | 'noise', scale, strength, seed }, color, alpha })`, `k.dabs` (a tip stamped along the walk: `soft`, `flat`, `square`; size, flow, spacing, scatter, angle), `k.hairs` (bristles that lift off as the paint runs down), `k.wash` (a fill whose pigment gathers at the edge), `k.bounds`, `k.hash`. *Oil* is the painterly stroke: dozens of hairs packed into one body of paint, with streaks, a taper and ragged ends. Where there is no canvas (a test), a textured mark is simply not drawn; and when the browser takes canvases' contents away (memory, a hidden window), nothing is painted until they are back, then every kept layer is dropped and painted anew.

The *Painterly, fading strokes* demo (board menu → Draw from a source) repaints a source continuously with `oil`: layers of strokes, big to small, each starting where a coarse model of the live strokes differs from the source, following the forms, taking the source's color across its width, stopping where the color turns, drawing itself on and fading out on a time envelope. Each of its four layers sees the source blurred as much as its brush is broad, looks at the picture in blocks the size of the brush, and paints a block once per lifetime; the first layer always paints (the underpainting) and the paper is toned to the source's mean color, which is what keeps it from decaying as strokes fade. Its code is plain board code with sliders (tolerance, speed, linger, stop) and the brush and its parameters at the top; a fifth, finer layer is one more line of the layer table (closer to the source, about twice the marks). It exports to p5.js with the same brushes (*Convert to p5.js* on the board), and a report on how close it gets, on three Klee paintings, is in `exports/klee-painterly/report.html` (`scripts/klee-painterly-report.mjs`, `experiments/klee-painterly/`).

**Performance.** A textured mark is painted once (its layer is kept); after that drawing it is a lookup and a blit. Fading changes its opacity and drawing on is a clip along the stroke, so neither paints again. The canvas draws only what is in view, redraws marks that fade or draw on at most 15 times a second (about a fifth of the main thread), and does not animate marks that only stay. Layers are painted smaller while the cache is short of room. The board's performance line (View → performance under boards) reads `runs a second · code ms · d(raw draw ms) · marks · layer MB`. The painterly demo has sliders for what it costs: `density` (strokes alive), `detail` (layers), `size` (brush), `fade` and `drawOn` (0: nothing animates, the biggest single saving). Numbers and method: `docs/notes/painterly-performance.md`.

**Masks.** Marks are free objects on the page, and a brush's width reaches past its points, so a mark near a board's edge spills over it: marks from you, from agents and from code all may. A board can be **masked** (the mask glyph in its Properties, *Mask to board* in its menu, or `mask()` in its code): its marks are cropped to the board, the default mask being the board's own rectangle. Only the marks that reach over the edge pay for a clip, and an unmasked board pays nothing.

**Time envelopes**: any mark can carry `time: { in, hold, out, life, draw, curve, loop }` (seconds) and a `born` time (epoch ms, set when it is made). The renderer fades it by its age at the view's clock, draws its stroke on along its length (`draw`), and drops it when `life` is over; a number is a fade out. The canvas keeps redrawing while any mark still changes, then stops. In code: `line(pts, { time: { in: 0.3, out: 2 } })`, and a brush reads `k.age`. Exports and the p5 sketch carry the same code (`envelope.js`, `texture.js` are embedded).

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

Right-click the Sculpt button (Ctrl-click on a Mac) for the brush's settings: a Tool picker, Radius, Strength and the tool's own settings. Push, Grab, Pinch and Twist have a **Detail** setting, how many points a stretch may add: 0 moves only the points that exist (Grab starts there), 1 is the usual, 2 twice as many. Click the button again, or Option+right-click it, for the list of tools.

| Tool | Does | Alt | Cmd (the opposite tool) |
|---|---|---|---|
| Push | points follow the cursor | | |
| Grab | picks up the points under the brush and moves them | | |
| Smooth | points move toward their neighbours; pressure evens out too | | Jitter |
| Relax | evens out spacing without changing the shape | | Pinch |
| Pinch | points gather toward the cursor | inflate | Relax |
| Twist | points turn around the cursor | other way | |
| Jitter | a seeded tremor | | Smooth |
| Simplify | fewer points, same shape (tolerance) | | Resample |
| Resample | more, evenly spaced points along the curve (along the segments, for a straight mark), graded by the falloff (density) | | Simplify |
| Thicken | raises pressure, so pressure-aware brushes draw wider | thinner | thinner |

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

`circle(cx, cy, r, n = 48)` and `rect(x, y, w, h, round = 0)` return point lists for `line()` and `plane()`. `round` (0 to 1, 1 a pill) bakes rounded corners into the rectangle's points: draw it with `path: 'straight'`. The Circle and Rectangle tools make the same marks by hand.

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

- **Streams as assets:** every clip in the list is also an asset (Assets › Streams, by group): a reference of about 100 bytes (the address, the size, the in and out points), with a card and no media kept. Drag one onto the canvas, or double-click it, to start it as a source with a board and its controls (the same board again if it is already in the scene). An address you type in the Sources panel is kept as a stream asset too, to drag into any scene.
- **Asset properties:** select an asset in Assets and Properties shows it: title, folder, tags and rating, and for a stream its address, size, in and out (seconds), note, licence and author. A stream, a video or a GIF also has **Starts with**: the speed, loop, volume and how it shows under its board (opacity, blend, fit) that a new source gets when the asset is dragged into a scene. All of it is kept in the asset (in the browser), not in a source file; a scene already using the clip keeps what it had.
- **Stream a clip:** the **+ stream…** menu in the Sources panel lists clips to stream, cut to their moment (`src/workbench/streamSamples.js`; each is a Wikipedia / Commons `File:` page with optional `start` and `end` seconds, which become the in and out points): Maria's wink and the machine becoming Maria (*Metropolis*, 1927), Vertov's eye in the lens, the iris and the editor's table (*Man with a Movie Camera*, 1929), Fred Ott's sneeze, Méliès's heads, Lumière's cards, breakfast, factory and train, Edison's and Lumière's serpentine and butterfly dances (Annabelle, Loïe Fuller), Sandow, Dickson's greeting, Ruttmann's *Lichtspiel*, Duchamp's *Anemic Cinema*, Chaplin's *Recreation* and Keaton's *The Scarecrow*. All are public domain. Clips cut from a long film use the 240p version, because starting at minute 85 reads the file up to there. To add your own, put an entry in that file.
- **From an address:** the field at the bottom of the panel takes a URL to a video or picture, or a Wikipedia / Commons `File:` page (`https://en.wikipedia.org/wiki/File:Metropolis_(1927).webm`). Nothing is downloaded or kept: a video is **streamed** (the browser fetches what it plays) and only the address is saved; a picture is fetched once. For a wiki video the size menu picks which version to stream (240p, 480p, 1080p, original): the smaller ones are re-encoded and much lighter (a 4 GB feature film streams at about 0.6 Mbit/s at 480p). The licence and author come with the file (in the source's metadata and the log). The server must allow it (CORS, which Wikimedia does); one that does not gives an error and leaves nothing behind. A movie waits on its first frame, and gets a preview board and a player like any clip. `ams_source add` takes `url` too. **Seeking far into a stream** (dragging the timeline to the middle of a feature) makes the browser read the file up to that point, because these WebM files have no index: at 480p about 150 MB for the middle of a 65-minute film, about 50 MB at 240p. Playing from where you are, or stepping, costs only what plays.
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
cam.face                          // [{ points: [{ x, y, z }] × 478, blend: { smile, jawOpen, blink, browUp… 0..1 }, box }]
cam.track('face')                 // any tracker by name: 'pose' | 'hands' | 'face' | 'mask'
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

### Trackers

A tracker reads a source's picture and gives back what it sees: `pose` (33 points per person), `hands` (21 per hand), `face` (478 points and 52 expression scores per face) and `mask` (where a person is). Any source can be tracked from board code, and only while code asks: `source('cam').face`, or by name, `source('cam').track('face')`. A face is `{ points, blend, box }`, in fractions of the board; `blend` has the model's scores (`jawOpen`, `mouthSmileLeft`, `eyeBlinkRight`…) and blends of them: `smile`, `frown`, `blink`, `browUp`, `browDown`, `squint`. Trackers are a registry in `src/perception/mediapipe.js` (`registerTracker(kind, { create, image, video, read })`): a new one is one entry.

To see and test a tracker: board menu → *Draw from a source* → **Face and expressions** (the face as lines, its expressions as bars) or **Pose lines** or **Fingertips**. In the Gestures panel, `expr: ['smile', 0.5]` is a condition on an expression, and `chin`, `lip.top`, `lip.bottom`, `mouth.left`, `mouth.right` are points. Face tracking is studio-only: a p5 export says so. The demo's code has `/* 0..1 */` sliders for the source under the board (`underlay({ source, opacity, blend, fit })`, a call any board's code can make), the tracker's markers (points and bars) and the abstract faces; 0 hides each. An early result, "accidental art", is kept in `notes/accidental-art-unicursal-faces.md`.

### Masks and effects

Two opt-in features for drawing boards, and a board that has neither is drawn exactly as before.

**Effects** are a stack of small image operations, and can sit in three places: on a board's picture (Properties → *Effects*, `fx([…])` in its code), on the source under it (*Source effects*, `underlay({ source, fx: […] })`), and on a mask (below). The stack is a list, in order, and each may be switched off:

| effect | does |
|---|---|
| Threshold `level, soft` | light above the level white, below it black (soft: a ramp) |
| Levels `black, white, gamma, outBlack, outWhite` | black point, white point, gamma, output range |
| Contrast, Brightness `amount` | more or less difference; lighter or darker |
| Invert | light becomes dark |
| Posterize `steps` | fewer steps of light |
| Gradient map `stops` | color by light: dark takes the first color of the gradient, light the last (stops are colors, or `[position, color]`; `#rrggbbaa` has alpha) |
| Blur `radius`, Pixelate `size` | soften; blocks |

A run of the first kind (everything but blur and pixelate) is compiled into a few lookup tables and applied in one pass over the pixels.

**Masks.** A board can be shown *through* something: Properties → *Mask*, or the board's menu → *Mask*, or `mask({ source: 'cam', mode: 'luma', invert: true, feather: 4, fx: […] })` in its code. What can be a mask: **any source** (a camera, a picture or clip from Assets, a stream, a board made a source with *Use as a source*: its output), or **a board of marks** (`{ board: 'Shape' }`). *Light* mode shows the board where the mask is light; *Alpha* mode where it is opaque; *Invert* flips it; *Feather* softens its edge; *Fit* is cover or contain; `res` (128 to 1024, default 512) is how many pixels across it is worked at. The mask has effects of its own (a threshold makes it hard-edged; a gradient map recolors it before its light is read), and they run before its light or alpha is taken.

**Make mask** (right-click marks): the selected marks move to a board of their own, `<board> · mask`, the same size, with the marks at the same places, and the board they were on is masked by it (alpha). Edit that board and the mask follows. A mask that cannot be had (its source is gone) lets the board show as it is. Marks of a board can also simply be cropped to its rectangle: the *Mask* glyph in Properties, or `mask(true)`: the default mask, the board's own shape.

**Cost.** Nothing is paid without a mask or effects. A composed board (its paper, its source, its marks, its effects) is kept until its marks, its source's frame or its effects change, and the picture before the mask is kept apart from the masked one, so a moving mask over a still board costs the mask and a copy: about 4 ms a frame for a live clip as a mask with a threshold, a blur and a gradient map on a board 1000 pixels across (a still mask, nothing per frame). Effects and masks are worked at about 900 and 512 pixels across and drawn up. PNG export and the clipboard honor masks and effects; SVG, p5 and the page's pictures do not yet, and neither do document, sketch and player boards.

### Boards as sources, and playlists

**Use as a source** (a board's menu → Board) makes a board a source: its picture (the source under it, then its marks), live and small, read by name from any board's code: `source('screen')`. So what one board shows is something others can draw from.

A **playlist** is a board of kind *Playlist* (board menu → *Add to playlist* → *New playlist*, or *Playlist* in Code → Board's kind menu). It is code, one call, and it has its own controls as well; both edit the same thing (the controls rewrite the code, so comments you add by hand are lost when you use them):

```js
playlist({
  target: 'Screen',            // the board that shows each item (a title)
  loop: true,                  // start again after the last
  items: [
    { stream: 'stream:metropolis-1927-maria-s-wink' },          // a stream asset (Assets › Streams)
    { asset: 'clip:muybridge-horse', for: 8 },                  // an asset: clip, GIF or picture; for: seconds
    { url: 'https://…', start: 12, end: 30, title: 'A clip' },  // an address (or a Wikipedia / Commons File: page)
    { source: 'cam' },                                          // a source already in the scene
    { board: 'Dots', for: 10 }                                  // any board: it runs alone and the view goes there
  ]
})
```

Media items are routed to the **target** board, which shows the source under its marks with its controls; each plays from its in point and, at its range's end (or after `for` seconds), the next begins. Fields: `title`, `start`, `end` (seconds), `quality`, `for`, `speed`, `loop: true` (keep looping, so only `for` advances), `stay: true` (a board item leaves the view where it is). The board has previous, play / pause, next, loop, a target menu and a list (go to, earlier, later, remove). Add things with the **+** on the playlist itself (a menu: a board, a source, a stream, a clip or picture, or an address), by dragging an asset onto it, from a board's menu (*Add to playlist*: the media it shows, or the board itself; several selected boards at once), or from the **+** in the Assets preview.

Chain them: a playlist routes clips to *Screen*, *Screen* is a source, and a drawing board reads `source('screen')`: a string of dance videos drawn as they play.

### Group selection of boards

**Shift+click** a board's title to add it to (or take it out of) the selected boards, or drag a **box** on the empty canvas: boards wholly inside it are selected (their marks go with them). Dragging any selected board's title moves them all, with their marks, as one undo step; Shift or Cmd+click a row in the Boards panel does the same selection. Frames carry the boards they hold.

### The Samples scene

`/samples` (or `app.buildSamplesScene()`) makes a scene with the stock samples (Assets › Samples) and the clips to stream, each on its own board with controls. The streamed ones are **lazy**: a board only starts reading its clip when it is live, on screen and big enough (at least 240 px wide on screen), so the zoomed-out overview streams nothing; a clip left unseen for half a minute is closed, and starts again at its in point when you come back.

### Redraw rate

Two speeds, set separately: the source's (Sources → speed: how fast a clip plays) and the board's (Properties → Board → **Redraw**: how many times a second its code runs). With Redraw at 0 a board following a source runs once per new frame of the source. With a rate (up to 60) it runs on its own clock, each run with fresh randomness: a slow GIF still gives dots, strokes and shapes that are drawn again and again, and a live `fit` carries on refining while the clip changes slowly. The demos (board menu → *Draw from a source*) set a rate of their own, take the source from under the board (it changes with each frame, the paper should not) and leave the ground alone: `fit` runs with `ground: false`. A p5 sketch exported from such a board draws at that rate, reseeded each frame.

### Media controls

Drag a clip or an animated GIF from Assets onto the canvas (or double-click it) and you get a source and a board previewing it, with **media controls** under the board: play / pause, a frame back and forward, a scrubber with the time and frame, and the speed (¼× to 4×). The controls belong to the board (its `controls` switch): they move and resize with it, and are not a board of their own. They work on the source, so every board that reads the source follows them. A picture or a camera has nothing to play, so it gets none.

Show or hide the controls from Properties → Board (the controls glyph, beside play) or the board's menu → Board → *Show / Hide media controls*. Hiding only hides them; playback is untouched. (Scenes saved before this have separate "player" boards; they still work.)

**Properties → Board → Media** mirrors all of it for the board's source: play / pause, steps, speed, the timeline with the time and frame, and (for a clip that can have sound) mute and volume, then how the source shows under the board: **Opacity**, **Blend** (multiply, screen, overlay… over the paper) and **Fit** (cover or contain). Clips are muted until you raise the volume; a movie added from Assets waits on its first frame for play, while a GIF plays at once. Hiding the player only hides it: playback is not touched, and a hidden player leaves no outline or title on the canvas.

Show or hide the controls from Properties → Board (the controls glyph, beside play, on a board that shows the clip or on the player itself) or the board's menu → Board → *Show / Hide media controls*. Hiding it hides the player board (a dashed outline marks where it is); showing it again brings it back, or makes one if there is none.

Cmd (or Ctrl) + click anywhere in a board, not only on its title, selects it and opens its Properties. That includes boards drawn as pages over the canvas (documents, HTML, p5 sketches, players): while Cmd is held they let clicks through. Over a mark, Cmd + click selects the mark (adding to the selection) and opens its Properties.

**Solo:** Opt+click a board's play / pause button (in the Boards panel or above the board) to run only that board and pause all the others; Opt+click it again to play them all. **Create board from selection:** the context menu of selected marks makes a board around them (with a margin), and the marks move into it.

### Board switches

Properties → Board has switches as glyphs beside its title (and the board's menu → Board):

- **Lock:** its marks cannot be selected, changed or drawn over, and the board cannot be moved or resized.
- **Hide:** not drawn and not run; a dashed outline marks where it is. Hidden boards are left out of the exported page.
- **Title:** hides the title above it (it shows while the board is selected, so it can still be moved). A board that runs keeps its ▶ / ⏸ there.
- **Code (minimize):** shown for a board with code. On an exported page its code box starts as a bar of tabs (Pseudocode, Studio, p5.js) and opens on a click; off, it starts open on the first tab (the pseudocode, when there is some).
- **Crop to board (mask):** its marks are cropped to the board (a mask the size of the board; see *Masks and effects*). Off by default: marks from you, from agents and from code may go past the paper.
- **Performance:** a line under it (see below). Only boards that show it are measured.

A board's menu also has **Mask** (show it through a source, or through a board of marks) and **Effects** (a stack of post effects on its picture); Properties has *Mask*, *Effects* and *Source effects* sections.

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
  - **Custom brushes** run as written: `brush()` keeps them, and `drawLine` / `drawPlane` / `drawPoint` hand a mark (`points` of `[x, y, t, p]` in pixels, `color`, `closed`) to the brush's `draw(ctx, e, p, k)` on p5's `drawingContext`. The kit is the studio's own: its walk (`frames`, `smoothPath`, from `walk.js`), `tracePath`, `segment`, `beginInk`, `rng` (seeded per mark), `noise`, `draw`, `source` (with `colorAt` / `valueAt` in pixels), and, for the textured brushes, its layer kit (`paint`, `dabs`, `hairs`, `wash`: `texture.js`, embedded). **The studio's textured brushes** (charcoal, chalk, pencil, bristles, oil, marker, wash) go in by name: a sketch whose code says `brush: 'oil'` carries the `oil` brush as it is, with the kit it needs. **Time envelopes** (`time: { in, hold, out, life, draw }`, `born`) work on every mark: it fades and draws on by its age (`envelope.js`, embedded), and expired marks are skipped. A still picture's pixels are read once (and an empty read, from a browser that took the canvas away, is not kept).
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

The Docs have a **Lessons** section: how lessons work, then one topic for each of *Pointillism and Expressionism, by sampling*, *Diffusion models*, *Painterly, fading strokes* and *Taking a line for a walk*. A topic has **Build the scene** (and **As p5.js**) and **Take the tour**. `src/workbench/lessons.js` lists the lessons and builds them (`buildLesson(app, id, { language })`); `/lesson` in the palette uses it too.

`examples/lessons/sampling/lesson.js` is a lesson as data: *Pointillism and Expressionism, by sampling*.
- **Sections:** *How we see* (five diagrams drawn by code: the eye, the retina as a mosaic, the cone curves, a pixel, then and now), then Seurat, Munch and Muybridge, each a public-domain source (`media/`, with `RIGHTS.md`), and *The body as a source* (pose, and a custom brush; ml5.js in the p5 versions).
- **Examples:** each is a board with an idea, pseudocode and code.
- **Scripts:**
  - `scripts/lesson-sampling-p5.mjs` writes each example as a p5 sketch (`exports/lesson-sampling/p5/`).
  - `scripts/lesson-sampling-report.mjs` writes the lesson as HTML pages: `report.html` (studio and p5.js in tabs), `report-studio.html` and `report-p5.html` (one language each; the p5.js page runs its sketches). Each example's code opens on its pseudocode; the *How we see* diagrams start minimized to the bar of tabs. It uses the board pictures saved from the studio.
- **As files:** `exports/scenes/` holds the lesson in both languages, the source demos and the Klee scenes as `.ams.json` scenes, with `sources.json` and `media/` (see its `README.md`; the folder is git-ignored).

Examples for teaching favor few, simple, smooth curves over dense point lists.

`/lesson sampling` (or `buildLessonScene(app)` from `examples/lessons/sampling/scene.js`) builds the lesson as a scene of 16:9 frames. `/lesson sampling p5` builds the same lesson with every board as a p5.js sketch (the pose boards load ml5.js). The scene has:
- a cover frame with the contents;
- an intro frame per section: its text beside its source picture;
- a frame per example: the 800×600 drawing beside its notes (the idea, and folded callouts with the pseudocode and the other language's code);
- the bibliography: the pictures' Commons pages, and the papers and books behind the history, with checked DOIs.

The boards are linked by `[[title]]`. The boards inside a frame have their titles hidden (the frame carries it), and the diagrams' code is minimized on a page.

### Diffusion models

`/lesson diffusion` builds *Diffusion models: from noise to picture* (`examples/lessons/diffusion/lesson.js`) with the same builder (`buildLessonScene(app, { lesson })`). A lesson is data: sections of boards, each with `code` (studio code) or `p5` (a p5.js sketch written by hand), `idea` and `pseudo`, and a bibliography in columns (a column may say its `page` and `width`). The lecture has:
- **Diagrams** (studio code, code minimized on a page): the two directions (forward noise, learned reverse), the noise schedule (linear and cosine), training (guess the noise), sampling (DDPM and DDIM), latent diffusion with a prompt and guidance, and the score field.
- **Simulations** (p5.js, sliders from the ranges in the code): noising a picture (t, schedule, seed); the forward process on a cloud of points; the reverse process with the exact score of six Gaussian blobs (steps, η from DDIM to DDPM, the score field, trails); sampling a picture with an ideal denoiser that knows three pictures (its weights snap to one as the noise falls); and classifier-free guidance (w = 0 ignores the class, w = 1 is the conditional model, larger w crowds the samples into one blob).
- **Bibliography** on two frames: origins (score matching), the diffusion papers (DDPM, DDIM, SDEs, improved DDPM, EDM), images, text and architecture (U-Net, VAE, guidance, CLIP, latent diffusion, DiT), and reading.

The simulations use the real DDPM / DDIM updates. The networks are replaced by the ideal denoiser, which is a formula for these toy data (a mixture of Gaussians; three pictures). A trained network only approximates it. `test/lessonDiffusion.test.js` runs them without p5 and checks that the samplers land on the data. Flow matching is the next lecture.

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

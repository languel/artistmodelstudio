/**
 * Documentation topics. Prose is written in a small Markdown subset; tables of tools, brushes,
 * the score vocabulary, exercises, walkthroughs and agent tools are generated from the code so
 * they never drift from it.
 */
import { h, esc } from './ui.js';
import { BRUSHES } from '../process/brushes.js';
import { FX } from '../process/fx.js';
import { SCRIPT_REFERENCE } from '../process/script.js';
import { EXERCISES } from '../process/exercises.js';
import { HARDWARE_PRESETS, MODEL_SPECS, estimateTrainingResources } from '../training/trainingEstimates.js';

export const DOC_SECTIONS = ['Getting started', 'Lessons', 'Drawing', 'Scores', 'Seeing and deciding', 'Models', 'Agents', 'Files and data'];

export { md } from '../process/markdown.js';
import { md } from '../process/markdown.js';

const prose = text => h('div', { html: md(text) });

/** Buttons for a lesson: build it as a scene (and p5 or expl version), and take its guided tour. */
const lessonButtons = (app, id, { p5 = false, expl = false, tour = null } = {}) => h('div', { class: 'wb-row wb-row-actions' },
  h('button', { class: 'wb-btn primary', title: 'Build the lesson as a new scene of slides', onclick: () => import('./lessons.js').then(m => m.buildLesson(app, id)).then(n => app.log(`The lesson is a scene: ${n} boards.`)).catch(err => app.log(`Lesson: ${err.message}`, 'error')) }, 'Build the scene'),
  p5 ? h('button', { class: 'wb-btn', title: 'The same lesson with every drawing as a p5.js sketch', onclick: () => import('./lessons.js').then(m => m.buildLesson(app, id, { language: 'p5' })).then(n => app.log(`The lesson is a scene: ${n} boards.`)).catch(err => app.log(`Lesson: ${err.message}`, 'error')) }, 'As p5.js') : null,
  expl ? h('button', { class: 'wb-btn', title: 'The same lesson with barebones copy-pasteable p5.js code (p5.js expl)', onclick: () => import('./lessons.js').then(m => m.buildLesson(app, id, { language: 'expl', expl: true })).then(n => app.log(`The lesson is a scene: ${n} boards.`)).catch(err => app.log(`Lesson: ${err.message}`, 'error')) }, 'As p5.js (expl)') : null,
  tour ? h('button', { class: 'wb-btn', title: 'A guided walkthrough, played with the real controls', onclick: () => app.walkthroughs.start(tour) }, 'Take the tour') : null);

const brushTable = ids => h('div', {}, ...ids.filter(id => BRUSHES[id]).map(id => {
  const b = BRUSHES[id];
  return h('div', { class: 'wb-doc-brush' },
    h('h4', {}, `${b.label} `, h('code', {}, id)),
    h('p', {}, b.doc, h('span', { class: 'wb-muted' }, ` Roles: ${b.roles.join(', ')}.`)),
    b.params.length ? h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Param'), h('th', {}, 'Range'), h('th', {}, 'Default'), h('th', {}, ''))),
      h('tbody', {}, ...b.params.map(p => h('tr', {}, h('td', {}, h('code', {}, p.key)), h('td', {}, `${p.min}–${p.max}`), h('td', {}, String(p.default)), h('td', {}, p.doc))))) : null);
}));

function estimator() {
  const state = { modelId: MODEL_SPECS[0].id, hardwareId: HARDWARE_PRESETS[0].id, sampleCount: 200, epochs: 3, precision: '4bit' };
  const out = h('div', { class: 'wb-doc-est-out' });
  const sel = (items, key, label) => { const s = h('select', { class: 'wb-select' }, ...items.map(x => h('option', { value: x.id, selected: x.id === state[key] }, x.name || x.id))); s.addEventListener('change', () => { state[key] = s.value; upd(); }); return h('label', { class: 'wb-row' }, h('span', { class: 'wb-row-label' }, label), s); };
  const num = (key, label, min, max) => { const i = h('input', { type: 'number', class: 'wb-inline', value: state[key], min, max }); i.addEventListener('input', () => { state[key] = Math.max(min, Number(i.value) || min); upd(); }); i.addEventListener('keydown', e => e.stopPropagation()); return h('label', { class: 'wb-row' }, h('span', { class: 'wb-row-label' }, label), i); };
  const upd = () => {
    const e = estimateTrainingResources(state);
    out.replaceChildren(...[['Duration', e.timeFormatted], ['Memory', `${e.totalMemoryGB} GB`], ['Throughput', `${e.effectiveTokensPerSec.toLocaleString()} tok/s`], ['Adapter', `${e.adapterWeightKB} KB`]]
      .map(([k, v]) => h('div', { class: 'wb-doc-stat' }, h('small', {}, k), h('b', {}, v))), h('p', { class: 'wb-muted' }, e.feasibilityNote));
  };
  upd();
  return h('div', { class: 'wb-doc-est' }, sel(MODEL_SPECS, 'modelId', 'Model'), sel(HARDWARE_PRESETS, 'hardwareId', 'Hardware'), num('sampleCount', 'Samples', 1, 100000), num('epochs', 'Epochs', 1, 50), out);
}

export function docTopics(app) {
  const T = (id, section, title, summary, body) => ({ id, section, title, summary, body });
  return [
    T('start-what', 'Getting started', 'What Artist Model Studio is', 'Creative coding for AI: teaching models to draw the way we teach people.', () => prose(`
Artist Model Studio is a training ground for **teaching models to draw and paint the way we teach humans**: through process, not finished images. It borrows from Klee's *Pedagogical Sketchbook*, Kandinsky's *Point and Line to Plane*, the algorists (Mohr, Verostko) and William Ngan's *Taking a line for a walk*.

A picture here is a **process document**: stages in order (analysis, concept, construction, structure, value, marks, notes), each mark with a role (point, line, plane, guide, gesture, note), a brush that realizes it, a reason (*why*) and an author (you, a script, a model, a policy).

## Three layers
1. **The process document**: the canonical record, portable as JSON, SVG and p5.js.
2. **Scores**: the same process as a short program in a point / line / plane vocabulary.
3. **Editors and agents**: the canvas, panels, models and MCP agents all write the same document.

## Why process
Training on finished images teaches surface texture. The studio keeps every step (what was decided, where, how and why) so models and students can be compared step by step, and so taste can be taught one decision at a time.`)),

    T('start-workflow', 'Getting started', 'Studio workflow', 'From a doodle to a trained decision policy, in seven steps.', () => prose(`
1. **Draw or write a score.** Draw with the tools, or run a score (Cmd+Enter). Exercises load from the Score panel or the palette (Cmd+K).
2. **Name the process.** Stages hold marks in order; the active stage receives new marks. Give marks a *why* in Properties.
3. **Look at the process.** Process view shows construction and notes; scrub or replay the stages in the Process panel.
4. **Keep it.** Cmd+S saves to Assets (IndexedDB) with tags and folders; export PNG, SVG, p5.js, Excalidraw or JSON.
5. **Ask models.** Generate asks an engine (Ollama, WebGPU, OpenRouter, an agent) for scores; the Assistant chats and acts through the studio's tools, visibly.
6. **Decide.** Analyze a reference and let a policy propose each step; your overrides become training labels.
7. **Train.** Keep the labels as a dataset in Assets, export JSONL, and train a local lev policy (Seeing and deciding → Training).`)),

    T('start-walkthroughs', 'Getting started', 'Walkthroughs', 'Guided lessons and tours, played with the real controls.', () => h('div', {},
      prose('Walkthroughs move the guide cursor to the real controls, run actions through the same tools agents use (logged and undoable), and sometimes wait for you. The narration card has Back, Pause, Next and Stop.'),
      ...app.walkthroughs.list().map(w => h('div', { class: 'wb-doc-card' }, h('div', {}, h('b', {}, w.title), h('p', { class: 'wb-muted' }, `${w.summary} (${w.steps} steps)`)),
        h('button', { class: 'wb-btn primary', onclick: () => app.walkthroughs.start(w.id) }, 'Start'))))),

    T('start-keys', 'Getting started', 'Keys and the palette', 'Shortcuts, the command palette, and the canvas.', () => prose(`
Every key can be changed in **Shortcuts** (menu, or Shift+Cmd+/): search, click a key and press a new one, + to add another, ↺ for the default. A key taken from another command moves.

| Key | Action |
|---|---|
| Cmd+K | Command palette: every command, panel, exercise, walkthrough and doc by name; or ask the Assistant |
| V H | Select, pan |
| O P A | Point, line, plane |
| E G T | Gesture, guide, note |
| F | Fit the artboard |
| \\ | Picture / process view |
| R | Reference underlay on / off |
| I | Eyedropper: pick a color from anywhere (the reference, the canvas, the whole screen in Chrome); it goes to the open picker, else the selection, else the current tool |
| Cmd+Z / Shift+Cmd+Z | Undo / redo (everything, including loads and agent actions) |
| Cmd+S | Save to Assets |
| Cmd+G / Shift+Cmd+G | Group / ungroup the selection (clicking a grouped mark selects its group; Cmd-click selects one) |
| Drag a frame corner | Scale (Shift keeps proportions, Alt scales from the center) |
| Drag a frame side | Stretch in one direction |
| Just inside (or outside) a corner | Rotate (Shift snaps to 15°) |
| Cmd+Enter | Run the score |
| Ctrl+Space | Complete (vocabulary, brush names in brush: '…', a brush's parameters) |
| Cmd+/ · Cmd+F | Comment lines · search in the score |
| Cmd+B, Opt+Cmd+B, Shift+Cmd+B | Toggle the left, right and bottom docks |
| ? | Docs |

Shift+double-click renames in place anything with a name: marks, groups and stages in the Outliner, boards (panel and canvas), stages, timeline tracks, and asset titles and folders (Enter keeps it, Esc puts it back). In the Outliner and the Boards panel a plain double-click frames the item on the canvas.

**Tool settings**: right-click the Point, Line or Plane button (or the gesture/guide button) for what its new marks will be: the brush and its settings, opacity, blend and path (smooth or straight). They stay for every new stroke until you change them (the same defaults as Properties with nothing selected).

**Direct selection** (Shift+V, sharing the Select button: filled arrow Select, outlined arrow Direct): edit points. Click a mark to show its points; click a point to select it (Shift adds), drag to move the selected points (Ctrl snaps, as Snap to says), drag on empty canvas to select points in a rectangle; double-click a segment to add a point; Delete removes the selected points (a mark left with too few goes too); Esc clears the point selection.

**Minimal p5** (Export → p5 (minimal code), a board's Export menu, right-click selected marks → Copy as → p5 code; ams_get p5min): the drawing as a short sketch.js of plain p5 calls, for teaching and code demos. For p5.js 2.x by default (Settings → Export → p5.js; 1.x uses curveVertex): lines are beginShape() with splineVertex (smooth) or vertex (straight), planes filled shapes, points circles, notes text; only the points that shape a line are kept (within 1 unit). Brush textures are left out (a comment names each mark's brush); the full p5 export re-runs the score with the studio's runtime instead.

**Point by point**: with a drawing tool, click without dragging and each further click adds a point (a rubber band shows the next segment); double-click or Enter finishes, clicking the first point closes the path, Backspace removes the last point, Esc finishes. Ctrl snaps each click. Double-tap CapsLock (it ends as it was, so typing is unchanged) to switch a path between smooth and straight: the stroke being drawn (dragged or clicked), or else the selected marks (one undo step).

**Snap while drawing**: hold Ctrl while drawing (line, plane, gesture, brush) and every point lands on the grid (its finest lines, major ÷ divisions), whether grid snap is on or not; repeated points are dropped and the points stay exactly on the grid. Ctrl works on the selection too: moving snaps the point nearest where you grabbed, and scaling snaps the edge or corner you drag (the marks' own edges; with Alt, both sides from the center). How it snaps is the Snap to setting (right-click the grid button): Grid, onto grid points (the default); Steps, in whole grid steps from where it started (scaling still lands on grid lines); Objects, onto the nearest point of another mark (within about 12 screen pixels; while drawing too). Right-click selected marks → Snap to snap them as an operation: points to the grid, points to the grid and tidied (repeated points merged, points on straight runs dropped), their position (top-left corner or center) with the shape unchanged, or quantized to a grid 2× or 4× as coarse. Agents use ams_snap.

**Workspace background** (Settings → Workspace, or type in the command palette): /background #1b1c1f (any color, with opacity), /background transparent or /transparent (the window shows what is behind it: for a see-through browser window used as an overlay on the desktop), /background default (the theme's). Other slash commands: /ui on|off, /present, /grid off|paper|all. Agents use ams_ui background. For an overlay, build the workbench as one HTML file (npm run build:single → dist-single/ams.html) and open it in a transparent browser window.

**Performance**: right-click the zoom control (or the command palette: performance readout) for frames per second while the canvas redraws, the last redraw in milliseconds, and the number of marks; a redraw slower than 16 ms shows in the accent color. ams_ui reports the last redraw too.

**Panel tabs**: drag a tab along its row to reorder it (kept); drag it away from the row to float the panel, and to a side to dock it. The left dock starts with Scenes, Boards, Stages, Outliner and Assets.

**The interface** is kept minimal: the tools island (top centre) and the menu island (top left: the menu, view, points, present, theme). Drag an island by its grip to move it; double-click the grip to put it back. Cmd+. hides all of the interface, leaving only the drawing (again to bring it back); the command palette (and ams_ui) shows or hides the tools, the menu island, the zoom controls or the panels one by one. Scenes, boards and stages live in their panels; right-click and Opt+right-click for properties.

**Scenes** (the Scenes panel): a project holds several drawings, each with its boards, its own undo and History, and its own Timeline; Assets, brushes and settings are shared. New, duplicate, reorder and delete scenes from the button's menu; Alt+PageDown and Alt+PageUp step through them, Opt+Cmd+N makes a new one. Opening a drawing from Assets (or a file) makes it a new scene, so the one you were working on stays as it was. Agents use ams_scene.

**Boards** (Shift+O, or the Boards panel): a drawing can hold several artboards, like slides. The main board is the artboard at the origin; drag out more with the Board tool. Drag boards in the Boards panel to reorder them (the main one stays first). A board's title sits above it: click it to select the board, drag it to move the board with its marks, double-click to frame it, Shift+double-click to rename it, right-click for export (PNG, SVG, process sheet, p5), training, order, duplicate and delete. The selected board's corner resizes it. Marks belong to the board they are drawn on; outside the boards is the blackboard, kept but in no board's picture. F fits the active board (Home frames it with an eased move, Shift+Home frames the selection); Alt+→ and Alt+← go to the next and previous board. Running a score (the Score panel, a generated candidate, an agent's score) draws into the active board: it replaces that board's marks, and the other boards and the blackboard stay; artboard(w, h) sizes that board. In a score, board('Title') makes a board (if new) and later marks land on it, in fractions of that board; board() goes back to the main one. Models learn from the board marked with the dot in the Boards panel (the main one unless you choose).

**Board code** (Code → Board, or a board's menu → Code): a board can have its own score. It runs with the board as its artboard (fractions of the board) and each run replaces the marks its last run made, so the board is live: edit the code, or move its sliders (a number with a range comment, like 0.4 /* 0..1 */, or Cmd-drag any number), and it redraws. The lightning button switches between running as you edit and Cmd+Enter only. On an exported page, a board's code comes with its sliders and reruns in the page. Agents use ams_board code.

**Performing**: 1–9 go to a board (animated), in present mode and out of it. Shift+1–9 pick a brush slot (the brush, its settings and the stroke color), Ctrl+Shift+1–9 keep the active brush in that slot; the Brush menu lists the slots. An agent can play alongside through the same tools (ams_active_brush, ams_board, ams_add).

**Present** (Opt+Cmd+P, or the play button top right): the boards full-window, in order, with eased moves between them. → or Space for the next board, ← back, 1–9 a board by number, Home and End, Esc to leave. You can still draw while presenting (Shift+drag sculpts, tool keys work), on the boards or on the blackboard between them. While recording, each move goes into the take's camera track, so the replay and the video follow the boards.

**Page** (Export → Page, or the page button in the Boards panel): the drawing as one HTML page, for a lecture, a blog post or a report. Every board with marks or text becomes a section: its title, its picture drawn by the studio's own renderer (switch to the process view, or replay how it was made), and its text (Markdown; select a board to write it in Properties). The page intro is in the Boards panel. The drawing travels inside the page: File → Open the page to keep working on it. Agents use ams_page.

**Lazy drawing** (Settings → Drawing, right-click the grid button, or Opt+right-click with a drawing tool): the pen trails the cursor on a string (Lazy, in screen pixels; 0 is off): wobbles smaller than the string never reach the line, and corners get rounded. Smoothing (0 to 0.95) is how much of the way the pen holds back each step: 0.5 covers half the distance, so higher is smoother but lags more. Simplify (screen pixels, 0 is off) keeps only the points the line needs, live as you draw: how far the shape may move from what your hand did. With Points on (') you see the kept points on the stroke being drawn. Right-click the grid button for the grid and these three in one place. It is an editor setting: it changes how your hand becomes points, not the marks. Planes close smoothly: where the lasso's start and end overshoot each other the tails are cut, and the seam is relaxed.

**Points** (' or the dotted-curve button top right): every mark's points as faint dots, brighter on the selection.

**Brush** (B): draw with the active brush. Click the Brush button again (or right-click it) to pick one: with marks selected, the picked brush goes onto them too (Cmd-click only picks it). The active brush keeps its settings: Opt+right-click, Properties and the sliders in Code → Brush change it (with nothing selected), until you change them again.

**Sculpt** (S, or Shift+drag over a mark with Select, Line, Plane or Gesture): reshape marks by brushing them: Push, Grab, Smooth, Relax, Pinch (Alt inflates), Twist, Jitter, Simplify (Alt resamples: more, evenly spaced points), Thicken (Alt thins; Cmd goes past the usual limit). With a selection only the selected marks change. [ and ] set the brush radius, Shift+[ and Shift+] its strength; the Properties panel has each tool's settings. Click the Sculpt button again (or right-click it) for the list. Sculpt tools are code: Code → Sculpt shows each one as sculpt({ id, params, step(pts, s, p, k) }), to fork or write your own.

**Opt+right-click** the canvas for the active tool's parameters as sliders: the sculpt tool's radius, strength and settings; the selected marks' brush; or a drawing tool's brush for new marks. Right-click a mark → Sculpt picks a sculpt tool for the selection.

**Parameters in code** become controls in the code editor. Each params entry (key: [min, max, default, 'doc']) gets a slider: in Sculpt it sets the value in use, in Brush it rewrites the default. Any number followed by a range comment, like 0.4 /* 0..1 */, gets a slider that rewrites it. Cmd-drag any number in the code to scrub it (Shift for fine steps).

**Right-click** a mark for its operations: arrange (front, forward, backward, back), move to stage, copy as SVG or PNG and add to Assets (as PNG, which opens again as a drawing, or SVG; cropped to the selection, transparent), brush, simplify (fewer points, same shape), duplicate, group, lock, hide, delete. Right-click the empty canvas for select all, fit, grid, snap, and a note there.

**Drag an asset** from Assets anywhere on the canvas: a picture becomes an image layer (move, scale and rotate it like any mark; it travels inside the drawing), a saved drawing comes in as a group of its marks. Image files can be dropped from the desktop too.

The **Outliner** lists every mark by stage and group: click to select (Shift for a range, Cmd to toggle), double-click to rename, drag to reorder or move into another stage or group, and hide, lock or delete from the row (acting on the whole selection when the row is part of it).

**Grid** (Settings → Grid): on the paper or everywhere, lines or dots, spacing and subdivisions (anchored at the artboard's corner), color, and **snap**: points, notes, guides and moved selections land on the subdivisions. Freehand lines stay free.

The canvas is infinite: doodle around the artboard. Only the artboard is the picture. Panels dock left, right or bottom, float and collapse; drag a tab to move it.`)),

    T('draw-roles', 'Drawing', 'Point, line, plane', 'The roles every mark has, after Kandinsky and Klee.', () => prose(`
| Role | Meaning | Default brush |
|---|---|---|
| point | a mark at a place: weight, tension, rhythm | dot |
| line | a point that moved: its time and pressure are recorded | ink |
| plane | an enclosed area, realized as tone, hatching or stipple | flat |
| guide | construction: axes, proportions (process view only) | guide |
| gesture | the movement behind a form (process view only) | guide |
| note | writing on the process (process view only) | none |

Construction (guides, gestures, notes) is never part of the picture: it shows in Process view and in the process sheet. Every mark also carries a *why* and a *by* (who made it).

## Look
Every element has an **opacity** and a **blend mode** (multiply, screen, overlay, darken, lighten, difference…) in Properties → Look, on top of its brush. Both carry into SVG exports. Look also sets the **path**: Smooth draws a curve through the mark's points (the default), Straight draws straight segments between them (in a score: line(pts, { path: 'straight' })).

## Color
Click a color swatch for the picker: a saturation and brightness field, hue and opacity, hex (8-digit hex keeps the opacity), palettes after Klee (Senecio, Castle and Sun, Twittering Machine), Kandinsky, Bauhaus, notebook inks and grays, your recent colors, and your own palette (+ adds the current color; right-click removes). The eyedropper button, or I, samples any pixel. The image button makes a palette from the reference (named after the nearest pigments). The hex field also takes names: *burnt sienna*, *payne's gray*, *crimson*, or any palette color's name.

Agents make palettes with \`ams_palette\`: *from_image* extracts one from the reference or an asset; *create* saves colors an agent chose, e.g. for "a palette that evokes a winter storm over craggy shores".

## Notes
Notes are writing on the page, in artboard units. Styles: **notebook** (handwriting straight on the paper), **sticky**, **index card**, **plain**. Choose the font (handwriting, printed hand, serif, sans, mono), size, wrap width and paper color in Properties; the text color is the note's color. On the canvas, drag a side of a note to re-wrap it, a corner to scale the lettering, and just inside a corner to rotate it.`)),

    T('draw-brushes', 'Drawing', 'Brushes', 'What each brush does, with its parameters.', () => h('div', {},
      prose('A brush only realizes a path: it never decides where marks go. Parameters are in Properties; the same values are options in a score (`line(pts, {brush: "hatch", spacing: 8})`).'),
      brushTable(['dot', 'ink', 'flat', 'hatch', 'stipple', 'guide']))),

    T('draw-textured', 'Drawing', 'Textured brushes and time', 'Brushes with grain, hairs and washes, painted through layers; marks that fade and draw themselves on.', () => h('div', {},
      prose(`
These brushes paint each mark into a small layer, multiply in the **grain of the paper** and tint it. The grain is fixed to the paper, so strokes that cross share one tooth, as on real paper. A mark's layer is kept while it stays the same, so a mark that only fades is a cheap picture, not painted again.`),
      brushTable(['charcoal', 'chalk', 'pencil', 'bristles', 'oil', 'marker', 'wash']),
      prose(`
## Make your own
The layer kit is in every brush (\`k.paint\`, \`k.dabs\`, \`k.hairs\`, \`k.wash\`, \`k.grain\`). A brush says what to paint, and the kit does the layer, the grain and the cache:

\`\`\`
brush({ id: 'sponge', roles: ['line'], params: { size: [4, 60, 20] },
  draw(ctx, e, p, k) {
    const fr = k.frames(e, 3, 0.5)
    k.paint(ctx, { key: k.hash('sponge', e.points, p, e.seed), bounds: k.bounds(fr, p.size),
      color: e.color || k.INK, grain: { kind: 'noise', scale: 0.5, strength: 0.9, seed: 2 },
      draw: l => k.dabs(l, fr, { tip: 'soft', size: p.size, flow: 0.4, spacing: 0.3, scatter: 0.8, rng: k.rng }) })
  } })
\`\`\`
Grain kinds: \`paper\`, \`canvas\`, \`fibre\`, \`noise\`. Tips: \`soft\`, \`flat\`, \`square\`.

## Time
A mark can carry a **time envelope**: \`line(pts, { brush: 'charcoal', time: { in: 0.4, hold: 2, out: 1.5, draw: 1 } })\`. Seconds: \`in\` fades it in, \`hold\` keeps it, \`out\` fades it out, \`life\` ends it (it is then dropped), \`draw\` draws the stroke on along its length, \`curve\` is \`smooth\`, \`linear\`, \`ease-in\` or \`ease-out\`, and \`loop\` repeats it. A plain number is a fade out over that many seconds. The mark's age (\`k.age\`) counts from its birth (\`born\`), and the canvas keeps redrawing while any mark still changes. Every brush fades this way, textured or not.

## Cost
A textured mark is painted once and then put on the picture as a bitmap, so a mark that fades or draws itself on costs a blit, not a repaint. What costs is the number of marks: about the same for each, drawn each frame. Marks that fade or draw on redraw at most 15 times a second; marks that only stay do not animate at all. The board's performance line (View → performance under boards) shows runs a second, the code's time, the draw's time (d), the marks and the layer cache (MB). In the painterly demo, \`fade: 0\` and \`drawOn: 0\` (nothing moves) halve the cost, \`density\`, \`detail\` and \`size\` set how many marks there are.`)))
,

    T('draw-masks', 'Drawing', 'Masks and effects', 'Show a board through any source, or through marks; a stack of post effects for sources, boards and masks. Opt-in.', () => h('div', {},
      prose(`
A board can be shown **through** something: Properties → *Mask*, the board's menu → *Mask*, or \`mask({ source: 'cam', mode: 'luma' })\` in its code. Any source can be a mask (a camera, a picture or clip, a stream, a board made a source), or a board of marks. *Light* shows the board where the mask is light, *Alpha* where it is opaque. Select marks and choose **Make mask**: they move to a board of their own and the board they were on is masked by it.

**Effects** are a stack of image operations on a board's picture (\`fx([…])\`), on the source under it (\`underlay({ source, fx })\`) or on a mask. Nothing is paid without a mask or effects; a mask that moves over a board that does not costs only the mask.`),
      h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Effect'), h('th', {}, 'Parameters'), h('th', {}, 'What it does'))),
        h('tbody', {}, ...Object.entries(FX).map(([id, d]) => h('tr', {}, h('td', {}, h('code', {}, id)), h('td', {}, d.params.length ? d.params.map(p => `${p.key} ${p.min}–${p.max}`).join(', ') : d.stops ? 'stops' : ''), h('td', {}, d.doc))))))),

    T('lessons-how', 'Lessons', 'Lessons as scenes', 'A lecture is a scene of slides: diagrams and examples as boards with code, notes, links, a bibliography.', () => h('div', {},
      prose(`
A **lesson** is a scene of 16:9 **frames** (slides). Each frame holds boards: a cover, an intro per section, then one frame per example with the **drawing** beside its **notes** (the idea, and folded pseudocode and code), and a bibliography. Boards link with \`[[titles]]\`; present the frames in order, or step with the arrow keys. The titles of the boards inside a frame are hidden (the frame carries it); a board that runs keeps its ▶.

- **Studio code or p5.js.** A drawing is a board with studio code (fractions of the board; marks you can select and export), or a board with a **p5.js** sketch. Any studio board converts to p5.js (board menu → Convert) and back. Sliders come from the ranges written in the code: \`const n = 40 /* 5..200 */\`.
- **Built from data.** \`examples/lessons/<name>/lesson.js\` is sections of boards (\`code\` or \`p5\`, \`idea\`, \`pseudo\`) and a bibliography; one builder (\`buildLessonScene\`) makes the scene. \`/lesson <name>\` in the palette builds it.
- **Code view.** On an exported page each board's code is one box with tabs (Pseudocode, Studio, p5.js); a click opens a tab, a click on the open tab minimizes it to the bar. A board's **Code** switch (Properties → Board) starts it minimized; the diagrams of a lesson do.
- **Pages and files.** Export → Page makes the lesson one HTML file whose sketches run; Export → Scene (JSON) writes it as an \`.ams.json\` to import again. Sources the scene reads (pictures, clips) are added by name first.`),
      prose('The lessons in this app, each with a guided tour (Getting started → Walkthroughs):'),
      ...[['lesson-sampling', 'Pointillism and Expressionism, by sampling'], ['lesson-diffusion', 'Diffusion models: from noise to picture'], ['lesson-painterly', 'Painterly, fading strokes (Klee)'], ['lesson-line-walk', 'Taking a line for a walk']]
        .map(([id, t]) => h('div', { class: 'wb-doc-card' }, h('div', {}, h('b', {}, t)), h('button', { class: 'wb-btn', onclick: () => app.openDocs(id) }, 'Read'))))),

    T('lesson-sampling', 'Lessons', 'Pointillism and Expressionism, by sampling', 'Seurat, Munch and Muybridge as sources: sample a picture, decide what to draw there.', () => h('div', {},
      prose(`
One idea throughout: **a picture is a function from a place to a color.** Sample it, and decide what to draw there. Seurat decides *a dot of pure color*. Munch decides *a stroke that follows the form, in the color of the feeling*. Muybridge's walk makes the picture move, and the same code follows it.

1. **How we see** (five diagrams drawn by code): light into the eye, the retina as a mosaic of receptors, three kinds of cones, three numbers to a pixel, then and now.
2. **Seurat: the dot:** sample a color at a place; dots on a grid; scattered dots; divisionism, pure colors only.
3. **Munch: the stroke:** strokes along the forms (a quarter turn from the change of light); color pushed toward feeling.
4. **Muybridge: the picture moves:** a pointillist walk and an expressionist walk, redrawn on every frame of the clip.
5. **The body as a source:** a gesture drawing from a pose model, and a custom brush that stamps Seurat's colors along the walking figure.

The pictures are public domain from Wikimedia Commons (rights recorded in \`examples/lessons/sampling/media/RIGHTS.md\`). Each example has pseudocode, studio code and p5.js, and the bibliography checks its references. The report script writes it as pages: one with both languages in tabs, one for the studio, one for p5.js (\`scripts/lesson-sampling-report.mjs\`).

- **p5.js (expl)**: Explicate mode for teaching. Barebones, copy-pasteable p5.js 2.x sketches (examples 1–8) without AMS wrappers, with hardcoded media sources ready to drop into [editor.p5js.org](https://editor.p5js.org/).`),
      lessonButtons(app, 'sampling', { p5: true, expl: true, tour: 'lesson-sampling' }))),

    T('lesson-diffusion', 'Lessons', 'Diffusion models: from noise to picture', 'Diagrams, then p5.js simulations with the real DDPM and DDIM updates, then the key papers.', () => h('div', {},
      prose(`
A diffusion model is trained to undo a simple process: adding noise to a picture a little at a time. From pure noise, run the undoing many times, and a picture appears.

**Diagrams** (studio code): the two directions; the noise schedule (linear and cosine); training as *guess the noise*; sampling (DDPM, DDIM); latent diffusion with a prompt and classifier-free guidance; the score as a field pointing to the data.

**Simulations** (p5.js; sliders in the code):
- *Noising a picture:* t, schedule, seed.
- *The forward process on points:* a spiral becomes a Gaussian cloud.
- *The reverse process, with an exact score:* six blobs, so the ideal network is a formula. Steps, η from DDIM to DDPM, the score field, trails.
- *Sampling a picture:* an ideal denoiser that knows three pictures; its weights snap to one as the noise falls.
- *Guidance:* w = 0 ignores the class, w = 1 is the conditional model, larger w crowds the samples into one blob.

The networks are replaced by the ideal denoiser, a formula for these toy data. A trained network only approximates it, and the difference is where real models go wrong. The bibliography (two frames, ids checked) runs from Sohl-Dickstein 2015 and score matching through DDPM, DDIM, the SDE view, latent diffusion, guidance and transformers. **Flow matching is the next lecture.**`),
      lessonButtons(app, 'diffusion', { tour: 'lesson-diffusion' }))),

    T('lesson-painterly', 'Lessons', 'Painterly, fading strokes', 'Klee repainted continuously: textured brushes, time envelopes, a layered painter, sliders, effects, p5.js.', () => h('div', {},
      prose(`
Classic AMS drew continuous, fading brush-stroke reconstructions of pictures. Here the same thing is **plain board code** with our own brushes, which you can open, change and export. Board menu → *Draw from a source* → *Painterly, fading strokes*.

- **Brushes.** Charcoal, chalk, pencil, bristles, oil, marker and wash paint each mark into a small layer with the grain of the paper, then blit it. See Drawing → Textured brushes and time.
- **The painter** (after Hertzmann). Four layers, big to small. Each sees the source blurred as much as its brush is broad, looks at the picture in blocks, and starts a stroke where the picture so far differs from it. The first layer always paints, and the paper takes the source's mean color, so quality does not decay as strokes fade. Strokes follow the forms, take the color across their width, and stop where it turns.
- **Time.** Strokes draw themselves on and fade out on an envelope, so the picture is always repainting.
- **Sliders:** density, detail, size, fade, draw-on, linger, tolerance, speed, stop. Fewer strokes and a longer fade are the cheap, live settings.
- **p5.js.** *Convert to p5.js* writes the same sketch with the same brushes. Live, the p5 and studio boards match in look and in number.
- **Effects and masks** are opt-in: a gradient map on the picture, a luma mask from another source (Drawing → Masks and effects).

The experiment behind it (three Klee paintings, five variants, error and SSIM against the source) is in \`experiments/klee-painterly/\`, with notes on performance in \`docs/notes/painterly-performance.md\`. Findings: stable for a minute; about a 24 × 24 mosaic in fidelity; chalk and bristles are more faithful than oil and charcoal; a fifth layer adds a little for double the marks.`),
      h('div', { class: 'wb-row wb-row-actions' }, h('button', { class: 'wb-btn primary', onclick: () => app.walkthroughs.start('painterly-klee') }, 'Take the tour')))),

    T('lesson-line-walk', 'Lessons', 'Taking a line for a walk', 'After Klee and William Ngan: whose line is it? Make your own line before you draw it.', () => h('div', {},
      prose(`
Klee: *an active line on a walk, moving freely, without goal.* Ngan asks: when a line is drawn by software, whose line is it? The lesson draws a walk with a changing pace (every point keeps its time), realizes it with brushes that read the pace (speed lines, restated, inner lines, dotted), then **defines a line of your own** with \`defineLine\` and asks you to trace a master's wire. The idea carries, not the mechanics: the walk never changed, only the function that turns it into marks. See Drawing → Line forms and your own lines.`),
      h('div', { class: 'wb-row wb-row-actions' }, h('button', { class: 'wb-btn primary', onclick: () => app.walkthroughs.start('line-walk') }, 'Take the tour')))),

    T('draw-lines', 'Drawing', 'Line forms and your own lines', 'After William Ngan: whose line is it? Line forms from the walk\'s speed, and defineLine.', () => h('div', {},
      prose(`
William Ngan's essay *Taking a line for a walk* (2016) asks: when a line is drawn with an app, **whose line is it?** The app maker's invisible hand guides the artist's. His answer: artists should create their own lines before they draw them. A line is a function of its walk.

Every line here records its walk: points with time and pressure. These forms read the hand's **speed** from it, so the same walk drawn slowly and in a hurry looks different.`),
      brushTable(['speed', 'restate', 'zigzag', 'inner', 'dotted', 'arcs']),
      prose(`
## Define your own line
A score can create a line and then draw with it. The definition is kept in the drawing (so it renders, exports to SVG, and appears in Properties):

\`\`\`
defineLine('teeth', { doc: 'bites where the hand hurried', params: { bite: [0, 60, 18] } },
  (ctx, frames, p, env) => {
    ctx.beginPath()
    frames.forEach((f, i) => {
      const o = i % 2 ? min(p.bite, f.speed * 2) : 0
      i ? ctx.lineTo(f.x + f.nx * o, f.y + f.ny * o) : ctx.moveTo(f.x, f.y)
    })
    ctx.stroke()
  })
line(walk({ from: [100, 350], steps: 60, step: 14 }), { brush: 'teeth' })
\`\`\`

*frames* are points along the walk: \`x, y\`, the normal \`nx, ny\`, the hand's \`speed\` and \`pressure\`. *env* has \`color\`, a seeded \`rng()\` and \`closed\`. Keep it to one idea: in code complexity is free and simplicity is elusive. The exercise *Line: whose line is it?* and the walkthrough *Taking a line for a walk* start here.

Line definitions are code: open drawings from people you trust.`))),

    T('draw-brushcode', 'Drawing', 'Brushes are code', 'Read, fork, write and share brushes; the brush kit.', () => prose(`
Every brush, the built-ins included, is a small program. Open **Code → Brush** to read one (or right-click a mark → Brush code); **Fork** a built-in to change it, or **New** to start from a template. The preview redraws as you type (a walk that is slow, then fast, then lingers, and a plane). **Save** (Cmd+Enter) keeps it in your library for every drawing; a drawing carries the code of every brush it uses, so it renders anywhere. **Use** puts it on the selection, or on the current tool.

\`\`\`
brush({
  id: 'ticks',
  label: 'Ticks',
  roles: ['line', 'gesture'],
  doc: 'Short marks across the walk, as long as the hand was fast.',
  params: { len: [1, 40, 10, 'Longest tick'] },
  draw(ctx, e, p, k) {
    k.beginInk(ctx, e, { width: 1, opacity: 1 })
    for (const f of k.frames(e)) {
      const r = Math.min(p.len, f.speed * 1.5)
      k.segment(ctx, f.x - f.nx * r, f.y - f.ny * r, f.x + f.nx * r, f.y + f.ny * r)
    }
    ctx.restore()
  }
})
\`\`\`

## The brush kit (k)
| | |
|---|---|
| \`k.frames(e)\` | the walk: \`{ x, y, nx, ny, speed, pressure }\` along the stroke |
| \`k.smoothPath(points, closed, n)\` | Catmull-Rom resampling |
| \`k.spans(poly, y)\` | where a horizontal line crosses a polygon (for fills) |
| \`k.rotatePts\`, \`k.tracePath\`, \`k.segment\` | geometry and strokes |
| \`k.beginInk(ctx, e, { width, opacity })\` | color, width and caps (end with \`ctx.restore()\`) |
| \`k.draw(id, ctx, e, params)\` | draw with another brush |
| \`k.rng()\`, \`k.noise(x, y)\` | seeded random and smooth noise |

*e* is the element: \`points\` ([x, y, time, pressure]), \`role\`, \`color\`, \`closed\`. *p* holds the parameters. Scores can define brushes the same way with \`brush({...})\`; agents use \`ams_brush\`.

Brush code runs in the page: open drawings and brushes from people you trust.`)),

    T('draw-stages', 'Drawing', 'Stages and the process view', 'Ordering the work, replaying it, and the process sheet.', () => prose(`
Stages are ordered layers with a kind: **analysis, concept, construction, structure, value, marks, notes**. Show, lock, rename and reorder them in the Stages panel; new marks go to the active stage.

The **Process** panel scrubs and replays the stages, shows a filmstrip, the decisions (question, options, chosen, why), every mark's reason, and the editing record. **Process sheet** exports all of it as one image for critique.`)),

    T('score-vocab', 'Scores', 'Score vocabulary', 'The point / line / plane language for writing processes as code.', () => h('div', {},
      prose(`Coordinates are **fractions of the artboard** (0..1 across and down) by default, so a score works at any size; \`width\` and \`height\` give the artboard's size, as in p5. \`units('artboard')\` switches to absolute units; older scores in absolute units are recognized and still run. A score is JavaScript with a small vocabulary. It runs in its own block, is seeded (the same seed gives the same drawing), and records its process: stages, decisions, reasons and the time order of its marks.`),
      h('pre', {}, h('code', {}, SCRIPT_REFERENCE)),
      prose('Options that are not element fields (`stage, brush, color, why, closed, pressures, seed`) are brush parameters. Scripted paths get synthetic time (16 ms per point) unless the point carries its own `[x, y, t]`.'))),

    T('score-sources', 'Scores', 'Sources and redraw', 'The camera, images and videos as streams code reads by name; redraw from them.', () => prose(`
The **Sources** panel lists the project's streams: the camera, and images or videos from Assets. Code reads them by name, fitted to the board (fractions of the board):

| | |
|---|---|
| \`source('cam').color(x, y)\` | the color there (\`rgb\`, \`value\` 0..1 too) |
| \`source('cam').pose\`, \`.hands\` | landmarks (MediaPipe), \`[{ x, y }]\` per person or hand |
| \`source('cam').mask(x, y)\` | 0..1: a person there |
| \`fit(source('cam'), { shapes, live })\` | redraw as plane marks (shape fitting) |
| \`k.source('cam').colorAt(x, y)\` | in brushes and sculpts, world units |

A board that **follows** its sources (the loop glyph in Code → Board) runs its code again on each new frame: with \`live: true\`, \`fit\` replaces a few shapes per frame, the continuous redraw. The redraw glyph in Sources sets it all up on the active board; the eye shows a source under a board.

A board's code exports as a p5.js sketch (the board's menu → Export → **p5 (its code)**): the code as written, the studio words it uses defined in p5, and its pictures in the zip.`)),

    T('score-exercises', 'Scores', 'Exercises', 'The syllabus: point, line, plane, rhythm, algorists.', () => h('div', {},
      prose('The same exercises for students and models, comparable stage by stage. Load one, read it, change a decision, run it again.'),
      ...EXERCISES.map(e => h('div', { class: 'wb-doc-card' }, h('div', {}, h('b', {}, e.title), h('p', { class: 'wb-muted' }, e.brief)),
        h('button', { class: 'wb-btn', onclick: () => { app.docks.open('script'); app.scriptPanel?.setSource(e.source); app.scriptPanel?.run(); } }, 'Load'))))),

    T('see-perception', 'Seeing and deciding', 'Perception', 'How the studio looks at a reference: values, regions, edges, direction, MediaPipe.', () => prose(`
**Analyze reference** (Decide panel) reduces the reference to what a drawing teacher points at:

- **Value masses**: k-means in Lab color, the share of the picture at each lightness.
- **Regions**: connected areas after smoothing, each with its place (upper left… lower right), size, value (light / middle / dark), hue name, edge activity (Sobel) and direction (structure tensor: orientation and coherence), and an outline polygon on the artboard.
- **MediaPipe** (optional, loaded from the CDN): a figure region from selfie segmentation and pose limbs, which can become gesture guides.

The regions are drawn over the canvas (toggle *Regions*). Everything runs in the browser.`)),

    T('see-decide', 'Seeing and deciding', 'Decide: System One decisions', 'A drawing as typed decisions a small local model can learn from you.', () => prose(`
Each step asks six typed questions, in TypeSafe *System One* form:

| Question | Type | Options |
|---|---|---|
| next | choice | look, block, structure, value, accent, stop |
| region | choice | the regions of the reference (≤ 12, unworked first) |
| technique | choice | flat, hatch, crosshatch, stipple, contour, walk, gesture, point |
| value | score | light, middle, dark |
| direction | choice | follow, across, vertical, horizontal, diagonal |
| density | score | very sparse … very dense |

A **policy** answers with probabilities: **Rules** (a transparent baseline), **lev / kev** (a local server), **Agent** (over MCP), or **You**. Click any option to override, then **Apply step**: a small executor realizes the step on the region, and every mark records the decisions behind it. **Run ×8** continues until the policy is less confident than *Ask me*.

## Labels
What you choose (*you*), what you accept after looking (*accepted*) and what an agent answers (*agent*) become labels in lev's format. Steps a policy applies alone are not labels. Keep them with **Save to Assets** (a dataset you can reopen and export), **Export JSONL**, or in development **Save to project**.`)),

    T('see-training', 'Seeing and deciding', 'Training a policy (lev)', 'Local training on Apple Silicon: suites, training, serving, evaluating.', () => h('div', {}, prose(`
[lev](https://github.com/franckverrot/lev) is LiquidAI's LFM2.5-350M with a LoRA and a pointer head: one forward pass answers every question with calibrated probabilities (about 25 ms for three questions).

\`\`\`
# 1. labels → suite (mixed with lev's own data so it keeps its general skills)
uv run --project ~/dev/lev python training/decisions/make_suite.py labels.jsonl \\
  --out training/decisions/suites/ams-v1 --mix ~/dev/lev/evals/v4/decision-v4 --mix-records 2000

# 2. train (Apple Silicon)
cd ~/dev/lev && uv run python -m lev.train --suite <suite> --base LiquidAI/LFM2.5-350M \\
  --accum 8 --epochs 3 --device mps --out runs/ams-v1

# 3. serve (the dev server proxies /__decide to port 8009)
uv run --extra serve python -m lev.serve --run runs/ams-v1 --port 8009

# 4. score it on held-out drawings
python training/decisions/eval_suite.py <suite> --url http://127.0.0.1:8009
\`\`\`

Measured here: about 0.35–0.45 s per training record on the GPU (3 epochs of 2,500 records ≈ 1 hour), 1.4 GB in memory to serve. Splits are per drawing, so a test score measures drawings the policy has not seen.

## Estimates for other models
The classic studio's estimator for LoRA training of language models (scores, captions):`), estimator())),

    T('models-engines', 'Models', 'Engines and models', 'Ollama, WebGPU, OpenRouter, OpenAI-compatible, and the agent.', () => prose(`
| Engine | Where it runs | Notes |
|---|---|---|
| Ollama | local server | any model you pulled; thinking is turned off for speed |
| WebGPU | in the browser | small ONNX models (e.g. LFM2.5) via transformers.js; first use downloads the weights |
| OpenRouter | hosted | favorites, free models and vision models (marked · image) |
| OpenAI-compatible | any server | LM Studio, llama.cpp, vLLM, MLX servers |
| Agent | an MCP client | Claude Code or another agent writes the answer (ams_pending / ams_answer) |

Pick the engine and model in Generate or the Assistant; *Custom…* takes any model id, ↻ refreshes the list.`)),

    T('models-generate', 'Models', 'Generate and the Assistant', 'Models writing scores, and a chat that acts through the tools.', () => prose(`
**Generate** asks an engine for scores (optionally with an exercise, or the reference image for vision models). Each answer is run, repaired once if it fails, and kept as a candidate you can open, save or read as a score.

**Assistant** chats with any engine and acts: its replies are JSON (\`{say, actions: [{tool, args}], done}\`) and every action runs through the same tools as an agent, with the guide showing it. Ask *How did you do that?* to replay the last session step by step.`)),

    T('record-timeline', 'Agents', 'Recording and the timeline', 'Record runs and walkthroughs as takes; review, edit, summarize, export.', () => prose(`
Two things record. **History** keeps everything: every change to the drawing, as it happens (its own capture button pauses it). The **Timeline** is what you produce: a take, recorded with its record button, or assembled by dragging in what you want: History entries, sound, text, saved drawings.

A **take** is the starting drawing, then clips on tracks. Tracks work as in a video editor: add as many as you need of any kind (+ Add → Track, or right-click a track), rename, mute (a muted track does not play or export), delete; drag clips between tracks of the same kind.

| Track | What it holds |
|---|---|
| Titles | title cards over the picture |
| Narration | captions |
| Drawing | each change to the drawing, revealed stroke by stroke (a hand-drawn stroke keeps its own timing) |
| Actions | the tools that were used |
| Camera | view keyframes (zoom and position), eased between |
| Audio | a sound or voiceover (played in the standalone player) |

**Recording.** Press record in the Timeline (or the palette, or \`ams_record\`). Walkthroughs record themselves, and so does agent activity (it stops after a quiet spell), so you can leave a run going and review it later. Takes are saved in Assets → Takes.

**Reviewing and editing.** Open a take from the Timeline's list (or double-click it in Assets): the canvas shows the drawing at the playhead, the pen at work and the captions. Clips are rectangles: drag to move, drag the right edge to retime (Shift for fine steps), double-click narration or titles to edit, right-click for speed, reveal and delete. The selected clip's timing, text, reveal and fades are in Properties. **+ Add** puts a title, a line of narration, a camera keyframe (the current view), a hold or an audio file at the playhead. Space plays; ⌘-wheel zooms.

**History** (bottom dock): click to select, Shift for a range, Cmd to toggle; the eye previews the drawing as it was after a change (Esc or any tool goes back); right-click to restore a state (undoable) or make a take; drag entries onto the Timeline to make clips (a hand-drawn stroke keeps its timing).

**Media:** Assets take sound (with a waveform), text and Markdown, SVG, and JSON (drawings and takes come back as themselves). Drag sound onto the Timeline for an audio clip, text for narration, a saved drawing for a clip that reveals it. Audio plays in review, in the standalone player and in video exports.

**Summary** makes a short-form cut: narration kept at reading pace, the drawing appearing briskly, analysis and waiting sped through, tool chatter dropped, and a hold on the result. **Walkthrough** turns a take into a live walkthrough (each line of narration a step; the drawing replayed, strokes traced by the guide).

**Export:** a **playable HTML** file (one file, no libraries; \`window.amsPlayer.seek(ms)\` and \`frame(ms)\` drive it for frame-by-frame capture), a **project** zip (index.html, player.js, take.json), a **video** (MP4 where the browser supports it, else WebM; recorded in real time at 1×, 2× or 4×), or the take as JSON.`)),

    T('agents-mcp', 'Agents', 'MCP tools', 'Every studio action as a tool for agents (WebMCP and the dev relay).', () => h('div', {},
      prose('The tools are on `window.ams`, on WebMCP where the browser supports it, and over the dev relay for Claude Code (`.mcp.json` registers `ams`). Start with `ams_vocabulary` and `ams_wb_state`. Any call may carry `narrate`: the text the guide shows.'),
      h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Tool'), h('th', {}, 'What it does'))),
        h('tbody', {}, ...(window.ams?.listTools?.() || []).map(t => h('tr', {}, h('td', {}, h('code', {}, t.name)), h('td', {}, t.description))))))),

    T('agents-guide', 'Agents', 'Visible automation and replay', 'The guide cursor, narration, pace, and recorded sessions.', () => prose(`
When an agent acts, a cursor travels to the control it uses, a halo marks the click, strokes are traced as they are made, scores are revealed stage by stage, and the narration card says what is happening. Set the pace on the card (Instant, Fast, Normal, Slow).

\`ams_layout\` opens and closes panels, expands or collapses docks, shows the reference, sets the view and finds assets, so every action happens where it can be seen. Walkthroughs use it, and put your layout back when they end.

Every agent session is recorded from a baseline copy of the drawing. \`ams_sessions {action: "replay"}\` (or *How did you do that?* in the Assistant) restores the baseline, replays each step with the guide, and leaves Undo pointing back to where you were.`)),

    T('files-exports', 'Files and data', 'Exports and round trips', 'PNG, SVG with the process inside, p5.js, Excalidraw, JSON.', () => prose(`
| Format | Keeps the process | Notes |
|---|---|---|
| JSON | everything | the process document itself |
| SVG | yes | stages as groups; the full record in \`data-ams-record\`, so it opens again as a process |
| p5.js (zip) | yes | the score re-runs in p5; keys P (process), 0–9 (stages), R (replay), S (save) |
| Excalidraw | stages and roles | edit in Excalidraw, open again here |
| Process sheet | as an image | stages, decisions and reasons on one page |
| PNG | no | the picture |`)),

    T('files-storage', 'Files and data', 'Where things are kept', 'Browser storage, Assets, datasets, and the project folder.', () => prose(`
Everything stays in your browser unless you export it:

- **The drawing** autosaves (localStorage); Undo covers loads and agent actions.
- **Assets** (IndexedDB): drawings, generations, imports, references and **datasets**, with folders, tags, stars and search. Export any asset; a dataset exports as JSONL.
- **Decision labels** (localStorage) until you save them as a dataset.
- **Layout, tool defaults, pace, model choices**: localStorage.
- In development, *Save to project* writes labels to \`training/decisions/labels/\` for the training scripts.`))
  ];
}

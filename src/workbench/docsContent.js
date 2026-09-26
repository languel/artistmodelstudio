/**
 * Documentation topics. Prose is written in a small Markdown subset; tables of tools, brushes,
 * the score vocabulary, exercises, walkthroughs and agent tools are generated from the code so
 * they never drift from it.
 */
import { h, esc } from './ui.js';
import { BRUSHES } from '../process/brushes.js';
import { SCRIPT_REFERENCE } from '../process/script.js';
import { EXERCISES } from '../process/exercises.js';
import { HARDWARE_PRESETS, MODEL_SPECS, estimateTrainingResources } from '../training/trainingEstimates.js';

export const DOC_SECTIONS = ['Getting started', 'Drawing', 'Scores', 'Seeing and deciding', 'Models', 'Agents', 'Files and data'];

/** Markdown subset: ## headings, paragraphs, - lists, 1. lists, | tables |, ``` code ```, `code`, **bold**, *em*, [links](url). */
export function md(src) {
  const inline = s => esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  const out = [];
  const lines = src.replace(/^\n+|\s+$/g, '').split('\n');
  for (let i = 0; i < lines.length;) {
    const l = lines[i];
    if (/^```/.test(l)) { const buf = []; i++; while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]); i++; out.push(`<pre><code>${esc(buf.join('\n'))}</code></pre>`); continue; }
    if (/^#{2,3} /.test(l)) { const n = l.startsWith('###') ? 4 : 3; out.push(`<h${n}>${inline(l.replace(/^#+ /, ''))}</h${n}>`); i++; continue; }
    if (/^\|/.test(l)) {
      const rows = []; while (i < lines.length && /^\|/.test(lines[i])) rows.push(lines[i++]);
      const cells = r => r.replace(/^\||\|$/g, '').split('|').map(c => c.trim());
      const body = rows.filter(r => !/^\|[\s:|-]+\|$/.test(r));
      out.push(`<table><thead><tr>${cells(body[0]).map(c => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${body.slice(1).map(r => `<tr>${cells(r).map(c => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
      continue;
    }
    if (/^(- |\d+\. )/.test(l)) {
      const ordered = /^\d/.test(l), items = [];
      while (i < lines.length && /^(- |\d+\. )/.test(lines[i])) items.push(lines[i++].replace(/^(- |\d+\. )/, ''));
      out.push(`<${ordered ? 'ol' : 'ul'}>${items.map(x => `<li>${inline(x)}</li>`).join('')}</${ordered ? 'ol' : 'ul'}>`);
      continue;
    }
    if (!l.trim()) { i++; continue; }
    const buf = []; while (i < lines.length && lines[i].trim() && !/^(#{2,3} |```|\||- |\d+\. )/.test(lines[i])) buf.push(lines[i++]);
    out.push(`<p>${inline(buf.join(' '))}</p>`);
  }
  return out.join('\n');
}

const prose = text => h('div', { html: md(text) });

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

**Brush** (B): draw with the active brush. Click the Brush button again (or right-click it) to pick one: with marks selected, the picked brush goes onto them too (Cmd-click only picks it). The active brush keeps its settings: Opt+right-click, Properties and the sliders in Code → Brush change it (with nothing selected), until you change them again.

**Sculpt** (S, or Shift+drag over a mark with Select, Line, Plane or Gesture): reshape marks by brushing them: Push, Grab, Smooth, Relax, Pinch (Alt inflates), Twist, Jitter, Simplify, Thicken (Alt thins). With a selection only the selected marks change. [ and ] set the brush radius, Shift+[ and Shift+] its strength; the Properties panel has each tool's settings. Click the Sculpt button again (or right-click it) for the list. Sculpt tools are code: Code → Sculpt shows each one as sculpt({ id, params, step(pts, s, p, k) }), to fork or write your own.

**Opt+right-click** the canvas for the active tool's parameters as sliders: the sculpt tool's radius, strength and settings; the selected marks' brush; or a drawing tool's brush for new marks. Right-click a mark → Sculpt picks a sculpt tool for the selection.

**Parameters in code** become controls in the code editor. Each params entry (key: [min, max, default, 'doc']) gets a slider: in Sculpt it sets the value in use, in Brush it rewrites the default. Any number followed by a range comment, like 0.4 /* 0..1 */, gets a slider that rewrites it. Cmd-drag any number in the code to scrub it (Shift for fine steps).

**Right-click** a mark for its operations: arrange (front, forward, backward, back), move to stage, brush, simplify (fewer points, same shape), duplicate, group, lock, hide, delete. Right-click the empty canvas for select all, fit, grid, snap, and a note there.

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
Every element has an **opacity** and a **blend mode** (multiply, screen, overlay, darken, lighten, difference…) in Properties → Look, on top of its brush. Both carry into SVG exports.

## Color
Click a color swatch for the picker: a saturation and brightness field, hue and opacity, hex (8-digit hex keeps the opacity), palettes after Klee (Senecio, Castle and Sun, Twittering Machine), Kandinsky, Bauhaus, notebook inks and grays, your recent colors, and your own palette (+ adds the current color; right-click removes). The eyedropper button, or I, samples any pixel. The image button makes a palette from the reference (named after the nearest pigments). The hex field also takes names: *burnt sienna*, *payne's gray*, *crimson*, or any palette color's name.

Agents make palettes with \`ams_palette\`: *from_image* extracts one from the reference or an asset; *create* saves colors an agent chose, e.g. for "a palette that evokes a winter storm over craggy shores".

## Notes
Notes are writing on the page, in artboard units. Styles: **notebook** (handwriting straight on the paper), **sticky**, **index card**, **plain**. Choose the font (handwriting, printed hand, serif, sans, mono), size, wrap width and paper color in Properties; the text color is the note's color. On the canvas, drag a side of a note to re-wrap it, a corner to scale the lettering, and just inside a corner to rotate it.`)),

    T('draw-brushes', 'Drawing', 'Brushes', 'What each brush does, with its parameters.', () => h('div', {},
      prose('A brush only realizes a path: it never decides where marks go. Parameters are in Properties; the same values are options in a score (`line(pts, {brush: "hatch", spacing: 8})`).'),
      brushTable(['dot', 'ink', 'flat', 'hatch', 'stipple', 'guide']))),

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

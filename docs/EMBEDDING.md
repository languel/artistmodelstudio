# Poliplan: the drawing editor as a component

**Poliplan** is the name of the lean embeddable build of the Artist Model Studio drawing editor: a drawing tool to drop into any page (780 KB, one iframe, the `ams-editor-v1` message protocol, a one-file client). `npm run build:embed` (alias `npm run build:poliplan`) builds it into `dist-embed/`; `npm run build:embed:full` is the chunky build with every studio panel, not Poliplan. Hosts so far: p5comp (`ams-editor-integration`), next Genereti. For now it lives in this repository, branch `embed-editor`, worktree `~/dev/artistmodelstudio-embed`; whether to spin it off into a repository of its own is open (it would take `src/embed/`, `vite.embed.config.js`, `scripts/sync-embed.sh` and the parts of `src/workbench`, `src/process` and `src/mcp` it uses, or stay a build target here, which keeps one editor to maintain). Names in the code (`embed`, `ams-editor`, `ams-editor-v1`) are unchanged.

# Embedding the drawing editor

Status: Phase 1, the client, and the p5comp spike (Phase 3) are built and working (branch `embed-editor`; p5comp on `ams-editor-integration`); phases 4 and 5 are next. Written 17 Oct 2026. First host: p5comp (`~/dev/arduino/p5comp`), second: Genereti (`~/dev/genereti`).

## The goal

Reuse the Artist Model Studio drawing editor (canvas, tools, brushes, sculpt, color pickers, boards, export) as a component in other projects, in place of Excalidraw. The editor is already the hard part; what is missing is a **boundary**: a way to start it inside someone else's page, give it a drawing, get a drawing, pictures and events back, and keep it from touching anything of the host's.

## What we found

- `Workbench` (`src/workbench/app.js`, 2.3k lines) and `CanvasView` (1.8k) are one program: the canvas, the docks (scenes, boards, properties, timeline, assistant, models, lessons…), persistence (`localStorage` keys `ams_*`, IndexedDB scenes), agent tools (`window.ams`, `src/workbench/mcp.js`) and about 80 imported modules. Pulling the canvas out of it as a library means untangling it from the docks and the stores. That is a refactor of the whole app, with a lot of regression risk, for no gain the host needs today.
- It already has the **right seams**: the document model is plain JSON (`src/process/document.js`: `ProcessStore`, `normalizeDocument`), rendering is a pure function (`src/process/render.js`: `renderToCanvas`, `renderDocument`), exports exist for PNG, SVG, JSON, p5, and **Excalidraw both ways** (`toExcalidraw`, `fromExcalidraw` in `src/process/exports.js`). Everything the UI can do is also a tool call (`window.ams.callTool`), so a bridge can drive the whole editor without knowing its internals.
- Genereti's current Excalidraw host is already an **iframe plus a `postMessage` channel** (`genereti-drawing-v1`: `load`, `scene-request`, `capture`, `output-size`, `edit-frame`, `ready`/`loaded`), with two named regions (an Image frame and a Mask frame) that become the node's IMAGE, MASK, SVG and JSON outputs. AMS boards are the same idea (rectangles with a size, a paper, marks and per-board export). So the integration shape is known and the host side exists.
- p5comp's own docs already say "AMS is a suitable eventual host" and keep the emulator and net graph independent of the UI. It has no drawing editor today (no Excalidraw), so it is the clean first test of the boundary: a host with no legacy to bend around.
- Weight (from `dist/` and `dist-single/`): the app chunk is 1.6 MB; mermaid and its diagram chunks about 3 MB, p5 1 MB, the in-browser model runtime a 27 MB WASM; the examples and lessons bundle videos, GIFs and JPEGs. The single-file build is 17 MB with the models left out. The editor itself is a small part of that. An embed build must leave out the lessons, bundled media, models and the Google Fonts links, and must not need a CDN at runtime (Genereti's rule).

## Decision: embed as a self-contained iframe app with a message protocol

Not a rewrite as an ES module library (yet).

1. **`embed.html`**: the same Workbench, booted in a *host mode*, built as a static folder (`dist-embed/`, relative base so it works under any path) and also as one file (like `build:single`).
2. **`ams-editor-v1`**: a versioned `postMessage` protocol (below). It carries documents, exports, events and a pass-through of the existing tool calls.
3. **`ams-editor.js`**: a zero-dependency ES module client the host imports. It creates the iframe, waits for `ready`, and gives promises and events: `editor.load(doc)`, `await editor.getDocument()`, `editor.on('change', …)`, `await editor.export({ board, format })`, `await editor.callTool(name, args)`.
4. **Delivery**: `scripts/sync-embed.sh <host-vendor-dir>` copies `dist-embed/` and the client into the host with a `VERSION` file. Hosts vendor the built artifact, never the source. (Later, the same folder can be an npm package.)

Why this and not the alternatives:

| Option | For | Against |
| --- | --- | --- |
| Iframe app + protocol (chosen) | Full editor on day one; isolated CSS, globals and storage; same model Genereti already uses; a host can be any framework or none; agents drive it through the existing tools | One iframe per instance (memory); keyboard focus, clipboard and drag-drop need forwarding; same-origin hosting for `postMessage` origin checks |
| ES-module `mountEditor(el, opts)` | Same page, no iframe | Needs the Workbench split from its docks and stores first; global CSS and `localStorage` collisions; large, risky refactor |
| Web component around the iframe | Nice API in HTML | Just a wrapper over the chosen option; can be added to the client later |
| Fork the canvas into a separate package | Smallest runtime | Two copies of the editor to maintain; loses everything the app adds (boards, brushes, sculpt, MCP) |

The module option stays open: if an iframe ever blocks a host, the host mode flags added in step 1 are exactly the seam to cut along.

## Host mode (what `embed.html` turns off and on)

Configured by the `init` message (and URL params for simple cases). Defaults are the minimal drawing editor.

- **UI**: tools island and zoom on; docks, menu island, timeline and docs off (zen's `hide-*` classes already do this); the host can ask for any of `tools`, `view`, `zoom`, `panels`. Everything stays reachable by shortcuts, context menus (including Ctrl+right-click colors, Ctrl+Shift+right-click grid, Opt+right-click parameters) and the radial menu. The command palette stays.
- **Storage**: `ns` (namespace) prefixes every `ams_*` key and the IndexedDB name, and `persist: false` (the default) means the editor never autosaves: the host owns the document. No scenes store, no assets store.
- **Content**: no bundled lessons, examples, walkthroughs, reference pictures, video or models; no agent relay; fonts bundled locally.
- **Look**: `theme` (dark | light | auto) and CSS variables for the accent and canvas; `background` (transparent allowed).
- **Boards**: the host can declare named boards (`{ id, title, width, height, ground }`) that cannot be deleted. Genereti's Image and Mask frames are two such boards; p5comp may want one.

## Protocol sketch (`ams-editor-v1`)

Every message is `{ channel: 'ams-editor-v1', type, id?, … }`. Parent and iframe check `event.source` and `origin`. Requests carry an `id` and get one `result` or `error` reply.

Host → editor: `init { ns, ui, theme, background, boards, persist, tools[] }`, `load { document }`, `loadExcalidraw { scene }`, `get-document`, `export { board, format: png|bitmap|svg|json|p5|excalidraw, scale, transparent }`, `call { name, args }` (any `ams_*` tool), `set-ui { … }`, `focus`, `fit`.

Editor → host: `ready { protocol, version, tools }`, `change { rev, reason }` (throttled; no payload, ask for the document when needed), `draft { active }` (a stroke is being drawn: at most once per frame while it grows and once more when it ends; no payload; a stroke is in the document only after the pointer is released, so a live host answers with `export { draft: true }`), `selection { ids }`, `tool { id }`, `result { id, value }`, `error { id, message }`, `key { combo }` (shortcuts the editor does not use, so the host's keys keep working; and the host's keys forwarded in when focus is outside).

Guarantees: documents are plain JSON (`normalizeDocument` on load, so older files migrate); `change` is cheap and `get-document` is the only expensive call; exports render off-screen and never include grid, selection or UI; a `rev` that only goes up lets a host skip stale exports.

## Phases

0. **This branch.** The plan (this file), no code. Branches created in AMS (`embed-editor`) and p5comp (a worktree, `ams-editor-integration`, so its uncommitted work on `main` is not disturbed).
1. **Host mode** in AMS: `src/embed/` (boot, config, bridge), `embed.html`, `vite.embed.config.js`, local fonts, a test page `embed-demo.html` with a host-in-a-page. Tests: protocol round trip (jsdom or the test-page driven through the preview browser), export parity with `renderToCanvas`, no network requests, no writes outside `ns`.
2. **Client library** `ams-editor.js` and a short API doc; `scripts/sync-embed.sh`; a size and load-time budget recorded in this file.
3. **p5comp spike** (worktree): vendor the build, add a "Draw" surface (a board next to Circuit and p5) that saves its document with the project and exports PNG or SVG into the sketch. Success: draw, save, reload, export, with the embed running from a plain `<script type=module>`.
4. **Genereti**: replace `editor/index.jsx` (the Excalidraw wrapper, `LICENSE-EXCALIDRAW.txt`, `scripts/build_editor.mjs`) and the parent bridge with the client. Image and Mask become declared boards of the configured sizes; IMAGE, MASK, SVG and JSON outputs come from `export`; old `.excalidraw` scenes open through `fromExcalidraw`, and `toExcalidraw` keeps the round trip. The Comfy node serves the vendored folder as static files. Check one iframe per node at realistic counts.
5. **Handoff for agents**: `docs/EMBEDDING.md` (this file, trimmed to what an integrator needs) plus an installable skill `ams-embed` that tells an agent in another project how to vendor the build, the client calls, the host-mode options and the checklist below. Written once Phase 2 settles the API.
6. **Only if needed**: an in-page `mountEditor` by splitting the Workbench into core and panels.

## Integrator checklist (becomes the skill)

- Vendor `dist-embed/` with `sync-embed.sh`; serve it from the same origin as the host page.
- One `ns` per host (and per editor instance when several share a page).
- Own the document: save the result of `getDocument()` with the host's project, `load` it back.
- Ask for exports instead of screenshotting; use `rev` to skip duplicates.
- Forward the host's shortcuts when the iframe has focus (`key` events) and focus the iframe on click.
- Never reach into the iframe's DOM; use `callTool` for anything the protocol lacks, and tell us what to add.

## Open questions

1. What should p5comp use the editor for first: a drawing board next to the circuit and p5 views, annotation over the circuit, or lesson figures? (This decides the first declared boards and the export it needs.)
2. How many editors does a Genereti workflow show at once? (Decides whether iframes are enough or Phase 6 matters.)
3. Where do host copies get updated from: this repo's `dist-embed/` by hand, a tagged release, or an npm package?
4. Does the editor ever need to run offline from `file://` (the single-file build already does) or only from the host's server?

## Phase 1 as built

Files: `embed.html`, `src/embed/{main,isolate,bridge,client}.js`, `src/embed/noSamples.js`, `vite.embed.config.js`, `embed-demo.html` (a host page for trying it), and in `src/workbench/app.js` the `embed` option of the `Workbench` constructor (`persist` off: nothing autosaved, no scenes store; the studio's samples moved to `src/workbench/samples.js`, which the embed build swaps for a stub).

Build and try:

```sh
npm run build:embed          # dist-embed/: embed.html, hashed assets, ams-editor.js (the client, one file)
npm run dev                  # then open /embed-demo.html (a host page with buttons for each call)
```

URL parameters of `embed.html` (the client sets them): `ns` (storage namespace), `origin` (the host's origin: messages from any other are ignored), `theme` (dark | light), `persist=1` (autosave under `ns`), `tools=0`, `zoom=0`, `guide=1` (agent cursor and captions, off by default).

Verified in the browser, from the dev server and from the built folder served by a plain static server (`python3 -m http.server`) next to a host page:

- `createEditor` gets `ready`, `init` declares boards (a main board titled `image` and a `mask` board of the same size), `fit` frames them.
- `export` gives PNG (with `scale` and `transparent`), SVG, JSON and Excalidraw; an unknown format is an `error`. `format: 'bitmap'` answers `{ bitmap: ImageBitmap }`, with no encode, for live views (it is carried by structured clone; `ids` exports stay PNG or SVG); a host falls back to `png` when an older editor answers "Unknown export format". `getDocument` returns the document with a `rev`; `callTool('ams_add', …)` draws; `loadExcalidraw(editor.export(…excalidraw).scene)` round trips; declared boards survive every `load`.
- `change` (throttled to 120 ms, `rev` only goes up), `selection`, `tool` and `key` (keys the editor did not use) reach the host.
- Storage: every `localStorage` key and IndexedDB name is under `ns:`; nothing is written to the studio's own keys; no scenes database is created; no autosave of the document; no request leaves the origin.
- Startup weight: two requests, a 2.1 MB script (about 720 KB gzipped) and an 85 KB stylesheet; the iframe's DOM is ready in about 130 ms locally. The rest of `dist-embed/` (about 13 MB) is lazy chunks that load only when used (Mermaid and its diagrams, p5, KaTeX fonts).

Known gaps (do before Phase 3 ships):

- `dist-embed/` still carries three pictures and a GIF from the lessons (`walk.gif`, `munch.jpg`, `seurat.jpg`): find the importer and stub it like the samples.
- Fonts: the studio's page loads Caveat, Patrick Hand and Newsreader from Google; the embed does not, so those faces fall back. Bundle them locally if the hand-lettered look matters to a host.
- Keyboard focus: the host cannot yet forward its own keys into the editor; the client's `focus()` and clicking the iframe are the only ways in.
- No automated test of the protocol yet (it needs a browser): the demo page is the manual check. A Playwright-style test of the demo page is the next addition.
- The main chunk includes the lessons and walkthroughs; splitting them out would cut the 2.1 MB.

## Phase 3 as built: p5comp (`~/dev/arduino/p5comp-ams`, branch `ams-editor-integration`)

The first use turned out to be **drawing directly on the circuit canvas**, so the protocol gained:

- `overlay: true` in `init`: the editor turns itself into a transparent layer (no workspace background, no grid, declared boards that draw nothing, no zoom control).
- `camera` (get or set `{ x, y, z }`, plus `w`, `h` when read) and a `camera` event for the editor's own pans and zooms. One convention for both sides: `screen = world × z + (x, y)`, which is also p5comp's circuit camera, so the host keeps the two together with a few lines (`DrawingBoard.follow` and `lead`).
- Pointer routing is the host's: the iframe has `pointer-events: none` until the host's Draw button switches the layer on.

p5comp's side (all in its worktree): `sim/DrawingBoard.js` (the layer, camera sync, persistence, export), a Draw button in the canvas tools, a Draw tab for the same editor over the whole area, `drawing` in the project snapshot, a transparent PNG as the `drawing.png` asset, `npm run vendor:ams`, and `docs/drawing.md`. `scripts/sync-embed.sh <dir>` here copies the build into a host. Verified in the browser: layer exactly over the stage, camera follows a circuit zoom, marks saved in the project, tab and overlay switch cleanly.

Notes for later hosts: the worktree was branched from p5comp's last commit, so it does not contain uncommitted work from the main checkout; the integration is one new file plus small edits to `Workbench.js`, `workbench.css`, `package.json` and `.gitignore`, so it ports as a patch. Vite's dev server will not `import()` a script from `/public`, so the client is read as text and imported from a blob in dev.

## Embed UI as of the second p5comp pass

`init` takes `dock: 'left'` (the tool and menu strips stack down the left edge, from `src/embed/embed.css`), and an embedded editor ignores its own saved UI (the host sets it with `ui` and `set-ui`; stray message keys are filtered). The docks stay off whatever is in storage unless the host asks for `panels`.

## Lean and chunky builds (started)

Embedding all of the studio works, but the host should not carry scenes, assistant, models, lessons, docs, timeline or the code panels. The seam is already there: `Workbench.registerPanels()` and the `mountX` imports in `src/workbench/app.js`. Plan: an `embed` build flag that swaps those panel modules (and the lessons, walkthroughs, sources, takes and model code behind them) for stubs through the same resolve plugin that already stubs `samples.js`, and a `features` list in `init` (`['editor']` by default; hosts may opt into `code`, `timeline`, …) so the main chunk drops from 2.1 MB toward the canvas, tools, brushes, sculpt and pickers alone. The assistant becomes its own thing: the tool surface is already `window.ams.callTool` (and WebMCP's `navigator.modelContext`), so a host's own agent calls `editor.callTool` / `listTools` today; the later step is to lift the assistant panel out into a floating agent that talks to any host through that same surface.

### As built

- `npm run build:embed` is the **lean** editor (`dist-embed/`): `embed.panels` limits what `registerPanels()` registers to Boards, Outliner, Properties, Settings, Shortcuts, History and Log (more by `features=id,id` in the URL, if the build has them), and `vite.embed.config.js` swaps the scenes, assistant, generate, decide, docs, timeline, sources, gestures and assets panels for stubs (`src/embed/stubs.js`). Panels stay hidden until wanted: opening one (Cmd+B, the palette) brings the docks back. `npm run build:embed:full` is the **chunky** build (`dist-embed-full/`) with every studio panel. `scripts/sync-embed.sh <dir> [full]` copies either. The lean main script is 1.97 MB against 2.15 MB for the chunky one: the stubbed panels were the smaller part. The rest is the studio's core (Workbench, canvas, recorder, scenes store, walkthroughs, sources, brushes) and the next cuts, in order of size: the lessons and walkthroughs, the code editor, the recorder and timeline code, the sources code.
- `init` takes `actions` (entries for the editor's right-click menu; a choice arrives as an `action` event with the selected ids) and `export` takes `ids` (just those marks as PNG or SVG, on no paper). p5comp uses them for "Save selection as PNG / SVG to assets".
- In overlay mode the editor leaves out the zoom control, the presentation menu and the zoom, fit and frame commands: the host's canvas owns the view.
- The host owns the interface: inside the embed, `setUI` is inert for the studio's own commands (zen on Alt+Z or Cmd+., the palette's show/hide commands, the `ams_ui` tool), so nothing but the host's `ui` / `set-ui` messages (and opening a panel) shows or hides the islands, zoom and docks. Keys the editor does not use, Alt+Z included, are forwarded to the host as `key` events.
- `mode` (client `setMode`): `overlay` (a layer over the host's canvas: the host owns the view and the interface, the studio's own show/hide commands are inert) or `standalone` (the editor on its own: zen, zoom, menu strip and panels work as in the studio). p5comp's Draw tab is standalone, drawing on the circuit is overlay. The host should send `mode` and then `set-ui` as one ordered chain (`DrawingBoard.applyUI`), because a late request can overtake an earlier one.
- Notes: Opt+right-click a note, or the Note tool, shows Font, Size and Style. `?noteFont=sans` (the default in the embed) is the lettering notes get when they name none, since the hand fonts are webfonts the embed does not load and the system's script font would stand in.

### The lean build, second pass (a drawing tool to drop in anywhere)

`npm run build:embed` now gives `dist-embed/` at **780 KB** (was 13 MB); its one script is 700 KB (235 KB gzipped, was 1.97 MB). What it has: the canvas and every drawing tool, brushes, sculpting, color pickers, boards, **Layers (the Outliner) and Properties** as panels (opened on demand: Cmd+B, the palette, the menu), the context menus (Arrange: bring to front, forward, backward, send to back), the command palette, Opt/Shift/Ctrl right-click popups, exports (PNG, SVG, JSON, Excalidraw, a selection as PNG or SVG), and the whole tool surface (`callTool`, 46 tools). What it leaves out: scenes, assets panel and samples, recording and takes, walkthroughs and lessons, sources, gestures, playlists, presentation, document and program boards (Markdown, HTML, p5), the assistant and its artists, docs, the code editor (CodeMirror), settings, shortcuts and history panels.

How: `vite.embed.config.js` lists the modules the lean build replaces with `src/embed/stubs.js` (`LEAN_STUBS`: inert objects whose methods do nothing, so the core's mentions of them keep working); `rangeInput` moved out of `codeParams.js` so sliders no longer drag CodeMirror in; the palette and slash commands hide what is not there; keys for save, open, scenes, docs, settings and presentation go to the host as `key` events. `AMS_EMBED_REPORT=1 npm run build:embed` prints what is in the entry chunk, biggest files first. The chunky build (`npm run build:embed:full`, 13 MB) is unchanged.

Verified on the built folder served by a plain static server, and in p5comp: drawing with the pen, `ams_add`, Arrange from the context menu, Outliner and Properties opening, exports (including a selection), undo, 46 tools listed, the palette trimmed, no console errors. Not cut yet (about 70 KB more is possible): `p5code.js` and the `?raw` module copies that `exports.js` embeds for the p5 export, `mcp.js` tools that only the studio uses.

Working copy: the embed branch is checked out as a git worktree, `~/dev/artistmodelstudio-embed`, so the studio's own checkout (`~/dev/artistmodelstudio`) stays on `main`. `node_modules` there is a copy-on-write clone of the studio's; run `npm install` in it if dependencies change.

### One toolbar (embedded editor)

The studio's two islands are one toolbar in the embed: the **menu** (≡) is first, and the view island's items (picture or process, reference, points, present, theme) are in its dropdown, with **Zoom controls** (zoom out, percentage, in, fit) as an optional group at the end of the toolbar, toggled from the same menu (kept per `ns`; off when the host owns the view, in overlay mode). In the lean build the menu is trimmed to the view items, Import, Export (PNG, SVG, Scene JSON, Excalidraw), the palette and the panels. **Layers (Outliner) and Properties** sit in the left sidebar, Properties after the Outliner. The studio itself keeps its two islands and the right-hand Properties.

Theme: `createEditor` defaults to `theme: 'host'`: the editor wears the host page's theme and follows it. The host theme is `window.theme` if set, else `data-theme` or `data-bs-theme` on `<html>`, else a `dark` or `light` class, else the system's preference; changes (attribute, class, or the system's) are sent on. `editor.setTheme('dark' | 'light' | 'auto')` pins it, `setTheme('host')` follows again; `hostTheme()` is exported for hosts that want to read it.

D toggles the drawing layer in p5comp. Alt+Z: in the Draw tab (standalone) it is the editor's zen; in overlay mode the editor passes it to the host as a `key` event, and p5comp uses it (also on the host page) to switch the drawing layer and its toolbar on and off.

### Optional overlay input passthrough

Hosts can initialize with `passthrough: true`. In overlay mode with Select active,
a pointer gesture that starts outside marks, transform handles, and board handles
is emitted as `pointer` messages (event type, iframe client x/y, pointer ID/type,
buttons, pressure, modifier keys). The gesture remains captured by the editor
until release; the host routes the sequence to its underlying content. Drawing
tools and the standalone editor retain their input. Space-drag keeps editor pan.

With no drawing selection, Delete/Backspace can reach the host. Undo/redo follows
the host after a passed gesture; otherwise drawing history remains local. Unused
keys emit `key` messages; keyup includes `event: "keyup"`; key events carry `repeat`. Hosts must filter by
active view and translate iframe coordinates to their own viewport.

`editor.selectBox({x,y,w,h,additive})` selects editable marks wholly enclosed by a
host's world-space marquee, including their group mates. It returns `{selected}`.
This lets an overlay host share box selection after a passed-through gesture.

`editor.key({event,key,code,repeat,altKey,ctrlKey,metaKey,shiftKey})` forwards a
host keydown/keyup to the editor, returning `{handled}`. Hosts must exclude text
editing and reserve their own shortcuts. Forwarded events do not emit `key`
back to the host, preventing an input routing loop.


## The score as signals (Poliplan, 25 Oct 2026)

A drawing's score (paths, travelers, events: see `docs/notes/score-namespace-plan.md`) is readable from the host and from `__` inside the editor. Signals are board-normalized: `x` and `y` run 0..1 across the board (y up), `u` is 0..1 along the path; a name is a mark's label, else its id; a name used on two boards is prefixed with the board title.

Host side (`ams-editor.js`):

```js
const stop = editor.subscribeScore({ names: ['lead', 'gate'], hz: 25 },
  frame => frame.features['lead.u'],          // { t, playing, features } at hz
  ev => console.log(ev.phase, ev.name, ev.x)); // entry | exit | cross | end | arrive | collide
await editor.readScore('lead');               // { t, features } now
await editor.recentEvents(0, 'gate');         // { events } since a sequence number
stop();
```

Features: travelers `<name>.x .y .u .speed .lap .active`; bodies `.x .y .r .vx .vy`; events `<name>.active`. Events carry `seq t name phase x y u lat dir speed traveler other tag`. No MIDI is sent to the host.

Inside the editor, `__.score` has the same: `read(name)`, `subscribe({names,hz,onFrame,onEvent})`, `recent(since,name)`, `features(t)`. The editor's `window.__` is in its own iframe window, so it never touches the host's.

Not yet: the host clock (the host driving the playhead), host writes to designated inputs, designated output ports, and the standalone runtime (see the plan).

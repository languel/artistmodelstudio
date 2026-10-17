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

Host → editor: `init { ns, ui, theme, background, boards, persist, tools[] }`, `load { document }`, `loadExcalidraw { scene }`, `get-document`, `export { board, format: png|svg|json|p5|excalidraw, scale, transparent }`, `call { name, args }` (any `ams_*` tool), `set-ui { … }`, `focus`, `fit`.

Editor → host: `ready { protocol, version, tools }`, `change { rev, reason }` (throttled; no payload, ask for the document when needed), `selection { ids }`, `tool { id }`, `result { id, value }`, `error { id, message }`, `key { combo }` (shortcuts the editor does not use, so the host's keys keep working; and the host's keys forwarded in when focus is outside).

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
- `export` gives PNG (with `scale` and `transparent`), SVG, JSON and Excalidraw; an unknown format is an `error`. `getDocument` returns the document with a `rev`; `callTool('ams_add', …)` draws; `loadExcalidraw(editor.export(…excalidraw).scene)` round trips; declared boards survive every `load`.
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

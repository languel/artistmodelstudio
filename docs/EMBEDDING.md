# Embedding the drawing editor

Status: plan (branch `embed-editor`). Written 17 Oct 2026. First host: p5comp (`~/dev/arduino/p5comp`), second: Genereti (`~/dev/genereti`).

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

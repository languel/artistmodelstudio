/**
 * Studio tools: everything a user can do in the app, as MCP tools.
 *
 * Each tool is { name, description, inputSchema, run(app, args) }. They are
 * merged into window.ams (webmcp.js), registered with navigator.modelContext
 * when the browser has it, and relayed to external MCP clients through the dev
 * server (vite.config.js → /__ams/*, src/mcp/mcpServer.js).
 *
 * Tools drive the real UI where a user would (select menus, buttons), so what
 * an agent does is what a user would see. ams_ui_* are generic escape hatches.
 */
import { EXAMPLES } from '../../examples/index.js';
import { buildP5Sketch } from '../export/p5Export.js';
import { AgentArtist } from '../artists/AgentArtist.js';
import { getAsciiText } from '../fitting/stylize.js';
import { CanvasRecorder } from '../export/recorder.js';

const S = (properties = {}, required = []) => ({ type: 'object', properties, required });
const str = (description, extra = {}) => ({ type: 'string', description, ...extra });
const num = (description, extra = {}) => ({ type: 'number', description, ...extra });
const bool = description => ({ type: 'boolean', description });
const CAND = { description: 'Candidate index (0-3), letter (A-D) or id; default: the active one', oneOf: [{ type: 'integer' }, { type: 'string' }] };

const sleep = ms => new Promise(r => setTimeout(r, ms));
const blobToDataUrl = blob => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result);
  r.onerror = () => reject(r.error);
  r.readAsDataURL(blob);
});

/** Set a control like a user would: value, then input + change events. */
function setControl(root, selector, value) {
  const el = root.querySelector(selector);
  if (!el) throw new Error(`Control not found: ${selector}`);
  if (el.type === 'checkbox') el.checked = Boolean(value);
  else el.value = String(value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return el;
}

function candidates(app) {
  return app.activeCandidates?.length ? app.activeCandidates : (app.sessionStore?.getCurrentCandidates() || []);
}

function findCandidate(app, ref) {
  const list = candidates(app);
  if (ref === undefined || ref === null || ref === '') return app.sessionStore?.getActiveCandidate() || list[0] || null;
  if (typeof ref === 'number') return list[ref] || null;
  if (/^[A-Da-d]$/.test(ref)) return list[ref.toUpperCase().charCodeAt(0) - 65] || null;
  return list.find(c => c.id === ref) || app.sessionStore?.findCandidate?.(ref) || null;
}

function summary(c, i) {
  return { index: i, letter: String.fromCharCode(65 + i), id: c.id, prompt: c.prompt, model: c.model, medium: c.medium, rating: c.rating || 0, actionCount: c.program?.actions?.length || 0, hasImage: Boolean(c.renderedImage) };
}

/** Run fn with confirm/prompt dialogs answered automatically. */
async function withDialogs(fn, { confirm = true, prompt = null } = {}) {
  const c = window.confirm, p = window.prompt;
  window.confirm = () => confirm;
  window.prompt = () => prompt;
  try { return await fn(); } finally { window.confirm = c; window.prompt = p; }
}

function assetInfo(a, withThumb = false) {
  return { id: a.id, title: a.title, tags: a.tags, rating: a.rating, kind: a.kind, folder: a.folder, width: a.width, height: a.height, created: new Date(a.created).toISOString(), hasProgram: Boolean(a.program), meta: a.meta || null, ...(withThumb ? { thumb: a.thumb } : {}) };
}

function liveState(app) {
  const lp = app.livePainter;
  const rp = app.referencePanel;
  return {
    running: lp.running, paused: Boolean(lp.paused), recording: lp.recording, shown: lp.shown,
    time: +(lp.t || 0).toFixed(2), visibleStrokes: lp.cf ? lp.visibleCount() : 0,
    render: lp.lastRender || rp?.live?.render, params: rp?.liveParams?.() || null,
    reference: rp?.current ? { id: rp.current.id, name: rp.current.name, live: Boolean(rp.current.live) } : null
  };
}

async function waitForIdle(app, timeoutMs) {
  const t0 = performance.now();
  while (app.abortController && performance.now() - t0 < timeoutMs) await sleep(100);
}

export const STUDIO_TOOLS = [
  // ---- state & UI -------------------------------------------------------
  {
    name: 'ams_get_state',
    description: 'Full studio state: engine, model, medium, canvas, aspect, variation, render options, side tab, theme, candidates, generation status, download progress, continuous mode, reference, assets folder.',
    inputSchema: S(),
    run(app) {
      const artist = app.getActiveArtist();
      return {
        engine: artist?.id, engineName: artist?.name, model: artist?.getModel?.() || '',
        medium: app.activeMediumId, canvasSize: app.canvasSize, aspect: app.canvasAspect, variation: app.variationLevel,
        renderOptions: { ...app.styleSettings }, sideTab: app.rightPaneTab || 'variations',
        theme: document.documentElement.dataset.theme || 'dark',
        generating: Boolean(app.abortController), downloadProgress: app.candidateGrid?.downloadProgress || null,
        activeCandidateId: app.sessionStore?.getActiveCandidate()?.id || null,
        candidates: candidates(app).map(summary),
        agentEngineWaiting: Boolean(app.artistRegistry.get('agent')?.waiting),
        live: liveState(app), assetsFolder: app.assetPanel?.folder || ''
      };
    }
  },
  {
    name: 'ams_screenshot',
    description: 'Image of what the main preview shows (the live/reference canvas when on screen, else the active candidate), or a given candidate. Returns a PNG data URL.',
    inputSchema: S({ candidate: CAND, source: str('preview (default) | candidate | painting', { enum: ['preview', 'candidate', 'painting'] }) }),
    async run(app, { candidate, source = 'preview' }) {
      const lp = app.livePainter;
      if (source === 'painting' || (source === 'preview' && lp.shown && candidate === undefined)) {
        const blob = await lp.pictureBlob();
        if (blob) return { image: await blobToDataUrl(blob), source: 'painting' };
      }
      const c = findCandidate(app, candidate);
      if (!c?.renderedImage) throw new Error('No rendered candidate');
      return { image: c.renderedImage, source: 'candidate', candidateId: c.id };
    }
  },
  {
    name: 'ams_set_tab',
    description: 'Switch the side panel tab.',
    inputSchema: S({ tab: str('variations | editor (Code) | log | reference | assets', { enum: ['variations', 'editor', 'log', 'reference', 'assets'] }) }, ['tab']),
    run(app, { tab }) { app.root.querySelector(`#tab-btn-${tab}`)?.click(); return { tab: app.rightPaneTab }; }
  },
  {
    name: 'ams_set_theme',
    description: 'Light or dark theme.',
    inputSchema: S({ theme: str('light | dark', { enum: ['light', 'dark'] }) }, ['theme']),
    run(app, { theme }) {
      if ((document.documentElement.dataset.theme || 'dark') !== theme) app.root.querySelector('#theme-btn')?.click();
      if ((document.documentElement.dataset.theme || 'dark') !== theme) document.documentElement.dataset.theme = theme;
      return { theme };
    }
  },
  {
    name: 'ams_ui_query',
    description: 'Escape hatch: describe elements matching a CSS selector (tag, id, text, value, disabled, visible, options).',
    inputSchema: S({ selector: str('CSS selector'), limit: num('Max elements (default 30)') }, ['selector']),
    run(app, { selector, limit = 30 }) {
      return [...document.querySelectorAll(selector)].slice(0, limit).map(el => ({
        tag: el.tagName.toLowerCase(), id: el.id || undefined, cls: el.className || undefined, text: (el.innerText || el.textContent || '').trim().slice(0, 200),
        value: 'value' in el ? el.value : undefined, checked: el.type === 'checkbox' ? el.checked : undefined, disabled: el.disabled || undefined,
        visible: Boolean(el.offsetParent || el.getClientRects().length), title: el.title || undefined,
        options: el.tagName === 'SELECT' ? [...el.options].map(o => ({ value: o.value, text: o.text })) : undefined
      }));
    }
  },
  {
    name: 'ams_ui_click',
    description: 'Escape hatch: click an element by CSS selector, or the first button/tab whose text matches `text`. Confirmation dialogs are accepted; `prompt` answers text prompts.',
    inputSchema: S({ selector: str('CSS selector'), text: str('Visible text of a button or tab'), prompt: str('Answer for a text prompt the click opens') }),
    async run(app, { selector, text, prompt }) {
      const el = selector ? document.querySelector(selector)
        : [...document.querySelectorAll('button, [role="button"], .side-tab-btn, .crumb, .folder-chip, option')].find(b => (b.innerText || b.textContent || '').trim().toLowerCase() === String(text).toLowerCase());
      if (!el) throw new Error('Element not found');
      await withDialogs(() => el.click(), { prompt });
      return { clicked: el.id || el.textContent.trim().slice(0, 60) };
    }
  },
  {
    name: 'ams_ui_set',
    description: 'Escape hatch: set an input/select/checkbox by CSS selector and fire input + change, as a user edit would.',
    inputSchema: S({ selector: str('CSS selector'), value: { description: 'New value' } }, ['selector', 'value']),
    run(app, { selector, value }) { const el = setControl(document, selector, value); return { selector, value: el.type === 'checkbox' ? el.checked : el.value }; }
  },

  // ---- engines & models ---------------------------------------------------
  {
    name: 'ams_list_engines',
    description: 'Available engines (artists) with their models.',
    inputSchema: S(),
    run(app) {
      return app.artistRegistry.list().map(a => {
        const art = app.artistRegistry.get(a.id);
        let models = [];
        try { models = (art.getAvailableModels?.() || []).map(m => ({ id: m.id, name: m.name, size: m.size })); } catch { /* ignore */ }
        return { ...a, active: a.id === app.artistRegistry.activeId, model: art.getModel?.() || '', models };
      });
    }
  },
  {
    name: 'ams_set_engine',
    description: 'Choose the engine (artist), and optionally its model, through the toolbar menus.',
    inputSchema: S({ engine: str('Engine id, e.g. mock, fitter, openrouter, openai, ollama, webgpu, trained, distilled, agent'), model: str('Model id') }, ['engine']),
    run(app, { engine, model }) {
      setControl(app.root, '#artist-select', engine);
      if (model) {
        const sel = app.root.querySelector('#model-select');
        if (sel && [...sel.options].some(o => o.value === model)) setControl(app.root, '#model-select', model);
        else app.handleModelChange(model, engine);
      }
      const a = app.getActiveArtist();
      return { engine: a.id, model: a.getModel?.() || '' };
    }
  },
  {
    name: 'ams_load_model',
    description: 'Download and load a WebGPU model ahead of generating (progress shows in the studio). Waits until ready.',
    inputSchema: S({ model: str('Model id; default: the WebGPU engine\'s current model') }),
    async run(app, { model }) {
      const art = app.artistRegistry.get('webgpu');
      const id = model || art.getModel();
      const t0 = performance.now();
      await art.preloadModel(id, p => {
        app.candidateGrid?.setDownloadProgress(p);
        app.statusBanner?.setDownloadProgress(p);
      });
      app.candidateGrid?.clearDownloadProgress();
      app.statusBanner?.clearDownloadProgress();
      return { model: id, dtype: art.activeDtype, seconds: +((performance.now() - t0) / 1000).toFixed(1) };
    }
  },

  // ---- canvas & render ------------------------------------------------------
  {
    name: 'ams_set_medium',
    description: 'Medium / render look (the toolbar Medium and the reference Render are one setting).',
    inputSchema: S({ medium: str('flat | watercolor | pixel | ascii', { enum: ['flat', 'watercolor', 'pixel', 'ascii'] }) }, ['medium']),
    async run(app, { medium }) { setControl(app.root, '#medium-select', medium); await sleep(50); return { medium: app.activeMediumId }; }
  },
  {
    name: 'ams_set_canvas',
    description: 'Canvas size (pixels on the long side) and/or aspect ratio ("1:1", "16:9", "ref" for the reference\'s own, any "w:h").',
    inputSchema: S({ size: num('Long side in pixels (64-8192)'), aspect: str('Aspect as w:h, or "ref"') }),
    async run(app, { size, aspect }) {
      if (size) await app.handleCanvasSizeChange(size);
      if (aspect) {
        const sel = app.root.querySelector('#canvas-aspect-select');
        if (sel && ![...sel.options].some(o => o.value === aspect)) sel.add(new Option(aspect, aspect), sel.options.length - 1);
        if (sel) sel.value = aspect;
        if (app.controls) app.controls.canvasAspect = aspect;
        await app.handleAspectChange(aspect);
      }
      if (size) { const s = app.root.querySelector('#canvas-size-select'); if (s && [...s.options].some(o => o.value === String(size))) s.value = String(size); }
      return { size: app.canvasSize, aspect: app.canvasAspect };
    }
  },
  {
    name: 'ams_set_variation',
    description: 'Variation spread for generation.',
    inputSchema: S({ level: str('low | medium | high | wild', { enum: ['low', 'medium', 'high', 'wild'] }) }, ['level']),
    run(app, { level }) { setControl(app.root, '#variation-select', level); return { variation: app.variationLevel }; }
  },
  {
    name: 'ams_set_render_options',
    description: 'Render options (the options popover): pixelCells, pixelPalette (full|pico8|gameboy|cga|bit1|gray8), pixelGrid, asciiRamp (standard|detailed|blocks|dots|minimal|binary|box|slashes|tetragram|cp437|petscii|braille|sextants|quadrants|custom), asciiCustom, asciiCols, asciiFont (system|jetbrains|ibmplex|firacode|sourcecode|spacemono|courier|vt323|pressstart|menlo|courierNew), asciiColor (color|mono), asciiInvert, asciiGrid, wcMode (sprites|layered).',
    inputSchema: S({ options: { type: 'object', description: 'Fields to change' } }, ['options']),
    run(app, { options }) { app.handleStyleChange(options); return { ...app.styleSettings }; }
  },

  // ---- generation ----------------------------------------------------------
  {
    name: 'ams_set_prompt_mode',
    description: 'Prompt mode: text | text+image (prompt + reference image) | image (reference only) | describe (model describes the reference into the prompt) | describe+image. Image modes need a model with image input.',
    inputSchema: S({ mode: str('Mode', { enum: ['text', 'text+image', 'image', 'describe', 'describe+image'] }) }, ['mode']),
    run(app, { mode }) { setControl(app.root, '#prompt-mode-select', mode); return { promptMode: app.promptMode }; }
  },
  {
    name: 'ams_describe_reference',
    description: 'Ask the current engine to describe the reference as a drawing prompt (vision models only). Returns the text without generating.',
    inputSchema: S(),
    async run(app) { const img = app.referenceImageDataUrl(); if (!img) throw new Error('No reference'); return { prompt: await app.describeReference(img) }; }
  },
  {
    name: 'ams_generate_round',
    description: 'Type a prompt and press Generate; waits for the round and returns the candidates. Uses the current engine unless one is given.',
    inputSchema: S({ prompt: str('Prompt (ignored by the image-only and describe modes)'), engine: str('Engine id'), model: str('Model id'), promptMode: str('text | text+image | image | describe | describe+image'), timeoutSec: num('Max wait (default 600)') }),
    async run(app, { prompt = '', engine, model, promptMode, timeoutSec = 600 }) {
      if (promptMode) setControl(app.root, '#prompt-mode-select', promptMode);
      if (engine) STUDIO_TOOLS.find(t => t.name === 'ams_set_engine').run(app, { engine, model });
      const input = app.root.querySelector('#studio-prompt-input');
      if (input) { input.value = prompt; input.dispatchEvent(new Event('input', { bubbles: true })); }
      const done = app.handleGenerate(prompt);
      await Promise.race([done, sleep(timeoutSec * 1000)]);
      return { candidates: candidates(app).map(summary) };
    }
  },
  {
    name: 'ams_candidate_action',
    description: 'Candidate buttons: select, variations, continue, critique (with feedback), compare_media, animate, start_over (clears the session).',
    inputSchema: S({ action: str('select | variations | continue | critique | compare_media | animate | start_over', { enum: ['select', 'variations', 'continue', 'critique', 'compare_media', 'animate', 'start_over'] }), candidate: CAND, feedback: str('Critique text (for critique)') }, ['action']),
    async run(app, { action, candidate, feedback }) {
      if (action === 'start_over') { await withDialogs(() => app.handleStartOver()); return { ok: true }; }
      const c = findCandidate(app, candidate);
      if (!c) throw new Error('Candidate not found');
      if (action === 'select') await app.handleSelectCandidate(c.id);
      else if (action === 'variations') await app.handleVariations(c.id);
      else if (action === 'continue') await app.handleContinue(c.id);
      else if (action === 'critique') {
        if (!feedback) throw new Error('feedback is required');
        await withDialogs(() => app.handleCritique(c.id), { prompt: feedback });
      } else if (action === 'compare_media') app.handleCompareMedia(c.id);
      else if (action === 'animate') await app.handleAnimateStrokes(c);
      return { action, candidateId: c.id, candidates: candidates(app).map(summary) };
    }
  },
  {
    name: 'ams_list_examples',
    description: 'Presets & examples menu entries.',
    inputSchema: S(),
    run() { return EXAMPLES.map((e, i) => ({ index: i, id: e.id, name: e.name, medium: e.medium, actions: e.program?.actions?.length || 0 })); }
  },
  {
    name: 'ams_load_example',
    description: 'Load a preset/example by index, id or name.',
    inputSchema: S({ example: { description: 'Index, id or name', oneOf: [{ type: 'integer' }, { type: 'string' }] } }, ['example']),
    async run(app, { example }) {
      const e = typeof example === 'number' ? EXAMPLES[example] : EXAMPLES.find(x => x.id === example || x.name === example);
      if (!e) throw new Error('Example not found');
      await app.handleLoadExample(e);
      return { loaded: e.name, candidates: candidates(app).map(summary) };
    }
  },
  {
    name: 'ams_export_p5',
    description: 'p5.js sketch.js for a candidate (as the Code tab exports it).',
    inputSchema: S({ candidate: CAND }),
    async run(app, { candidate }) {
      const c = findCandidate(app, candidate);
      if (!c) throw new Error('Candidate not found');
      const medium = app.getActiveMedium();
      return { sketch: await buildP5Sketch(c.program, { mediumId: medium.id, medium, title: c.prompt || 'AMS sketch', style: app.styleSettings }) };
    }
  },

  // ---- agent as engine -----------------------------------------------------
  {
    name: 'ams_agent_brief',
    description: 'What the studio would ask an engine for this prompt (system prompt, per-candidate user prompts with variation directives, medium coordinate system, parent program for variations/critique). Use it to write programs for ams_agent_submit.',
    inputSchema: S({ prompt: str('Prompt'), parent: CAND, feedback: str('Critique for the parent'), count: num('Candidates (default 4)') }, ['prompt']),
    run(app, { prompt, parent, feedback, count = 4 }) {
      const p = parent !== undefined ? findCandidate(app, parent) : null;
      return AgentArtist.brief({ prompt, previousProgram: p?.program, feedback, mediumCapabilities: app.getActiveMedium().capabilities() }, count);
    }
  },
  {
    name: 'ams_agent_submit',
    description: 'Act as the engine: submit your own programs ({version:1, actions:[...]}, normalized coordinates -1..1 unless the medium is pixel). If a Generate with the Agent engine is waiting, they answer it; otherwise they run a new round now (as variations of `parent` when given).',
    inputSchema: S({
      prompt: str('Prompt the programs answer'), programs: { type: 'array', items: { type: 'object' }, description: '1-8 drawing programs' },
      parent: CAND, feedback: str('Critique the programs answer (for provenance)'), model: str('Label for the model column (default external-agent)')
    }, ['programs']),
    async run(app, { prompt, programs, parent, feedback, model }) {
      const agent = app.artistRegistry.get('agent');
      if (agent.waiting) {
        agent.submit(programs, model);
        await waitForIdle(app, 60000);
        return { delivered: true, candidates: candidates(app).map(summary) };
      }
      if (!prompt) throw new Error('prompt is required when no Generate is waiting');
      const input = app.root.querySelector('#studio-prompt-input');
      if (input) { input.value = prompt; input.dispatchEvent(new Event('input', { bubbles: true })); }
      const p = parent !== undefined ? findCandidate(app, parent) : null;
      // Submitting makes the Agent engine active (and leaves it active, like a user choosing it).
      if (app.artistRegistry.activeId !== 'agent') STUDIO_TOOLS.find(t => t.name === 'ams_set_engine').run(app, { engine: 'agent' });
      agent.submit(programs, model);
      await app.handleGenerate(prompt, p?.program || null, feedback || null, p?.id || null);
      return { candidates: candidates(app).map(summary) };
    }
  },
  {
    name: 'ams_agent_submit_description',
    description: 'Answer a waiting describe request (prompt mode Describe with the Agent engine) with your description of the reference.',
    inputSchema: S({ text: str('Description to use as the prompt') }, ['text']),
    run(app, { text }) { return { delivered: app.artistRegistry.get('agent').submitDescription(text) }; }
  },
  {
    name: 'ams_set_count',
    description: 'Candidates per round (1-8, default 4).',
    inputSchema: S({ count: num('1-8') }, ['count']),
    run(app, { count }) { setControl(app.root, '#count-select', count); return { count: app.generationCount }; }
  },
  {
    name: 'ams_agent_pending',
    description: 'What the Agent engine is waiting for, else null: {type:"describe", referenceImage} (answer with ams_agent_submit_description) or {type:"generate", …brief} (answer with ams_agent_submit).',
    inputSchema: S(),
    run(app) { return app.artistRegistry.get('agent').pending(); }
  },

  // ---- reference & continuous mode -------------------------------------------
  {
    name: 'ams_list_references',
    description: 'Bundled references and the current one.',
    inputSchema: S(),
    run(app) {
      const rp = app.referencePanel;
      return { current: rp.current ? { id: rp.current.id, name: rp.current.name } : null, bundled: rp.references.map(r => ({ id: r.id, title: r.title, artist: r.artist, year: r.year })) };
    }
  },
  {
    name: 'ams_set_reference',
    description: 'Set the reference: a bundled id, an asset id, an image URL or data URL, or "webcam".',
    inputSchema: S({ id: str('Bundled reference id'), assetId: str('Asset id'), url: str('Image URL or data URL'), name: str('Name for a URL image'), webcam: bool('Use the webcam') }),
    async run(app, { id, assetId, url, name, webcam }) {
      const rp = app.referencePanel;
      if (webcam) await rp.selectWebcam();
      else if (id) { const sel = app.root.querySelector('#reference-select'); if (sel) sel.value = id; await rp.selectBundled(id); }
      else if (assetId) { const a = await app.assetStore.get(assetId); if (!a) throw new Error('Asset not found'); await app.useAssetAsReference(a); }
      else if (url) {
        const blob = await (await fetch(url)).blob();
        await rp.selectUpload(new File([blob], name || 'reference.' + ((blob.type.split('/')[1] || 'png').replace('jpeg', 'jpg')), { type: blob.type || 'image/png' }));
      } else throw new Error('Give id, assetId, url or webcam');
      return { reference: rp.current ? { id: rp.current.id, name: rp.current.name } : null };
    }
  },
  {
    name: 'ams_set_reference_view',
    description: 'Reference placement and overlay: fit (cover|contain|stretch), overlay (off|under|over|solo), overlayOpacity (0-1), and for live sources sampling (continuous|interval|hold), interval (s), rate.',
    inputSchema: S({ fit: str('cover | contain | stretch'), overlay: str('off | under | over | solo'), overlayOpacity: num('0-1'), sampling: str('continuous | interval | hold'), interval: num('Seconds between samples'), rate: num('Playback rate') }),
    run(app, a) {
      const r = app.root;
      if (a.fit) setControl(r, '#ref-fit', a.fit);
      if (a.overlay) setControl(r, '#overlay-mode', a.overlay);
      if (a.overlayOpacity !== undefined) setControl(r, '#overlay-opacity-num', a.overlayOpacity);
      if (a.sampling) setControl(r, '#src-sampling', a.sampling);
      if (a.interval !== undefined) setControl(r, '#src-interval-num', a.interval);
      if (a.rate !== undefined) setControl(r, '#src-rate-num', a.rate);
      return liveState(app);
    }
  },
  {
    name: 'ams_source_timeline',
    description: 'Video / animated references: read the position, seek (0-1), step frames (±n), pause or play. Scrubbing and stepping pause playback, like the UI.',
    inputSchema: S({ seek: num('Timeline fraction 0-1'), step: num('Frames to step (negative = back)'), play: bool('true: play, false: pause') }),
    async run(app, { seek, step, play }) {
      const r = app.root, src = app.referencePanel.current?.live;
      if (!src?.position?.() ) throw new Error('The reference is not a video or animation');
      if (seek !== undefined) { setControl(r, '#src-scrub', Math.round(seek * 1000)); }
      if (step) { const btn = r.querySelector(step > 0 ? '#src-next' : '#src-prev'); for (let i = 0; i < Math.abs(step); i++) { btn.click(); await sleep(60); } }
      if (play !== undefined && (play !== (app.referencePanel.sourceCfg.rate > 0))) r.querySelector('#src-playpause').click();
      await sleep(120);
      return { ...src.position(), rate: app.referencePanel.sourceCfg.rate };
    }
  },
  {
    name: 'ams_live_set',
    description: 'Continuous-mode controls: ground (transparent|fixed|follow|drift), groundTime, mode/style (strokes|fade), density, lifetime (cycle s), fadeIn, fadeOut, opacity, pigment, shapes (mixed|rect|triangle|circle).',
    inputSchema: S({ ground: str(''), groundTime: num(''), mode: str('strokes | fade'), density: num(''), lifetime: num(''), fadeIn: num(''), fadeOut: num(''), opacity: num(''), pigment: num(''), shapes: str('') }),
    run(app, a) {
      const r = app.root;
      const map = { ground: '#live-ground', mode: '#live-mode', shapes: '#live-shapes', groundTime: '#live-groundtime-num', density: '#live-density-num', lifetime: '#live-lifetime-num', fadeIn: '#live-fadein-num', fadeOut: '#live-fadeout-num', opacity: '#live-opacity-num', pigment: '#live-pigment-num' };
      for (const [k, sel] of Object.entries(map)) if (a[k] !== undefined) setControl(r, sel, a[k]);
      return liveState(app);
    }
  },
  {
    name: 'ams_live_control',
    description: 'Continuous mode buttons: play, stop, pause, resume, clear. `step` advances the simulation by `seconds` without waiting for the display (useful when the tab is hidden and frames are throttled).',
    inputSchema: S({ action: str('play | stop | pause | resume | clear | step', { enum: ['play', 'stop', 'pause', 'resume', 'clear', 'step'] }), seconds: num('For step (default 1)') }, ['action']),
    async run(app, { action, seconds = 1 }) {
      const r = app.root, lp = app.livePainter;
      app.root.querySelector('#tab-btn-reference')?.click();
      if (action === 'play' && !lp.running) r.querySelector('#live-toggle').click();
      else if (action === 'stop' && lp.running) r.querySelector('#live-toggle').click();
      else if ((action === 'pause' && !lp.paused) || (action === 'resume' && lp.paused)) r.querySelector('#live-pause').click();
      else if (action === 'clear') r.querySelector('#live-clear').click();
      else if (action === 'step') {
        if (!lp.cf) throw new Error('Press play first');
        const dt = 1 / 30;
        for (let t = 0; t < seconds; t += dt) {
          lp.t += dt;
          lp.sampleSource?.(dt);
          const cap = lp.params.render === 'watercolor' && lp.sprites ? (lp.sprites.pending > 0 ? 0 : 2) : Infinity;
          lp.cf.update(lp.t, dt, cap);
        }
        lp.paint(dt);
      }
      await sleep(50);
      return liveState(app);
    }
  },
  {
    name: 'ams_live_snapshot',
    description: 'The current painting as a PNG data URL, the ASCII frame as text, or the strokes as a program.',
    inputSchema: S({ format: str('png | txt | program', { enum: ['png', 'txt', 'program'] }) }),
    async run(app, { format = 'png' }) {
      const lp = app.livePainter;
      if (format === 'txt') { if (lp.params?.render !== 'ascii') throw new Error('Render is not ASCII'); lp.paint(0); return { text: getAsciiText() }; }
      if (format === 'program') return { program: lp.snapshot() };
      const blob = await lp.pictureBlob();
      if (!blob) throw new Error('Nothing painted');
      return { image: await blobToDataUrl(blob) };
    }
  },
  {
    name: 'ams_live_record',
    description: 'Record the live canvas: start, or stop and get the file as a data URL (gif, or mp4/webm). Optionally also download it in the browser.',
    inputSchema: S({ action: str('start | stop', { enum: ['start', 'stop'] }), format: str('gif | video', { enum: ['gif', 'video'] }), download: bool('Also save the file in the browser') }, ['action']),
    async run(app, { action, format = 'gif', download = false }) {
      const lp = app.livePainter;
      if (action === 'start') { lp.recorder = new CanvasRecorder(format); return { recording: true, format }; }
      const rec = lp.recorder;
      lp.recorder = null;
      if (!rec) throw new Error('Not recording');
      const out = await rec.stop();
      if (!out) throw new Error('Nothing recorded');
      if (download) { const { saveBlob } = await import('../export/recorder.js'); saveBlob(out.blob, 'ams-live.' + out.ext); }
      return { ext: out.ext, bytes: out.blob.size, data: await blobToDataUrl(out.blob) };
    }
  },
  {
    name: 'ams_export_continuous',
    description: 'Press Export p5 in continuous mode (downloads the zip in the browser).',
    inputSchema: S(),
    run(app) { app.root.querySelector('#live-export')?.click(); return { ok: true }; }
  },

  // ---- assets -----------------------------------------------------------------
  {
    name: 'ams_assets_list',
    description: 'Assets and folders. Filters: folder (with subfolders), query (words; #tag exact), kind (variation|painting|import|klee).',
    inputSchema: S({ folder: str('Folder path'), query: str('Search'), kind: str('Kind'), thumbs: bool('Include thumbnail data URLs') }),
    async run(app, { folder = '', query = '', kind, thumbs = false }) {
      const { matches } = await import('../assets/assetStore.js');
      const all = await app.assetStore.all();
      const list = all.filter(a => (!folder || a.folder === folder || a.folder.startsWith(folder + '/')) && (!kind || a.kind === kind) && matches(a, query));
      return { folders: await app.assetStore.folders(), assets: list.map(a => assetInfo(a, thumbs)) };
    }
  },
  {
    name: 'ams_asset_get',
    description: 'One asset with its image (data URL) and program.',
    inputSchema: S({ id: str('Asset id') }, ['id']),
    async run(app, { id }) {
      const a = await app.assetStore.get(id);
      if (!a) throw new Error('Asset not found');
      return { ...assetInfo(a), program: a.program, image: await blobToDataUrl(a.blob) };
    }
  },
  {
    name: 'ams_asset_add',
    description: 'Add an asset: what the preview shows (source "preview"), the live painting, a candidate, or an image URL / data URL.',
    inputSchema: S({ source: str('preview | painting | candidate | url', { enum: ['preview', 'painting', 'candidate', 'url'] }), candidate: CAND, url: str('Image URL or data URL'), title: str(''), tags: { type: 'array', items: { type: 'string' } }, folder: str(''), rating: num('0-5') }),
    async run(app, { source = 'preview', candidate, url, title, tags, folder, rating }) {
      const store = app.assetStore;
      let asset;
      if (source === 'url') {
        const blob = await (await fetch(url)).blob();
        asset = await store.add(blob, { title: title || 'Image', kind: 'import', tags: tags || [], folder: folder ?? app.assetPanel.folder, rating });
      } else if (source === 'candidate') {
        const c = findCandidate(app, candidate);
        if (!c?.renderedImage) throw new Error('Candidate has no image');
        const blob = await (await fetch(c.renderedImage)).blob();
        asset = await store.add(blob, { title: title || c.prompt || 'Variation', kind: 'variation', rating: rating ?? c.rating ?? 0, tags: tags || [String(c.medium || app.activeMediumId).toLowerCase()], folder: folder ?? app.assetPanel.folder, program: c.program, meta: { model: c.model, medium: c.medium } });
      } else {
        const before = new Set((await store.all()).map(a => a.id));
        if (folder !== undefined) app.assetPanel.folder = folder;
        await app.saveToAssets(null, source === 'painting');
        asset = (await store.all()).find(a => !before.has(a.id));
        if (asset && (title || tags || rating)) asset = await store.update(asset.id, { ...(title ? { title } : {}), ...(tags ? { tags } : {}), ...(rating !== undefined ? { rating } : {}) });
      }
      if (!asset) throw new Error('Nothing saved');
      return assetInfo(asset);
    }
  },
  {
    name: 'ams_asset_update',
    description: 'Rename, retag, rate or move an asset.',
    inputSchema: S({ id: str('Asset id'), title: str(''), tags: { type: 'array', items: { type: 'string' } }, rating: num('0-5'), folder: str('') }, ['id']),
    async run(app, { id, ...patch }) { const a = await app.assetStore.update(id, patch); if (!a) throw new Error('Asset not found'); return assetInfo(a); }
  },
  {
    name: 'ams_asset_delete',
    description: 'Delete an asset.',
    inputSchema: S({ id: str('Asset id') }, ['id']),
    async run(app, { id }) { await app.assetStore.remove(id); return { deleted: id }; }
  },
  {
    name: 'ams_asset_folder',
    description: 'Create, rename or open (show in the Assets tab) a folder.',
    inputSchema: S({ action: str('create | rename | open', { enum: ['create', 'rename', 'open'] }), path: str('Folder path'), to: str('New path (rename)') }, ['action', 'path']),
    async run(app, { action, path, to }) {
      if (action === 'create') app.assetStore.addFolder(path);
      else if (action === 'rename') await app.assetStore.renameFolder(path, to);
      else { app.root.querySelector('#tab-btn-assets')?.click(); app.assetPanel.folder = path; app.assetPanel.draw(); }
      return { folders: await app.assetStore.folders() };
    }
  },
  {
    name: 'ams_asset_open',
    description: 'Show an asset in the main preview: its program becomes the active candidate (re-rendered in the current medium), or, without a program, the image is shown as a still.',
    inputSchema: S({ id: str('Asset id') }, ['id']),
    async run(app, { id }) { const a = await app.assetStore.get(id); if (!a) throw new Error('Asset not found'); await app.openAsset(a); return { opened: a.title, candidates: candidates(app).map(summary) }; }
  },
  {
    name: 'ams_asset_export',
    description: 'Press an asset\'s Export button (downloads PNG, or a zip with meta.json/program.json, in the browser).',
    inputSchema: S({ id: str('Asset id') }, ['id']),
    async run(app, { id }) { const a = await app.assetStore.get(id); if (!a) throw new Error('Asset not found'); await app.exportAsset(a); return { exported: a.title }; }
  }
];

export const STUDIO_TOOL_MAP = Object.fromEntries(STUDIO_TOOLS.map(t => [t.name, t]));

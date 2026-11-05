/**
 * Command palette (Cmd+K), after underscores: every action by name. Type to filter; Enter runs.
 * Anything that matches nothing can be asked of the Assistant.
 */
import { h } from './ui.js';
import { EXERCISES } from '../process/exercises.js';
import { createDocument } from '../process/document.js';
import { findBoard, MAIN } from '../process/boards.js';
import { intentCommand } from './intents.js';
import { attachMic, looksReady } from './voice.js';

export function buildCommands(app) {
  const cmd = (category, name, run, keys = '', hint = '') => ({ id: `${category}:${name}`, category, name, run, keys, hint });
  const out = [
    cmd('File', 'New drawing (a new scene)', () => app.scenes.create()),
    cmd('File', 'Open file…', () => app.openFile()),
    cmd('File', 'Save to Assets', () => app.saveToAssets(), '⌘S'),
    cmd('Edit', 'Undo', () => app.store.undo(), '⌘Z'),
    cmd('Edit', 'Redo', () => app.store.redo(), '⇧⌘Z'),
    cmd('Edit', 'Pick a color (eyedropper)', () => import('./colorPicker.js').then(m => m.eyedropToTarget(app)), 'I'),
    cmd('Edit', 'Select all', () => app.canvas.select(app.store.doc.elements.filter(e => app.canvas.editable(e)).map(e => e.id)), '⌘A'),
    ...[['png', 'Picture (PNG)'], ['svg', 'SVG with process record'], ['p5', 'p5.js sketch (zip)'], ['sheet', 'Process sheet (PNG)'], ['json', 'Process document (JSON)'], ['excalidraw', 'Excalidraw']]
      .map(([k, l]) => cmd('Export', l, () => app.exportAs(k))),
    cmd('View', 'Picture view', () => app.setViewMode('picture'), '\\'),
    cmd('View', 'Process view', () => app.setViewMode('process'), '\\'),
    cmd('View', 'Fit artboard', () => { app.canvas.fit(); app.renderChrome(); }, 'F'),
    cmd('View', 'Toggle reference', () => { if (app.reference) { app.reference.visible = !app.reference.visible; app.canvas.invalidate(); app.renderChrome(); } }, 'R'),
    cmd('View', 'Toggle grid', () => app.canvas.setGrid({ show: app.canvas.grid.show === 'off' ? 'paper' : 'off' })),
    cmd('View', 'Toggle snap to grid', () => { app.canvas.setGrid({ snap: !app.canvas.grid.snap }); app.log(`Snap ${app.canvas.grid.snap ? 'on' : 'off'}.`); }),
    cmd('Record', 'Start recording', () => app.recorder.start()),
    cmd('Record', 'Stop recording', () => app.recorder.stop()),
    cmd('Record', 'Timeline', () => app.docks.open('timeline')),
    cmd('Record', 'Record a lecture: stage and microphone', () => app.lecture.start({ mic: true }), '', 'Records the stage and your voice as a film, kept in Assets (Videos). The browser asks which tab to share: choose this one'),
    cmd('Record', 'Record a lecture: stage, microphone and camera', () => app.lecture.start({ mic: true, camera: true }), '', 'Also puts your face in a round bubble on the stage (drag it; double-click to resize)'),
    cmd('Record', 'Record a lecture: the whole tab', () => app.lecture.start({ mic: true, crop: false }), '', 'The panels are in the film too'),
    cmd('Record', 'Pause or resume the lecture recording', () => app.lecture.pause()),
    cmd('Record', 'Stop the lecture recording', () => app.lecture.stop()),
    cmd('View', 'Reset layout', () => app.docks.reset()),
    cmd('View', 'Show user actions', () => app.userActions?.toggle(), '', 'The keys and clicks you make, and what they do: an overlay for teaching, demos and recordings'),
    cmd('Physics', 'Physics toolbar', () => app.physicsToolbar?.toggle(), '', 'Its own island: physics for the board you are on'),
    cmd('Physics', 'Physics on for this board', () => { app.physics?.setWorld(app.activeBoard || 'main', {}); app.physicsToolbar?.show(); }, '', 'What is drawn on the board falls, rolls and collides (closed marks fall, open lines are ground)'),
    cmd('Physics', 'Physics off for this board', () => app.physics?.setWorld(app.activeBoard || 'main', null)),
    cmd('Physics', 'Physics: play / pause', () => app.physics?.toggle()),
    cmd('Physics', 'Physics: rewind', () => app.physics?.rewind(), '', 'The world runs backwards, twice as fast, to its start (again: stops where it is)'),
    cmd('Physics', 'Physics: step back one frame', () => app.physics?.step(undefined, -1)),
    cmd('Physics', 'Physics: reset', () => app.physics?.reset()),
    cmd('Physics', 'Physics: apply pose', () => app.physics?.applyPose()),
    cmd('View', 'Classic studio', () => { window.location.href = '/classic.html'; })
  ];
  for (const [id, label, key] of app.toolList || []) out.push(cmd('Tool', label, () => app.setTool(id), key));
  for (const p of app.docks.panels.values()) out.push(cmd('Panel', p.title, () => app.docks.open(p.id)));
  for (const e of EXERCISES) out.push(cmd('Exercise', e.title, () => { app.docks.open('script'); app.scriptPanel?.setSource(e.source); app.scriptPanel?.run(); }, '', e.brief));
  for (const w of app.walkthroughs.list()) out.push(cmd('Walkthrough', w.title, () => app.walkthroughs.start(w.id), '', w.summary));
  for (const sc of app.script?.list() || []) out.push(cmd('Script', sc.title, () => app.script.play(sc.id), '', sc.summary));
  for (const sc of app.script?.list() || []) out.push(cmd('Script', `${sc.title}: record as a video`, () => app.script.play(sc.id, { record: {} }), '', 'Records this tab (cropped to the stage) with the narration as MP4 or WebM, with the subtitles as a .vtt file. The browser asks which tab to share; choose this one'));
  for (const sc of app.script?.list() || []) out.push(
    cmd('Script', `${sc.title}: export as a page that plays on its own`, () => app.script.exportPage(sc.id), '', 'One HTML file: the slide, the narration inside, and the same cursor and subtitles. Open it anywhere and press Play'),
    cmd('Script', `${sc.title}: export as an MP4 video`, () => app.script.exportVideo(sc.id), '', 'Plays the script in a browser of its own (no tab to share), mixes the narration in, fades to black, and saves an MP4 and its subtitles in exports/video. Needs the dev server, ffmpeg and Chrome'),
    cmd('Script', `${sc.title}: keep in Assets (plays from there)`, () => app.script.saveAsset(sc.id), '', 'The script as an asset: open it in the Assets panel to play it in a scene that has the lesson'));
  out.push(
    cmd('Script', 'Narration on (scripts are spoken)', () => { app.narrator.on = true; app.log('Narration on: scripts are spoken, in the narrator voice.'); }),
    cmd('Script', 'Narration off (subtitles only)', () => { app.narrator.on = false; app.log('Narration off: scripts play with subtitles only.'); }),
    cmd('Script', 'Narrator voice…', async () => {
      try {
        const voices = await app.narrator.load(p => app.log(`Loading the voice · ${Math.round(p)}%`));
        const { showMenu } = await import('./menu.js');
        showMenu([{ label: 'Narrator voice' }, ...voices.map(v => ({ label: v.label, active: v.id === app.narrator.voice, run: async () => { app.narrator.voice = v.id; const c = await app.narrator.clip(`This is ${v.label.split(' · ')[0]}.`); app.narrator.play(c.buffer); } }))], innerWidth / 2, innerHeight / 3);
      } catch (err) { app.log(`Narration: ${err.message}`, 'error'); }
    }));
  for (const t of app.docsTopics?.() || []) out.push(cmd('Docs', t.title, () => app.openDocs(t.id), '', t.summary));
  out.push(
    cmd('Decide', 'Analyze reference', () => { app.docks.open('decide'); app.decidePanel?.analyze(); }),
    cmd('Decide', 'Propose step', () => { app.docks.open('decide'); app.decidePanel?.propose(); }),
    cmd('Agent', 'How did you do that? (replay last agent session)', () => window.ams.callTool('ams_sessions', { action: 'replay' }))
  );
  // Show the keys as currently assigned (Shortcuts panel), not the defaults.
  const K = { 'View:Show user actions': 'view.userActions', 'File:Save to Assets': 'file.save', 'Edit:Undo': 'edit.undo', 'Edit:Redo': 'edit.redo', 'Edit:Select all': 'edit.selectAll', 'Edit:Pick a color (eyedropper)': 'edit.eyedropper', 'View:Picture view': 'view.toggle', 'View:Process view': 'view.toggle', 'View:Fit artboard': 'view.fit', 'View:Toggle reference': 'view.reference', 'View:Toggle grid': 'view.grid', 'View:Toggle snap to grid': 'view.snap' };
  for (const c of out) {
    const id = K[c.id] || (c.category === 'Tool' ? `tool.${(app.toolList || []).find(t => t[1] === c.name)?.[0]}` : null);
    if (id && app.shortcuts) c.keys = app.shortcuts.label(id);
  }
  // Every keyboard command is a palette command too (one registry: nothing the keys can do is missing here).
  // Skip what is already listed by hand above (same shortcut id) and the tools the toolbar list covers.
  const listed = new Set([...Object.values(K), ...(app.toolList || []).map(t => `tool.${t[0]}`)]);
  for (const c of app.shortcuts?.commands || []) {
    if (listed.has(c.id)) continue;
    out.push({ id: c.id, category: c.category, name: c.label, run: c.run, keys: app.shortcuts.label(c.id), hint: '', sc: c.id });
  }
  for (const c of out) { if (!c.sc) { const id = K[c.id]; if (id) c.sc = id; } if (!c.sc && c.category === 'Tool') c.sc = `tool.${(app.toolList || []).find(t => t[1] === c.name)?.[0]}`; }
  // The lean embedded editor is a drawing tool: no scenes, assets, recording, lessons or assistant to offer.
  if (app.embed && !app.embed.full) {
    const gone = /^(Record|Exercise|Walkthrough|Docs|Decide|Agent)$/, names = /^(New drawing|Open file|Save to Assets|Classic studio|Toggle reference|p5\.js sketch|Process sheet)/;
    return out.filter(c => !gone.test(c.category) && !names.test(c.name));
  }
  out.push({ id: 'Panel:Shortcuts', category: 'App', name: 'Shortcuts', hint: 'Search and reassign keys', keys: app.shortcuts?.label('app.shortcuts') || '', run: () => app.docks.open('shortcuts') });
  return out;
}

/** Slash commands, typed in the palette: /name arguments. */
export function slashCommands(app) {
  const all = slashAll(app);
  // (the lean embedded editor has no presentation, samples, lessons or program boards)
  return app.embed && !app.embed.full ? all.filter(c => !/^(ui|present|convert|samples|lesson)$/.test(c.name)) : all;
}

function slashAll(app) {
  return [
    { name: 'background', args: '<color | transparent | default>', doc: 'The workspace behind the boards: a color (#1b1c1f, a name), transparent (for a see-through window over the desktop), or the theme’s own', run: arg => app.setBackground(arg || 'default') },
    { name: 'transparent', args: '', doc: 'See-through workspace (toggle): only the boards, marks and interface show over what is behind the window', run: () => app.setBackground(app.background === 'transparent' ? 'default' : 'transparent') },
    { name: 'ui', args: '<on | off>', doc: 'Show or hide all of the interface', run: arg => app.setUI({ all: arg ? !/^(off|hide|no|0)$/i.test(arg) : !(app.ui?.tools !== false) }) },
    { name: 'pin', args: '[board]', doc: 'Pin a board on screen as a window-like overlay that stays put while you move around the canvas (again: unpin). The board keeps running while it is pinned', run: arg => { const b = arg ? findBoard(app.store.doc, arg.trim()) : findBoard(app.store.doc, app.activeBoard || MAIN); if (!b) return app.log(`No board “${arg}”.`, 'error'); app.outputs.pin(b.id); } },
    { name: 'output', args: '[board] [borderless]', doc: 'Open a board in a window of its own: for another display or a projector (click it for full screen: no title or address bar). With borderless: a picture-in-picture window (Chrome), no address bar', run: arg => { const borderless = /\bborderless\b/i.test(arg || ''); const name = String(arg || '').replace(/\bborderless\b/i, '').trim(); const b = name ? findBoard(app.store.doc, name) : findBoard(app.store.doc, app.activeBoard || MAIN); if (!b) return app.log(`No board “${name}”.`, 'error'); return app.outputs.openWindow(b.id, { borderless }); } },
    { name: 'present', args: '', doc: 'Present the boards', run: () => app.present(true) },
    { name: 'grid', args: '<off | paper | all>', doc: 'Show the grid', run: arg => app.canvas.setGrid({ show: arg === 'all' ? 'everywhere' : arg === 'off' ? 'off' : 'paper' }) },
    { name: 'bake', args: '<png | svg>', doc: 'Bake the selection (or the board you are on) into one image mark: PNG, or SVG (vector, crisp at any zoom). Undo brings the marks back', run: arg => { const f = /svg/i.test(arg || '') ? 'svg' : 'png'; const ids = [...app.canvas.selected]; if (ids.length) { const el = app.bakeMarks(ids, { format: f, title: `${ids.length} marks` }); if (el) app.canvas.select([el.id]); } else app.bakeBoard(app.activeBoard || 'main', f); } },
    { name: 'convert', args: '<p5 | studio>', doc: 'The board you are on as a new board in the other language: studio code → the p5 sketch (runs here and in the p5 editor), or a sketch the studio wrote → studio code', run: arg => app.convertBoard(app.activeBoard || 'main', /studio/i.test(arg || '') ? 'studio' : 'p5') },
    { name: 'copy', args: '<png | svg | json | p5>', doc: 'Copy the selection (or the board you are on) to the clipboard', run: arg => { const k = (arg || 'png').toLowerCase(); const ids = [...app.canvas.selected]; if (ids.length) app.copySelection(k === 'p5' ? 'p5' : k, ids); else app.copyBoard(app.activeBoard || 'main', k); } },
    { name: 'iannix', args: '', doc: 'Open an IanniX score (.iannix) as a new board: its curves, cursors and triggers become paths, travelers and events that play on the Timeline (the score runs as a program: open ones you trust)', run: () => app.importIannix().catch(err => app.log(`IanniX: ${err.message}`, 'error')) },
    { name: 'nous', args: '', doc: 'Open a Midinous (.nous) or midinojs project as a new board: its nodes and paths become marks that play on the Timeline, a grid cell a beat', run: () => app.importNous().catch(err => app.log(`Midinous: ${err.message}`, 'error')) },
    { name: 'midi', args: '<seconds>', doc: 'Export the score as a MIDI file: what it plays over that many seconds (the loop range, if marked), at the scene’s tempo', run: arg => app.exportMidi(arg).catch(err => app.log(`MIDI file: ${err.message}`, 'error')) },
    { name: 'samples', args: '', doc: 'A new scene with the stock samples (Assets › Samples), each as a source on its own board with a player', run: () => app.buildSamplesScene().then(n => app.log(`Samples: ${n} boards.`)).catch(err => app.log(`Samples: ${err.message}`, 'error')) },
    { name: 'stopmotion', args: '', doc: 'A new stop-motion board beside the active board, photographing it a frame at a time (Alt+Enter takes a frame)', run: () => { app.newStopmotion(); } },
    { name: 'lesson', args: 'sampling [p5 | expl] | sampling-expl | diffusion | threejs | reiniger', doc: 'Build a lesson as a new scene of frames: its boards from code, with Markdown notes and links (sampling: pointillism and expressionism; p5: p5.js sketches; expl: barebones p5.js sketches. diffusion: diffusion models. threejs: three.js for body and sound, with live three.js boards)', run: arg => import('./lessons.js').then(m => {
      const isDiff = /diffusion/i.test(arg || ''), isRein = /reiniger|silhouette/i.test(arg || ''), isThree = !isRein && /three/i.test(arg || '');
      const isExpl = /expl/i.test(arg || '');
      const isP5 = /p5/i.test(arg || '') && !isExpl;
      const id = isRein ? 'reiniger' : isThree ? 'threejs' : isDiff ? 'diffusion' : isExpl ? 'sampling-expl' : 'sampling';
      const language = isExpl ? 'expl' : isP5 ? 'p5' : 'studio';
      return m.buildLesson(app, id, { language, expl: isExpl });
    }).then(n => { if (typeof n === 'number') app.log(`The lesson is a scene: ${n} boards.`); }).catch(err => app.log(`Lesson: ${err.message}`, 'error')) }
  ];
}

// What a command is about, besides its name: the words people type for it.
const ALIAS = {
  'view.frameSelection': 'fit zoom focus frame selected selection', 'view.fit': 'fit zoom board', 'view.frameBoard': 'fit zoom board',
  'edit.delete': 'remove erase clear trash', 'edit.duplicate': 'copy clone', 'edit.group': 'combine', 'edit.ungroup': 'split',
  'edit.deselect': 'clear select none', 'edit.selectAll': 'everything', 'view.zoomIn': 'bigger magnify', 'view.zoomOut': 'smaller',
  'panel.code': 'edit source', 'transport.toggle': 'play pause', 'transport.rewind': 'start beginning'
};
// Commands that act on the selection: they rise when something is selected and sink when nothing is.
// Said to nobody in particular; they do not narrow a search (“frame it”, “fit this”).
const FILLER = new Set(['the', 'a', 'an', 'it', 'this', 'that', 'them', 'these', 'those', 'please', 'my']);
const NEEDS = new Set(['view.frameSelection', 'edit.delete', 'edit.duplicate', 'edit.group', 'edit.ungroup', 'panel.code', 'score.solo']);

/** What a command would act on: the selection, or the mark under the pointer. */
export function contextOf(app) {
  const sel = [...(app.canvas?.selected || [])], hover = app.canvas?.hovered || null;
  const els = app.store.doc.elements;
  const name = id => { const e = els.find(x => x.id === id); return e ? (e.label || e.role) : id; };
  const ids = sel.length ? sel : hover ? [hover] : [];
  return { sel, hover, ids, has: ids.length > 0, names: ids.slice(0, 6).map(name) };
}

/** Commands matching what was typed, best first. A slash command's name may lead (“background transparent”). */
export function rank(app, all, text, ctx = contextOf(app)) {
  const q = text.trim().replace(/^\/+/, '').toLowerCase();
  if (!q) return all;
  const words = q.split(/\s+/).filter(Boolean), found = [];
  const terms = words.filter(w => !FILLER.has(w)).length ? words.filter(w => !FILLER.has(w)) : words;
  const lead = words[0], arg = text.trim().replace(/^\/+\s*/, '').split(/\s+/).slice(1).join(' ');
  for (const s of slashCommands(app)) {
    if (!s.name.startsWith(lead)) continue;
    found.push([{ id: `/${s.name}`, category: 'Command', name: `/${s.name}${arg ? ` ${arg}` : s.args ? ` ${s.args}` : ''}`, hint: s.doc, keys: '', run: () => s.run(arg) }, s.name === lead ? 10 : 5]);
  }
  for (const c of all) {
    const hay = `${c.name} ${c.category} ${c.hint} ${ALIAS[c.sc] || ''}`.toLowerCase();
    if (!terms.every(t => hay.includes(t))) continue;
    const name = c.name.toLowerCase(), alias = (ALIAS[c.sc] || '').split(' ');
    let sc = (name.startsWith(terms[0]) ? 3 : 0) + (name.includes(terms.join(' ')) ? 2 : 0) + (c.category.toLowerCase().startsWith(terms[0]) ? 1 : 0)
      + (alias.some(w => w.startsWith(terms[0])) ? 3 : 0);
    if (NEEDS.has(c.sc)) sc += ctx.has ? 6 : -3;
    found.push([c, sc]);
  }
  const said = intentCommand(app, text);   // a phrase it understands outright comes first
  return [...(said ? [said] : []), ...found.sort((a, b) => b[1] - a[1]).map(([c]) => c)];
}

/** A request to the assistant without leaving the drawing: a chip where the field was, then what it said. Click it for the conversation. */
async function askInFlow(app, text, { x, y }) {
  const chip = h('button', { class: 'wb-flow-chip', style: { left: `${x}px`, top: `${y}px` }, title: 'Open the Assistant', onclick: () => { chip.remove(); app.docks.open('assistant'); } }, '…');
  document.body.append(chip);
  // The panel builds itself the first time it is shown: build it without showing it.
  const panel = app.docks.panels.get('assistant');
  if (panel) app.docks.mountBody(panel);
  const r = app.assistantAsk ? await app.assistantAsk(text, { flow: true }).catch(err => ({ error: err.message })) : { error: 'There is no assistant here.' };
  chip.textContent = r?.error || r?.say || '✓';
  chip.classList.toggle('error', Boolean(r?.error));
  setTimeout(() => chip.remove(), r?.error ? 8000 : r?.say ? 4000 : 1000);
}

export function openPalette(app, { compact = false } = {}) {
  document.querySelector('.wb-palette-overlay')?.remove();
  const all = buildCommands(app);
  let list = all, index = 0, spot = null;
  const input = h('input', { class: 'wb-palette-input', placeholder: 'Command, panel, exercise, doc… or ask', spellcheck: 'false' });
  const results = h('div', { class: 'wb-palette-results', role: 'listbox' });
  const bar = h('div', { class: 'wb-palette-bar' }, input);
  let submit = () => {};
  const mic = attachMic(input, { host: bar, onDone: text => { if (looksReady(text)) submit(); } });
  const card = h('div', { class: 'wb-palette-card' }, bar, results);
  const overlay = h('div', { class: `wb-palette-overlay${compact ? ' compact' : ''}`, onpointerdown: e => { if (e.target === overlay) close(); } }, card);
  // The compact bar: just the field, at the pointer, acting on what is selected (or under the pointer).
  if (compact) {
    const c0 = contextOf(app);
    if (!c0.sel.length && c0.hover) app.canvas.select([c0.hover]);
    const [px, py] = app.pointerAt || [window.innerWidth / 2, window.innerHeight / 3];
    card.style.left = `${Math.max(8, Math.min(window.innerWidth - 328, px - 20))}px`;
    card.style.top = `${Math.max(8, Math.min(window.innerHeight - 220, py + 14))}px`;
    const now = contextOf(app), what = now.names.length > 2 ? `${now.ids.length} marks` : now.names.join(', ');
    input.placeholder = `${what ? `${what}: ` : ''}do…  (⌘↵ asks the assistant)`;
  }
  const close = () => { mic.stop(); overlay.remove(); };
  // To the assistant, with what is selected (or under the pointer) as context.
  const toAssistant = q => {
    const c = contextOf(app);
    const text = c.has ? `[Context: ${c.sel.length ? 'selected' : 'under the pointer'}: ${c.names.join(', ')} (ids ${c.ids.slice(0, 6).join(', ')}${c.ids.length > 6 ? ', …' : ''}); board ${app.activeBoard || 'main'}]\n${q}` : q;
    askInFlow(app, text, spot);
  };
  const ask = q => ({ id: 'ask', category: 'Assistant', name: `Ask: ${q}`, hint: '', keys: '⌘↵', run: () => toAssistant(q) });
  // With nothing typed the bar offers only what fits what is selected, and Enter runs nothing.
  const suggestions = () => {
    const n = app.canvas.selected.size;
    if (!n) return [];
    const grouped = [...app.canvas.selected].some(id => app.store.doc.elements.find(e => e.id === id)?.group);
    const ids = ['view.frameSelection', 'paint.pick', 'edit.duplicate', ...(n > 1 ? ['edit.group'] : []), ...(grouped ? ['edit.ungroup'] : []), 'panel.code'];
    return ids.map(id => all.find(c => c.sc === id)).filter(Boolean);
  };
  const render = () => {
    const q = input.value.trim().toLowerCase();
    // Slash commands: /name arguments (e.g. /background transparent). (The compact bar ranks them with everything else.)
    if (q.startsWith('/') && !compact) {
      const [name, ...rest] = input.value.trim().slice(1).split(/\s+/);
      const arg = rest.join(' ');
      list = slashCommands(app).filter(s => s.name.startsWith(name.toLowerCase())).map(s => ({
        id: `/${s.name}`, category: 'Command', name: `/${s.name}${arg ? ` ${arg}` : s.args ? ` ${s.args}` : ''}`, hint: s.doc, keys: '↵', run: () => s.run(arg)
      }));
      index = Math.min(index, Math.max(0, list.length - 1));
      results.replaceChildren(...list.map((c, i) => h('div', { class: `wb-palette-item${i === index ? ' active' : ''}`, title: c.hint || '', onpointerenter: () => { index = i; mark(); }, onclick: () => runIt(c) },
        h('span', { class: 'wb-palette-name' }, c.name), h('span', { class: 'wb-palette-cat' }, c.hint), h('kbd', {}, c.keys))));
      if (!list.length) results.append(h('div', { class: 'wb-palette-empty' }, 'No such command (try /background, /transparent)'));
      return;
    }
    list = compact && !q ? suggestions() : rank(app, all, input.value);
    if (compact && !q) index = -1;
    if (q) list = [...list.slice(0, compact ? 4 : 40), ask(input.value.trim())];
    index = Math.min(index, list.length - 1);
    results.replaceChildren(...list.slice(0, compact ? 5 : 60).map((c, i) => h('div', {
      class: `wb-palette-item${i === index ? ' active' : ''}`, title: c.hint || '',
      onpointerenter: () => { index = i; mark(); }, onclick: () => runIt(c)
    }, c.swatch ? h('span', { class: 'wb-palette-swatch', style: { background: c.swatch } }) : null, h('span', { class: 'wb-palette-name' }, c.name), h('span', { class: 'wb-palette-cat' }, c.category), c.keys ? h('kbd', {}, c.keys) : null)));
    if (!list.length && !compact) results.append(h('div', { class: 'wb-palette-empty' }, 'Nothing matches'));
  };
  const mark = () => results.querySelectorAll('.wb-palette-item').forEach((el, i) => el.classList.toggle('active', i === index));
  const runIt = c => {
    const typed = input.value.trim(), log = typed && c.id !== 'ask' ? app.requests?.start(typed, String(c.id).startsWith('intent:') ? 'phrase' : 'command', { command: c.name }) : null;
    close();
    try { const r = c.run(); if (r?.then) r.then(() => log && app.requests.done(log), e => { log && app.requests.done(log, { error: e.message }); app.log(e.message, 'error'); }); else log && app.requests.done(log); }
    catch (e) { log && app.requests.done(log, { error: e.message }); app.log(e.message, 'error'); }
  };
  input.addEventListener('input', () => { index = 0; render(); });
  input.addEventListener('keydown', e => {
    e.stopPropagation();
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !list.length) { e.preventDefault(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); index = (index + 1) % list.length; mark(); results.children[index]?.scrollIntoView({ block: 'nearest' }); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); index = index <= 0 ? list.length - 1 : index - 1; mark(); results.children[index]?.scrollIntoView({ block: 'nearest' }); }
    else if (e.key === 'Enter' && mic.active) { e.preventDefault(); mic.stop(); }   // (first Enter ends the dictation; the next one runs it)
    else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && input.value.trim()) { e.preventDefault(); close(); toAssistant(input.value.trim()); }
    else if (e.key === 'Enter') { e.preventDefault(); submit(); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'm' && e.altKey) { e.preventDefault(); mic.toggle(); }
  });
  submit = () => { if (list[index]) runIt(list[index]); else if (compact) close(); };
  document.body.append(overlay);
  const box = card.getBoundingClientRect();
  spot = { x: box.left, y: box.top };
  render();
  input.focus();
}

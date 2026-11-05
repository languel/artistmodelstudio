/**
 * Assistant: a chat that lets the loaded model (Ollama, in-browser WebGPU, OpenRouter,
 * OpenAI-compatible) drive the workbench through the same tools agents use over MCP.
 * Every action goes through the guide (visible) and the session recorder (replayable).
 *
 * A line starting with ! runs a tool by hand (the console: !board list, !help); see console.js.
 *
 * Protocol (plain JSON, so it works with any model, no native tool calling needed):
 *   { "say": "…", "actions": [{ "tool": "ams_…", "args": { … } }], "done": true | false }
 */
import { h } from '../ui.js';
import { icon } from '../icons.js';
import { showMenu } from '../menu.js';
import { modelPill } from '../modelPill.js';
import { attachMic, looksReady } from '../voice.js';
import { ENGINE_NAMES, currentEngine, setEngine, useModel, allFavorites, favorites, isFavorite, toggleFavorite, assistantSettings, setAssistantSettings, FALLBACK_TEMPERATURE } from '../modelStore.js';
import { parseCommand, brief, help } from '../console.js';
import { voiceSettings, setVoice } from '../voiceOut.js';
import { nativePrompt, nativeToolset } from '../nativeTools.js';

const ATTACH_MAX = 40000;   // characters of an attached file that go to the model
const SEND = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V6M6 11l6-6 6 6"/></svg>';
const STOP = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>';
const TALK_ONLY = 'You are the assistant inside Artist Model Studio, a workbench for drawing by process (Klee, Kandinsky, the algorists). Studio tools are switched off: answer in plain text, briefly, and say what you would draw rather than drawing it.';

/**
 * From the quick command field: the person is drawing and does not want a conversation. A small prompt on purpose:
 * only what is selected and the few tools that change it, no chat history. With the whole tool list and the history a
 * small local model took 10 seconds and could not be read; with this it answers in a fraction of a second.
 */
export function flowPrompt(app) {
  const doc = app.store.doc, sel = [...app.canvas.selected];
  const marks = doc.elements.filter(e => sel.includes(e.id)).slice(0, 12)
    .map(e => `- ${e.id}: ${e.role}${e.label ? ` "${e.label}"` : ''}, fill ${e.fill || 'none'}, stroke ${e.color || 'default'}, opacity ${e.opacity ?? 1}, brush ${e.realize?.brush}`).join('\n');
  const page = !marks ? doc.elements.slice(-12).map(e => `- ${e.id}: ${e.role}${e.points.length > 4 && e.role === 'plane' ? ' (round)' : e.role === 'plane' && e.points.length === 4 ? ' (rectangle)' : ''}${e.label ? ` "${e.label}"` : ''}, fill ${e.fill || 'none'}, at ${Math.round(e.points.reduce((a, p) => a + p[0], 0) / e.points.length)},${Math.round(e.points.reduce((a, p) => a + p[1], 0) / e.points.length)}`).join('\n') : '';
  return `You change a drawing in a drawing app, at once. Never ask a question or offer options: when something is unclear, choose the most sensible reading and do it. Undo is one key away.
${marks ? `Selected marks ("it" and "this" mean these):\n${marks}` : `Nothing is selected.${page ? ` Marks on the page:\n${page}` : ' The page is empty.'}`}
Reply with ONE JSON object: {"say":"at most one short sentence","actions":[{"tool":"...","args":{...}}],"done":true}
Tools:
- ams_update {"id","patch"}: change a mark, one action per mark. id is a mark's id from the lists above, or a word for it: "selected", "circle", "square", "line", "red", "all". patch fields: fill, color (the stroke or outline), strokeWidth, opacity (0 to 1), blend, label, hidden, locked, realize (how a plane's fill is painted: {"brush":"flat"} or {"brush":"stipple"} or {"brush":"hatch","params":{"spacing":10,"angle":45,"cross":0}}; cross 1 is crosshatch). Change ONLY what was asked for. Colors are always #rrggbb, chosen by you, never words.
- ams_transform {"ids","move":[dx,dy],"scale":1.5,"rotate":degrees}: move, resize or turn marks (the selection if ids is left out). scale 1 is the same size, 1.5 half again bigger, 2 double, 0.5 half. Never rewrite points yourself.
- ams_delete {"ids"}: remove marks.
- ams_write_code {"request"}: have a code model write a program that draws it: use it for patterns and anything with many marks or that reads a picture (loops, grids, scatters, rings).
- ams_command {"id"}: view.frameSelection, edit.duplicate, edit.group, edit.ungroup, edit.delete, edit.selectAll, view.fit.
- ams_add {"role","points"} or {"shape","box","role":"plane"}: only to draw something new, one action per mark. role is point, line or plane; points are [[x,y],...]; shape is circle or rect, box is [x0,y0,x1,y1]; add "fill" or "color" as #rrggbb; add "repeat":{"count":3,"dx":300} for copies in a row ("dy" for a column). The page is 1000 by 1000.
Examples, for a mark el_x with fill #b05a3c:
"make it darker" -> {"say":"Darker.","actions":[{"tool":"ams_update","args":{"id":"el_x","patch":{"fill":"#6e3824"}}}],"done":true}
"give it a green outline" -> {"say":"Green outline.","actions":[{"tool":"ams_update","args":{"id":"el_x","patch":{"color":"#2e8b57"}}}],"done":true}
"cross hatch it" -> {"say":"Crosshatched.","actions":[{"tool":"ams_update","args":{"id":"el_x","patch":{"realize":{"brush":"hatch","params":{"cross":1}}}}}],"done":true}
"draw a green circle" -> {"say":"A green circle.","actions":[{"tool":"ams_add","args":{"role":"plane","shape":"circle","box":[410,410,590,590],"fill":"#2e8b57"}}],"done":true}
"draw a line from the top left to the bottom right" -> {"say":"A line.","actions":[{"tool":"ams_add","args":{"role":"line","points":[[100,100],[900,900]]}}],"done":true}
"a row of four squares" -> {"say":"Four squares.","actions":[{"tool":"ams_add","args":{"shape":"rect","box":[60,420,240,600],"fill":"#8a6f4e","repeat":{"count":4,"dx":240}}}],"done":true}
"make it bigger" -> {"say":"Bigger.","actions":[{"tool":"ams_transform","args":{"ids":["el_x"],"scale":1.5}}],"done":true}
"move it to the right" -> {"say":"Moved.","actions":[{"tool":"ams_transform","args":{"ids":["el_x"],"move":[200,0]}}],"done":true}
"duplicate it" -> {"say":"Duplicated.","actions":[{"tool":"ams_command","args":{"id":"edit.duplicate"}}],"done":true}
"call it horizon" -> {"say":"Named.","actions":[{"tool":"ams_update","args":{"id":"el_x","patch":{"label":"horizon"}}}],"done":true}
"a bit see-through" -> {"say":"Set to 60%.","actions":[{"tool":"ams_update","args":{"id":"el_x","patch":{"opacity":0.6}}}],"done":true}`;
}

function systemPrompt(app) {
  const tools = window.ams.listTools()
    .filter(t => !['ams_set', 'ams_answer', 'ams_pending'].includes(t.name))
    .map(t => `- ${t.name}(${Object.keys(t.inputSchema.properties || {}).filter(k => k !== 'narrate').join(', ')}): ${t.description.split('. ')[0]}.`).join('\n');
  const d = app.store.doc;
  const state = `Title: ${d.title}. Artboard ${d.artboard.width}×${d.artboard.height}. Stages: ${d.stages.map(s => `${s.name} (${d.elements.filter(e => e.stage === s.id).length})`).join(', ')}. Active stage: ${app.activeStage?.name}. View: ${app.view.mode}.`;
  return `You are the assistant inside Artist Model Studio, a workbench for drawing by process (Klee, Kandinsky, the algorists).
You act only through these tools; every action is shown to the user with a guide cursor and can be replayed.
${tools}
Every action may include "narrate": one short sentence explaining it to the user.
To draw, prefer ams_run_score with a score (JS: artboard, stage, point, line, plane, guide, gesture, note, decide, walk, circle, rect, random, noise, range). Call ams_vocabulary if you need the full vocabulary.
To show how something was done, use ams_sessions with action "replay".

Current state: ${state}

Reply with ONE JSON object and nothing else:
{"say": "what you tell the user", "actions": [{"tool": "ams_…", "args": {…}}], "done": true}
Set "done": false only if you need to see the results of your actions before continuing.`;
}

/**
 * Small models get the content of a JSON reply right and the closing brackets wrong (one missing, one too many, a ] where a } belongs).
 * Walk the text keeping the stack of what is open; a closer that is not the next one closes what is open above its match first,
 * a closer with nothing open to match is dropped, and what is still open at the end is closed.
 */
export function repairJson(text) {
  const t = String(text || ''), start = t.indexOf('{');
  if (start < 0) return null;
  const stack = []; let out = '', str = false;
  for (let i = start; i < t.length; i++) {
    const c = t[i];
    if (str) { out += c; if (c === '\\') { out += t[++i] ?? ''; } else if (c === '"') str = false; continue; }
    if (c === '"') { str = true; out += c; continue; }
    if (c === '{' || c === '[') { stack.push(c === '{' ? '}' : ']'); out += c; continue; }
    if (c === '}' || c === ']') {
      if (!stack.includes(c)) continue;                 // (a stray closer: nothing open for it)
      while (stack.length && stack[stack.length - 1] !== c) out += stack.pop();   // (close what the model forgot to)
      stack.pop(); out += c;
      if (!stack.length) return out;                    // (the object is whole: whatever follows is not part of it)
      continue;
    }
    out += c;
  }
  if (str) out += '"';
  while (stack.length) out += stack.pop();
  return out;
}

/** Every top-level {...} in a text (string-aware brace matching), in order. */
function objectsIn(text) {
  const out = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '{') continue;
    let depth = 0, str = false;
    for (let k = i; k < text.length; k++) {
      const c = text[k];
      if (str) { if (c === '\\') k++; else if (c === '"') str = false; continue; }
      if (c === '"') str = true;
      else if (c === '{') depth++;
      else if (c === '}' && --depth === 0) { out.push(text.slice(i, k + 1)); i = k; break; }
    }
  }
  return out;
}

/**
 * The model's reply: the first JSON object that says or does something. Models stray: thinking tags, the object
 * twice, prose around it; none of that is the reply, and a second copy must not run its actions again.
 */
export function parseReply(text) {
  const t = String(text || '').replace(/<(think|thinking|antThinking)>[\s\S]*?<\/\1>/gi, '').replace(/<\/?(think|thinking|antThinking)>/gi, '').trim();
  for (const src of objectsIn(t)) {
    try {
      const j = JSON.parse(src);
      if (j && typeof j === 'object' && ('say' in j || 'actions' in j)) return { say: String(j.say || ''), actions: Array.isArray(j.actions) ? j.actions : [], done: j.done !== false };
    } catch { /* not JSON: the next one */ }
  }
  // Brackets miscounted: close what is open and drop what is stray, then read it.
  const fixed = repairJson(t);
  if (fixed) { try { const j = JSON.parse(fixed); if (j && typeof j === 'object' && ('say' in j || 'actions' in j)) return { say: String(j.say || ''), actions: Array.isArray(j.actions) ? j.actions : [], done: j.done !== false, repaired: true }; } catch { /* no */ } }
  return { say: t, actions: [], done: true };
}

export function mountAssistant(root, app) {
  root.classList.add('wb-assistant-host');
  const wrap = h('div', { class: 'wb-assistant' });
  const log = h('div', { class: 'wb-chat' });
  const paintTraces = () => log.classList.toggle('no-trace', !assistantSettings().traces);   // (tool details are for debugging: off unless asked for)
  paintTraces();
  const input = h('textarea', { class: 'wb-compose-input', rows: 1, placeholder: 'Ask, or tell it what to draw…  (!board list runs a tool; !help)' });
  const chips = h('div', { class: 'wb-compose-chips' });
  let savedChat = [];
  try { savedChat = JSON.parse(sessionStorage.getItem('ams_assistant_chat') || '[]'); } catch { /* ignore */ }
  const history = app.assistantHistory = app.assistantHistory || savedChat;
  const persist = () => { try { sessionStorage.setItem('ams_assistant_chat', JSON.stringify(history.slice(-40))); } catch { /* quota */ } };
  let busy = null;
  const attachments = [];   // { name, text }
  const hint = h('div', { class: 'wb-chat-empty' }, h('b', {}, 'Assistant'), h('span', {}, 'Ask, or tell it to draw. It works through the same tools an agent uses, and every action is shown and can be replayed.'));
  // What you see is what you said: the context line and attached files travel with the message but stay out of the bubble (hover for them).
  const SPIN = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let spinTimer = 0;
  const spinTick = () => {
    const els = log.querySelectorAll('.wb-spin');
    if (!els.length) { clearInterval(spinTimer); spinTimer = 0; return; }
    const f = SPIN[Math.floor(performance.now() / 90) % SPIN.length];
    els.forEach(e => { e.textContent = f; });
  };
  const keepSpinning = () => { if (!spinTimer) spinTimer = setInterval(spinTick, 90); };
  const add = (who, text, kind = '') => {
    hint.remove();
    let shown = text, extra = {};
    if (who === 'you' && kind !== 'cmd') { const m = /^(\[Context:[^\]]*\])\n/.exec(text); if (m) { extra.title = m[1]; shown = text.slice(m[0].length); } shown = shown.replace(/\n\nAttached [\s\S]*$/, ''); }
    const el = h('div', { class: `wb-msg ${who} ${kind}`, ...extra }, ...(who === 'bot' && !kind ? [h('span', {}, shown), h('button', { class: 'wb-say-btn', type: 'button', title: 'Read aloud', html: '🔊', onclick: () => (app.speaker.speaking ? app.speaker.stop() : app.speaker.say(shown)) })] : kind === 'pending' ? [h('span', { class: 'wb-spin' }, SPIN[0]), h('span', { class: 'wb-pending-text' }, ` ${shown}`)] : [shown]));
    if (kind === 'pending') keepSpinning();
    if (who === 'you') trace = null;
    log.append(el); log.scrollTop = log.scrollHeight; return el;
  };

  // Say the reply as well as writing it, when that is switched on (⋯ › Speak replies, or Settings › Model › Voice).
  const autoSpeak = text => { if (voiceSettings().speak) app.speaker.say(text); };

  // The tool calls of a reply: one quiet line, "✓ changed 2", that opens to the calls and what came back. While it works it spins.
  let trace = null;
  const VERB = { ams_add: 'drew', ams_update: 'changed', ams_transform: 'moved', ams_delete: 'removed', ams_command: 'ran' };
  const paintTrace = t => {
    const counts = {}; let failed = 0;
    for (const c of t.calls) { if (c.error) failed++; else { const v = VERB[c.tool] || 'used'; counts[v] = (counts[v] || 0) + 1; } }
    const done = Object.entries(counts).map(([v, n]) => `${v} ${n}`).join(' · ');
    t.label.textContent = `${t.running ? '' : failed && !done ? '✗ ' : '✓ '}${t.running ? 'working' : done || (failed ? '' : 'done')}${failed ? `${done ? ' · ' : ''}${failed} did not work` : ''}`;
    t.el.classList.toggle('failed', failed > 0); t.el.classList.toggle('done', !t.running);
  };
  const traceStep = c => {
    if (!trace || trace.ended) {
      const label = h('span', { class: 'wb-trace-label' }), spin = h('span', { class: 'wb-spin' }, SPIN[0]), body = h('div', { class: 'wb-trace-body' });
      const el = h('details', { class: 'wb-trace' }, h('summary', {}, spin, ' ', label), body);
      trace = { el, label, spin, body, calls: [], running: true, ended: false };
      log.append(el); keepSpinning();
    }
    trace.calls.push(c);
    const brief = v => JSON.stringify(v ?? null).replace(/"data:image[^"]+"/g, '"<image>"').slice(0, 240);
    trace.body.append(h('div', { class: `wb-trace-line${c.error ? ' error' : ''}` }, h('b', {}, `${c.error ? '✗' : '✓'} ${c.tool.replace(/^ams_/, '')}`), ' ', brief(c.args), h('div', { class: 'wb-trace-out' }, c.error ? c.error : `→ ${brief(c.out)}`)));
    paintTrace(trace); log.scrollTop = log.scrollHeight;
  };
  const traceEnd = () => { if (trace && !trace.ended) { trace.ended = true; trace.running = false; trace.spin.remove(); paintTrace(trace); } };
  // The console: ! lines run tools directly (no model); ↑ and ↓ go through what was run.
  const ran = []; let back = 0;
  const runCommand = async line => {
    add('you', line, 'cmd'); history.push({ who: 'you', text: line });
    ran.push(line); back = 0;
    try {
      const c = parseCommand(line);
      if (c.help) { add('sys', help(window.ams.listTools(), c.help), 'out'); return; }
      const out = await window.ams.callTool(c.tool, c.args);
      add('sys', brief(out), 'out');
      history.push({ who: 'results', text: `${c.tool} → ${brief(out, 600)}` });
    } catch (err) { add('sys', err.message, 'error'); }
    persist();
  };
  if (history.length) {
    for (const m of history) {
      if (m.who !== 'results') { traceEnd(); add(m.who, m.text); continue; }
      for (const line of String(m.text).split('\n')) { const mm = /^(\w+) (?:→ (.*)|failed: (.*))$/.exec(line); if (mm) traceStep({ tool: mm[1], args: null, out: mm[2] ? (() => { try { return JSON.parse(mm[2]); } catch { return mm[2]; } })() : undefined, error: mm[3] }); }
    }
    traceEnd();
  } else log.append(hint);

  // ---- the composer: attachments, the text, then the controls: attach, model, tools, send ------------------------------
  const paintChips = () => chips.replaceChildren(...attachments.map((a, i) => h('span', { class: 'wb-chip', title: `${a.text.length} characters` }, `📎 ${a.name}`, h('button', { class: 'wb-chip-x', title: 'Remove', onclick: () => { attachments.splice(i, 1); paintChips(); } }, '×'))));
  const fileIn = h('input', { type: 'file', hidden: true, accept: '.txt,.md,.json,.js,.mjs,.ts,.css,.html,.svg,.csv,.yaml,.yml,text/*' });
  fileIn.addEventListener('change', async () => {
    for (const f of fileIn.files) { const t = await f.text(); attachments.push({ name: f.name, text: t.slice(0, ATTACH_MAX) }); if (t.length > ATTACH_MAX) add('sys', `${f.name}: only the first ${ATTACH_MAX} characters go to the model.`); }
    fileIn.value = ''; paintChips(); input.focus();
  });
  const attachMenu = e => {
    const r = e.currentTarget.getBoundingClientRect(), b = app.store.doc.boards.find(x => x.id === app.activeBoard) || null;
    const sel = [...app.canvas.selected];
    showMenu([
      { label: 'Attach a text file…', hint: 'Code, Markdown, JSON or SVG: its text goes with your next message', run: () => fileIn.click() },
      { label: 'Add the selected marks', disabled: !sel.length, hint: 'The selection as studio JSON', run: () => { const d = app.selectionDoc?.(sel); if (d) { attachments.push({ name: `selection (${sel.length} marks)`, text: JSON.stringify(d).slice(0, ATTACH_MAX) }); paintChips(); } } },
      { label: 'Add this board’s code', disabled: !b?.code, hint: 'The code of the board you are on', run: () => { attachments.push({ name: `${b.title} code`, text: String(b.code).slice(0, ATTACH_MAX) }); paintChips(); } }
    ], r.left, r.top - 6, { up: true });
  };
  const pill = modelPill(app);   // what it is talking to; the menu has the favorites, the engines and settings
  const toolsBtn = h('button', { class: 'wb-compose-pill', title: 'Let it use the studio’s tools (draw, change boards). Off: it only talks' });
  const paintTools = () => { const on = assistantSettings().tools; toolsBtn.classList.toggle('on', on); toolsBtn.replaceChildren(h('span', {}, 'Tools')); };
  toolsBtn.onclick = () => { setAssistantSettings({ tools: !assistantSettings().tools }); paintTools(); };
  const moreBtn = h('button', { class: 'wb-compose-icon', title: 'More', html: '⋯', onclick: e => { const r = e.currentTarget.getBoundingClientRect(); showMenu([
    { label: 'How did you do that?', hint: 'Replay the latest agent or assistant session with the guide', run: () => window.ams.callTool('ams_sessions', { action: 'replay' }).catch(err => app.log(err.message, 'error')) },
    { label: `${voiceSettings().speak ? '✓ ' : ''}Speak replies`, hint: 'Say each reply aloud as well as writing it (the voice and language: Settings › Model › Voice)', run: () => { const on = !voiceSettings().speak; setVoice({ speak: on }); if (!on) app.speaker.stop(); } },
    { label: `${assistantSettings().traces ? '✓ ' : ''}Show tool details`, hint: 'For debugging: each tool call and what came back, under every reply (always in the request log: ams_requests)', run: () => { setAssistantSettings({ traces: !assistantSettings().traces }); paintTraces(); } },
    { label: 'Clear the conversation', run: () => { history.length = 0; log.replaceChildren(hint); persist(); } }
  ], r.left, r.top - 6, { up: true }); } });
  const sendBtn = h('button', { class: 'wb-compose-send', title: 'Send (Enter)', html: SEND, onclick: () => (busy ? busy.abort() : send()) });
  const grow = () => { input.style.height = 'auto'; input.style.height = `${Math.min(input.scrollHeight, 180)}px`; };
  input.addEventListener('input', grow);
  const micHost = h('span', { class: 'wb-mic-host' });
  // Speak replies: a small speaker beside the mic, on or off (the voice and language are in Settings › Model › Voice)
  const SPEAKER = on => `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="${on ? 'currentColor' : 'none'}"/>${on ? '<path d="M15.5 9a4.2 4.2 0 010 6M18 6.5a8 8 0 010 11"/>' : '<path d="M16 9.5l5 5M21 9.5l-5 5"/>'}</svg>`;
  const speakBtn = h('button', { class: 'wb-compose-icon wb-speak-toggle', type: 'button', onclick: () => { const on = !voiceSettings().speak; setVoice({ speak: on }); if (!on) app.speaker.stop(); } });
  const paintSpeak = () => { const on = voiceSettings().speak; speakBtn.innerHTML = SPEAKER(on); speakBtn.classList.toggle('on', on); speakBtn.title = on ? 'Spoken replies: on (click to turn off)' : 'Spoken replies: off (click to hear replies)'; };
  window.addEventListener('ams-voice', paintSpeak);
  paintSpeak();
  const composer = h('div', { class: 'wb-composer' }, chips, input, h('div', { class: 'wb-compose-row' },
    h('button', { class: 'wb-compose-icon', title: 'Attach', html: icon('plus'), onclick: attachMenu }), pill, toolsBtn, h('span', { style: { flex: 1 } }), moreBtn, speakBtn, micHost, sendBtn), fileIn);
  attachMic(input, { host: micHost, onDone: text => { if (looksReady(text) && !busy) send(); } });
  paintTools();

  app.assistantAsk = (text, opts) => { input.value = text; return send(opts); };
  /** flow: from the quick command field: act without asking, no guide cursor, undone as one step. Returns { say } or { error }. */
  const send = async ({ flow = false, visible = false } = {}) => {   // visible: a quick-field request that is acted out (the guide cursor, captions) instead of done quietly
    const text = input.value.trim();
    if (busy && flow) { input.value = ''; return { error: 'Still working on the last request.' }; }
    if (!text || busy) return;
    input.value = ''; grow();
    if (text.startsWith('!')) { await runCommand(text); return; }
    const files = attachments.splice(0); paintChips();
    add('you', files.length ? `${text}\n${files.map(f => `📎 ${f.name}`).join('  ')}` : text);
    const full = files.length ? `${text}\n\n${files.map(f => `Attached ${f.name}:\n\`\`\`\n${f.text}\n\`\`\``).join('\n\n')}` : text;
    history.push({ who: 'you', text: full }); persist();
    const cfg = assistantSettings(), engine = currentEngine();
    const artist = app.artists.get(engine);
    // Unset: Ollama applies the model's own recommendation; other engines get a plain default.
    const askTemp = (v, kind) => (v != null ? v : engine === 'ollama' || engine === 'lfm3' ? undefined : FALLBACK_TEMPERATURE[kind]);   // (Ollama and LFM3 have their own recommendation: Ollama applies it, LFM3 is greedy)
    if (!artist?.complete || engine === 'agent') { add('sys', 'Pick a model engine (Ollama, WebGPU, OpenRouter or OpenAI-compatible) from the model button. An external agent drives the tools directly over MCP.', 'error'); return { error: 'Pick a model engine: click here for the Assistant.' }; }
    busy = new AbortController();
    const onStatus = e => { const p = log.querySelector('.pending .wb-pending-text'); if (p) p.textContent = ` ${e.detail}`; };   // (an engine that has to load first says how far it is)
    window.addEventListener('ams-engine-status', onStatus);
    if (flow) app.store.beginStep();
    const rq = flow ? app.requests?.start(text.replace(/^\[Context:[^\]]*\]\n/, ''), 'model', { model: `${engine}:${artist.model || ''}` }) : null, rqCalls = [];
    let nudged = false, retried = false, said = '', failed = '';
    sendBtn.innerHTML = STOP; sendBtn.title = 'Stop';
    let lastSig = '';
    let transcript = flow ? `USER: ${text}` : history.slice(-cfg.history).map(m => `${m.who === 'you' ? 'USER' : m.who === 'bot' ? 'ASSISTANT' : 'RESULTS'}: ${m.text}`).join('\n');
    try {
      if (flow && artist.chat && localStorage.getItem('ams_native_tools') === '1') {   // (off unless asked for: LFM3's own tool calling was less reliable than JSON with the brackets repaired; see docs)
        // A model with native tool calling does not write JSON: it calls the tools, and the results go back to it.
        const pending = add('sys', 'Working…', 'pending');
        let res;
        try {
          res = await artist.chat({ messages: [{ role: 'system', content: nativePrompt(app) }, { role: 'user', content: text }], tools: nativeToolset(app, { quiet: true, onCall: c => { rqCalls.push({ tool: c.tool, args: c.args, ...(c.error ? { error: c.error } : {}) }); traceStep(c); } }), signal: busy.signal, maxRounds: 3 });
        } finally { pending.remove(); }
        if (res.text) { said = res.text; add('bot', res.text); history.push({ who: 'bot', text: res.text }); autoSpeak(res.text); }
        if (res.calls.length && res.calls.every(c => c.error)) failed = res.calls.at(-1).error;
        history.push({ who: 'results', text: res.calls.map(c => c.error ? `${c.name} failed: ${c.error}` : `${c.name} → ${JSON.stringify(c.result ?? null).slice(0, 300)}`).join('\n') });
      } else if (!cfg.tools && !flow) {
        const pending = add('sys', 'Working…', 'pending');
        const raw = await artist.complete({ system: TALK_ONLY, user: transcript, temperature: askTemp(cfg.temperature, 'chat'), signal: busy.signal });
        pending.remove(); const say = String(raw || '').trim(); add('bot', say); history.push({ who: 'bot', text: say }); autoSpeak(say);
      } else for (let round = 0; round < cfg.rounds && !busy.signal.aborted; round++) {
        const pending = add('sys', round ? 'Reading the results…' : 'Working…', 'pending');
        const raw = await artist.complete({ system: flow ? flowPrompt(app) : systemPrompt(app), user: transcript, temperature: askTemp(flow ? cfg.flowTemperature : cfg.temperature, flow ? 'flow' : 'chat'), signal: busy.signal, json: true, ...(flow ? { maxTokens: 600 } : {}) });   // (json: an engine that can force valid JSON does; small models otherwise drop a brace)
        pending.remove();
        const r = parseReply(raw);
        // It asked anyway: once, tell it to assume and act.
        if (flow && !nudged && !r.actions.length && /\?\s*$/.test(r.say || '')) { nudged = true; transcript += `\nASSISTANT: ${JSON.stringify(r)}\nUSER: Do not ask. Make your best assumption and do it now.`; continue; }
        if (flow && !retried && !r.actions.length && /^\s*[{[]/.test(r.say || '')) { retried = true; transcript += '\nUSER: Reply with only one valid JSON object, nothing else.'; continue; }
        if (flow && !r.actions.length && /^\s*[{[]/.test(r.say || '')) { failed = 'The model’s reply could not be read. Nothing was changed.'; add('sys', failed, 'error'); break; }
        if (r.say) { said = r.say; add('bot', r.say); history.push({ who: 'bot', text: r.say }); autoSpeak(r.say); }
        if (!r.actions.length) break;
        const sig = JSON.stringify(r.actions);
        if (sig === lastSig) { add('sys', 'Stopped: the model repeated the same actions.', 'error'); break; }
        lastSig = sig;
        const results = [];
        for (const a of r.actions.slice(0, 8)) {
          try {
            const out = await window.ams.callTool(a.tool, visible && r.say && !a.args?.narrate && a === r.actions[0] ? { ...(a.args || {}), narrate: r.say } : (a.args || {}), { quiet: flow && !visible });
            rqCalls.push({ tool: a.tool, args: a.args || {} });
            const brief = JSON.stringify(out ?? null).replace(/"data:image[^"]+"/g, '"<image>"').slice(0, 600);
            results.push(`${a.tool} → ${brief}`);
            traceStep({ tool: a.tool, args: a.args || {}, out });
          } catch (err) {
            rqCalls.push({ tool: a.tool, args: a.args || {}, error: err.message });
            results.push(`${a.tool} failed: ${err.message}`);
            traceStep({ tool: a.tool, args: a.args || {}, error: err.message });
            failed = err.message;
          }
        }
        history.push({ who: 'results', text: results.join('\n') });
        if (r.done !== false) traceEnd();
        transcript += `\nASSISTANT: ${JSON.stringify(r)}\nRESULTS: ${results.join('\n')}`;
        // In flow mode a failed call gets one more try, with the error in front of the model (and the reminder to change what it sent).
        if (flow && !retried && results.some(x => / failed: /.test(x))) { retried = true; failed = ''; transcript += '\nUSER: That failed. Fix the arguments as the error says and do it again, with different arguments than before.'; continue; }
        if (r.done) break;
      }
    } catch (err) {
      log.querySelector('.pending')?.remove();
      add('sys', busy?.signal.aborted ? 'Stopped.' : `Error: ${err.message}`, busy?.signal.aborted ? '' : 'error');
      if (!busy?.signal.aborted) failed = err.message;
    } finally {
      traceEnd();
      window.removeEventListener('ams-engine-status', onStatus);
      if (flow) app.store.endStep();
      if (rq) app.requests.done(rq, { calls: rqCalls, error: failed, said });
      persist();
      busy = null;
      sendBtn.innerHTML = SEND; sendBtn.title = 'Send (Enter)';
    }
    return failed ? { error: failed } : { say: said };
  };

  input.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); return; }
    // ↑ / ↓ recall console commands (when the line is empty or already a recalled command).
    if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && ran.length && (!input.value || input.value.startsWith('!'))) {
      e.preventDefault();
      back = Math.max(0, Math.min(ran.length, back + (e.key === 'ArrowUp' ? 1 : -1)));
      input.value = back ? ran[ran.length - back] : '';
    }
  });
  wrap.append(log, composer);
  root.append(wrap);
}

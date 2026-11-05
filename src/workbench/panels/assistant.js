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
import { ENGINE_NAMES, currentEngine, setEngine, useModel, allFavorites, favorites, isFavorite, toggleFavorite, assistantSettings, setAssistantSettings } from '../modelStore.js';
import { parseCommand, brief, help } from '../console.js';

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
  return `You change a drawing in a drawing app, at once. Never ask a question or offer options: when something is unclear, choose the most sensible reading and do it. Undo is one key away.
${marks ? `Selected marks ("it" and "this" mean these):\n${marks}` : 'Nothing is selected.'}
Reply with ONE JSON object: {"say":"at most one short sentence","actions":[{"tool":"...","args":{...}}],"done":true}
Tools:
- ams_update {"id","patch"}: change a mark, one action per mark. patch fields: fill, color (the stroke or outline), strokeWidth, opacity (0 to 1), blend, label, hidden, locked, realize (how a plane's fill is painted: {"brush":"flat"} or {"brush":"stipple"} or {"brush":"hatch","params":{"spacing":10,"angle":45,"cross":0}}; cross 1 is crosshatch). Change ONLY what was asked for. Colors are always #rrggbb, chosen by you, never words.
- ams_command {"id"}: view.frameSelection, edit.duplicate, edit.group, edit.ungroup, edit.delete, edit.selectAll, view.fit.
- ams_add {"role","points"} or {"shape","box","role":"plane"}: only to draw something new, one action per mark. role is point, line or plane; points are [[x,y],...]; shape is circle or rect, box is [x0,y0,x1,y1]; add "fill" or "color" as #rrggbb. The page is 1000 by 1000.
Examples, for a mark el_x with fill #b05a3c:
"make it darker" -> {"say":"Darker.","actions":[{"tool":"ams_update","args":{"id":"el_x","patch":{"fill":"#6e3824"}}}],"done":true}
"give it a green outline" -> {"say":"Green outline.","actions":[{"tool":"ams_update","args":{"id":"el_x","patch":{"color":"#2e8b57"}}}],"done":true}
"cross hatch it" -> {"say":"Crosshatched.","actions":[{"tool":"ams_update","args":{"id":"el_x","patch":{"realize":{"brush":"hatch","params":{"cross":1}}}}}],"done":true}
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
  return { say: t, actions: [], done: true };
}

export function mountAssistant(root, app) {
  root.classList.add('wb-assistant-host');
  const wrap = h('div', { class: 'wb-assistant' });
  const log = h('div', { class: 'wb-chat' });
  const input = h('textarea', { class: 'wb-compose-input', rows: 1, placeholder: 'Ask, or tell it what to draw…  (!board list runs a tool; !help)' });
  const chips = h('div', { class: 'wb-compose-chips' });
  let savedChat = [];
  try { savedChat = JSON.parse(sessionStorage.getItem('ams_assistant_chat') || '[]'); } catch { /* ignore */ }
  const history = app.assistantHistory = app.assistantHistory || savedChat;
  const persist = () => { try { sessionStorage.setItem('ams_assistant_chat', JSON.stringify(history.slice(-40))); } catch { /* quota */ } };
  let busy = null;
  const attachments = [];   // { name, text }
  const hint = h('div', { class: 'wb-chat-empty' }, h('b', {}, 'Assistant'), h('span', {}, 'Ask, or tell it to draw. It works through the same tools an agent uses, and every action is shown and can be replayed.'));
  const add = (who, text, kind = '') => { hint.remove(); const m = h('div', { class: `wb-msg ${who} ${kind}` }, text); log.append(m); log.scrollTop = log.scrollHeight; return m; };
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
  if (history.length) for (const m of history) add(m.who, m.text); else log.append(hint);

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
    { label: 'Clear the conversation', run: () => { history.length = 0; log.replaceChildren(hint); persist(); } }
  ], r.left, r.top - 6, { up: true }); } });
  const sendBtn = h('button', { class: 'wb-compose-send', title: 'Send (Enter)', html: SEND, onclick: () => (busy ? busy.abort() : send()) });
  const grow = () => { input.style.height = 'auto'; input.style.height = `${Math.min(input.scrollHeight, 180)}px`; };
  input.addEventListener('input', grow);
  const composer = h('div', { class: 'wb-composer' }, chips, input, h('div', { class: 'wb-compose-row' },
    h('button', { class: 'wb-compose-icon', title: 'Attach', html: icon('plus'), onclick: attachMenu }), pill, toolsBtn, h('span', { style: { flex: 1 } }), moreBtn, sendBtn), fileIn);
  paintTools();

  app.assistantAsk = (text, opts) => { input.value = text; return send(opts); };
  /** flow: from the quick command field: act without asking, no guide cursor, undone as one step. Returns { say } or { error }. */
  const send = async ({ flow = false } = {}) => {
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
    if (!artist?.complete || engine === 'agent') { add('sys', 'Pick a model engine (Ollama, WebGPU, OpenRouter or OpenAI-compatible) from the model button. An external agent drives the tools directly over MCP.', 'error'); return { error: 'Pick a model engine: click here for the Assistant.' }; }
    busy = new AbortController();
    if (flow) app.store.beginStep();
    let nudged = false, said = '', failed = '';
    sendBtn.innerHTML = STOP; sendBtn.title = 'Stop';
    let lastSig = '';
    let transcript = flow ? `USER: ${text}` : history.slice(-cfg.history).map(m => `${m.who === 'you' ? 'USER' : m.who === 'bot' ? 'ASSISTANT' : 'RESULTS'}: ${m.text}`).join('\n');
    try {
      if (!cfg.tools && !flow) {
        const pending = add('sys', 'Working…', 'pending');
        const raw = await artist.complete({ system: TALK_ONLY, user: transcript, temperature: cfg.temperature, signal: busy.signal });
        pending.remove(); const say = String(raw || '').trim(); add('bot', say); history.push({ who: 'bot', text: say });
      } else for (let round = 0; round < cfg.rounds && !busy.signal.aborted; round++) {
        const pending = add('sys', round ? 'Reading the results…' : 'Working…', 'pending');
        const raw = await artist.complete({ system: flow ? flowPrompt(app) : systemPrompt(app), user: transcript, temperature: flow ? 0.3 : cfg.temperature, signal: busy.signal, json: true, ...(flow ? { maxTokens: 600 } : {}) });   // (json: an engine that can force valid JSON does; small models otherwise drop a brace)
        pending.remove();
        const r = parseReply(raw);
        // It asked anyway: once, tell it to assume and act.
        if (flow && !nudged && !r.actions.length && /\?\s*$/.test(r.say || '')) { nudged = true; transcript += `\nASSISTANT: ${JSON.stringify(r)}\nUSER: Do not ask. Make your best assumption and do it now.`; continue; }
        if (flow && !r.actions.length && /^\s*[{[]/.test(r.say || '')) { failed = 'The model’s reply could not be read. Nothing was changed.'; add('sys', failed, 'error'); break; }
        if (r.say) { said = r.say; add('bot', r.say); history.push({ who: 'bot', text: r.say }); }
        if (!r.actions.length) break;
        const sig = JSON.stringify(r.actions);
        if (sig === lastSig) { add('sys', 'Stopped: the model repeated the same actions.', 'error'); break; }
        lastSig = sig;
        const results = [];
        for (const a of r.actions.slice(0, 8)) {
          try {
            const out = await window.ams.callTool(a.tool, a.args || {}, { quiet: flow });
            const brief = JSON.stringify(out ?? null).replace(/"data:image[^"]+"/g, '"<image>"').slice(0, 600);
            results.push(`${a.tool} → ${brief}`);
            add('act', `${a.tool.replace(/^ams_/, '')} ✓`);
          } catch (err) {
            results.push(`${a.tool} failed: ${err.message}`);
            add('act', `${a.tool.replace(/^ams_/, '')} failed: ${err.message}`, 'error');
            failed = err.message;
          }
        }
        history.push({ who: 'results', text: results.join('\n') });
        transcript += `\nASSISTANT: ${JSON.stringify(r)}\nRESULTS: ${results.join('\n')}`;
        if (r.done) break;
      }
    } catch (err) {
      log.querySelector('.pending')?.remove();
      add('sys', busy?.signal.aborted ? 'Stopped.' : `Error: ${err.message}`, busy?.signal.aborted ? '' : 'error');
      if (!busy?.signal.aborted) failed = err.message;
    } finally {
      if (flow) app.store.endStep();
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

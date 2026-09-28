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
import { modelPicker } from '../modelPicker.js';
import { parseCommand, brief, help } from '../console.js';

const MAX_ROUNDS = 6;

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

function parseReply(text) {
  const t = String(text || '').trim();
  const block = t.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1] || t;
  const start = block.indexOf('{'), end = block.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try { const j = JSON.parse(block.slice(start, end + 1)); return { say: j.say || '', actions: Array.isArray(j.actions) ? j.actions : [], done: j.done !== false }; } catch { /* fall through */ }
  }
  return { say: t, actions: [], done: true };
}

export function mountAssistant(root, app) {
  const picker = modelPicker({ app, storageKey: 'ams_assistant_engine', onChange: () => {} });
  const log = h('div', { class: 'wb-chat' });
  const input = h('textarea', { class: 'wb-why', rows: 2, placeholder: 'Ask, or tell it what to draw… !board list runs a tool (!help)' });
  let savedChat = [];
  try { savedChat = JSON.parse(sessionStorage.getItem('ams_assistant_chat') || '[]'); } catch { /* ignore */ }
  const history = app.assistantHistory = app.assistantHistory || savedChat;
  const persist = () => { try { sessionStorage.setItem('ams_assistant_chat', JSON.stringify(history.slice(-40))); } catch { /* quota */ } };
  let busy = null;
  const add = (who, text, kind = '') => { log.append(h('div', { class: `wb-msg ${who} ${kind}` }, text)); log.scrollTop = log.scrollHeight; };
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
  for (const m of history) add(m.who, m.text);

  app.assistantAsk = text => { input.value = text; send(); };
  const send = async () => {
    const text = input.value.trim();
    if (!text || busy) return;
    input.value = '';
    if (text.startsWith('!')) { await runCommand(text); return; }
    add('you', text); history.push({ who: 'you', text }); persist();
    const engine = picker.engine();
    const artist = app.artists.get(engine);
    if (!artist?.complete || engine === 'agent') { add('sys', 'Pick a model engine (Ollama, WebGPU, OpenRouter or OpenAI-compatible). An external agent drives the tools directly over MCP.', 'error'); return; }
    busy = new AbortController();
    sendBtn.textContent = 'Stop';
    let lastSig = '';
    let transcript = history.slice(-12).map(m => `${m.who === 'you' ? 'USER' : m.who === 'bot' ? 'ASSISTANT' : 'RESULTS'}: ${m.text}`).join('\n');
    try {
      for (let round = 0; round < MAX_ROUNDS && !busy.signal.aborted; round++) {
        add('sys', round ? 'thinking about the results…' : 'thinking…', 'pending');
        const raw = await artist.complete({ system: systemPrompt(app), user: transcript, temperature: 0.4, signal: busy.signal });
        log.lastChild?.classList.contains('pending') && log.lastChild.remove();
        const r = parseReply(raw);
        if (r.say) { add('bot', r.say); history.push({ who: 'bot', text: r.say }); }
        if (!r.actions.length) break;
        const sig = JSON.stringify(r.actions);
        if (sig === lastSig) { add('sys', 'Stopped: the model repeated the same actions.', 'error'); break; }
        lastSig = sig;
        const results = [];
        for (const a of r.actions.slice(0, 8)) {
          try {
            const out = await window.ams.callTool(a.tool, a.args || {});
            const brief = JSON.stringify(out ?? null).replace(/"data:image[^"]+"/g, '"<image>"').slice(0, 600);
            results.push(`${a.tool} → ${brief}`);
            add('act', `${a.tool.replace(/^ams_/, '')} ✓`);
          } catch (err) {
            results.push(`${a.tool} failed: ${err.message}`);
            add('act', `${a.tool.replace(/^ams_/, '')} failed: ${err.message}`, 'error');
          }
        }
        history.push({ who: 'results', text: results.join('\n') });
        transcript += `\nASSISTANT: ${JSON.stringify(r)}\nRESULTS: ${results.join('\n')}`;
        if (r.done) break;
      }
    } catch (err) {
      log.lastChild?.classList.contains('pending') && log.lastChild.remove();
      add('sys', `Error: ${err.message}`, 'error');
    } finally {
      persist();
      busy = null;
      sendBtn.textContent = 'Send';
    }
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
  const sendBtn = h('button', { class: 'wb-btn primary', onclick: () => (busy ? busy.abort() : send()) }, 'Send');
  root.append(picker, log, input, h('div', { class: 'wb-row wb-row-actions' },
    sendBtn,
    h('button', { class: 'wb-btn', title: 'Replay the latest agent or assistant session with the guide', html: `${icon('play')}<span>How did you do that?</span>`, onclick: () => window.ams.callTool('ams_sessions', { action: 'replay' }).catch(e => add('sys', e.message, 'error')) }),
    h('button', { class: 'wb-btn', title: 'Clear the conversation', onclick: () => { history.length = 0; log.innerHTML = ''; } }, 'Clear')
  ));
}

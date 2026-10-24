/**
 * The score sequencer: a standalone page that plays a score with the score runtime (no editor), the built-in
 * General MIDI sound (TinySynth, loaded on the first play: the click), and an optional MIDI output.
 * The runtime is the clock here: this page moves the playhead (the external clock of Poliplan's `host` mode).
 */
import { EXAMPLES } from './examples.js';
import { createScoreRuntime, scoreExport } from '../score/runtime.js';
import { normalizeDocument } from '../process/document.js';
import { normalizeTransport } from '../time/sceneTransport.js';
import { createGmOutput } from '../score/outputs/gm.js';

const $ = id => document.getElementById(id);
const LOOK = 16;               // seconds before a demo's loop comes round (the scrub range)
const AHEAD = 0.2;             // seconds sent ahead of the playhead (on the audio clock)
const state = { ex: EXAMPLES[0], rt: null, t: 0, playing: false, rate: 1, last: 0, sent: 0, midi: null, events: [], flash: new Map() };
const gm = createGmOutput();

function load(ex) {
  const doc = normalizeDocument({ artboard: ex.doc.artboard, elements: ex.doc.elements });
  const json = JSON.parse(JSON.stringify(scoreExport(doc, normalizeTransport(ex.doc.settings))));
  state.rt = createScoreRuntime(json);
  state.ex = ex; state.t = 0; state.sent = 0; state.events = []; state.flash.clear();
  $('title').textContent = ex.title;
  $('blurb').textContent = ex.blurb;
  $('listen').textContent = ex.listen;
  seek(0);
}

function seek(t) {
  state.t = Math.max(0, t);
  state.rt.seek(state.t);
  state.rt.messages.length = 0;   // (the runtime rebuilds what is due from here)
  state.sent = state.t;
  gm.clear();
  $('scrub').value = state.t;
}

function send(m, now) {
  const at = now + Math.max(0, (m.t - state.t) / state.rate) * 1000;
  gm.send(m.bytes, at);
  if (state.midi) state.midi.send(m.bytes, at);
}

function frame(now) {
  const dt = state.last ? (now - state.last) / 1000 : 0;
  state.last = now;
  if (state.playing) {
    state.t += dt * state.rate;
    $('scrub').value = state.t % LOOK;
    if (state.t > LOOK) seek(state.t - LOOK);   // the demo loops
  }
  const target = state.t + AHEAD;
  const f = state.rt.features(target);
  for (const m of state.rt.messages) if (m.t > state.sent && m.t <= target) send(m, now);
  state.sent = Math.max(state.sent, target);
  for (const e of state.rt.recent(state.events.at(-1)?.seq ?? 0)) { state.events.push(e); state.flash.set(e.name, now); }
  draw(f, now);
  readout(f);
  requestAnimationFrame(frame);
}

function draw({ features }, now) {
  const c = $('stage'), g = c.getContext('2d'), W = c.width, H = c.height;
  g.clearRect(0, 0, W, H);
  const ex = state.ex.doc.artboard;
  g.strokeStyle = '#c9c4b8'; g.lineWidth = 1;
  // The paths, as the score drew them.
  for (const el of state.ex.doc.elements) {
    if (!el.points || el.points.length < 2) continue;
    g.beginPath();
    el.points.forEach(([x, y], i) => { const X = (x / ex.width) * W, Y = (y / ex.height) * H; if (i) g.lineTo(X, Y); else g.moveTo(X, Y); });
    if (el.closed) g.closePath();
    g.stroke();
  }
  // Travelers and events, from the signals.
  const names = new Set(Object.keys(features).map(k => k.split('.')[0]));
  for (const n of names) {
    if (features[`${n}.x`] === undefined) continue;
    const X = features[`${n}.x`] * W, Y = (1 - features[`${n}.y`]) * H;
    const hit = state.flash.get(n) !== undefined && now - state.flash.get(n) < 350;
    g.fillStyle = hit ? '#c8664f' : '#2b2a27';
    g.beginPath(); g.arc(X, Y, hit ? 9 : 6, 0, Math.PI * 2); g.fill();
  }
  for (const [n, t] of state.flash) if (now - t < 350 && features[`${n}.active`] !== undefined) {
    const el = state.ex.doc.elements.find(e => e.label === n);
    if (el?.points?.length) { const [x, y] = el.points[0]; g.fillStyle = 'rgba(200,102,79,.35)'; g.beginPath(); g.arc((x / ex.width) * W, (y / ex.height) * H, 18, 0, Math.PI * 2); g.fill(); }
  }
}

function readout({ features }) {
  const rows = Object.entries(features).filter(([k]) => /\.(u|active|x|lap)$/.test(k)).slice(0, 12);
  $('signals').textContent = rows.map(([k, v]) => `${k.padEnd(14)} ${typeof v === 'number' ? v.toFixed(3) : v}`).join('\n');
  $('clock').textContent = `${state.t.toFixed(2)} s`;
}

async function start() {
  await gm.resume().catch(() => {});   // the first play loads the sound (the click)
  state.playing = true; state.last = 0;
  $('play').textContent = 'Stop';
}
function stop() { state.playing = false; gm.clear(); $('play').textContent = 'Play'; }

async function midiOn(on) {
  if (!on) { state.midi = null; return; }
  try {
    const access = await navigator.requestMIDIAccess();
    const out = [...access.outputs.values()][0];
    if (!out) throw new Error('No MIDI output found');
    state.midi = { send: (bytes, at) => out.send(bytes, at) };
    $('midi-status').textContent = `MIDI: ${out.name}`;
  } catch (e) { $('midi').checked = false; $('midi-status').textContent = e.message; }
}

function init() {
  const sel = $('example');
  for (const ex of EXAMPLES) sel.append(new Option(ex.title, ex.id));
  sel.onchange = () => { stop(); load(EXAMPLES.find(e => e.id === sel.value)); };
  $('play').onclick = () => (state.playing ? stop() : start());
  $('rate').oninput = () => { state.rate = Number($('rate').value); $('rate-out').textContent = `${state.rate.toFixed(2)}×`; };
  $('scrub').max = LOOK; $('scrub').step = 0.01;
  $('scrub').oninput = () => { stop(); seek(Number($('scrub').value)); };
  $('midi').onchange = () => midiOn($('midi').checked);
  $('rewind').onclick = () => { stop(); seek(0); };
  load(EXAMPLES[0]);
  requestAnimationFrame(frame);
}
init();

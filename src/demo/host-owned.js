/**
 * The host-owned demo: the host runs the clock and makes its own sound; Poliplan only draws the score and reports
 * what it does. (init { clock: 'host', transport: false, sound: false }.) The clock is this page's: it sends the
 * position to the editor, and turns the score's events and traveler positions into sound with Web Audio.
 */
import { createEditor } from '../embed/client.js';
import { EXAMPLES } from './examples.js';

const $ = id => document.getElementById(id);
const dev = location.pathname.includes('/src/demo/');
const src = new URLSearchParams(location.search).get('src') || (dev ? '/embed.html' : '../embed.html');
const PENTA = [0, 3, 5, 7, 10];   // a minor pentatonic scale, for the events' pitch
const clock = { t: 0, playing: false, rate: 1, last: 0 };
let ctx = null, drone = null;

const audio = () => {
  if (ctx) return ctx;
  ctx = new AudioContext();
  const osc = ctx.createOscillator(), gain = ctx.createGain();
  osc.type = 'sine'; gain.gain.value = 0; osc.connect(gain).connect(ctx.destination); osc.start();
  drone = { osc, gain };
  return ctx;
};

/** An event is a blip: pitch from where it happened (height), at the host's own time for it. */
function blip(ev) {
  if (!ctx || ev.phase !== 'entry' && ev.phase !== 'cross') return;
  const y = Math.min(1, Math.max(0, ev.y ?? 0.5)), step = Math.floor(y * 14);
  const midi = 48 + 12 * Math.floor(step / 5) + PENTA[step % 5];
  const when = ctx.currentTime + Math.max(0, (ev.t - clock.t) / clock.rate);
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = 'triangle'; o.frequency.value = 440 * 2 ** ((midi - 69) / 12);
  g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(0.18, when + 0.01); g.gain.exponentialRampToValueAtTime(0.0005, when + 0.35);
  o.connect(g).connect(ctx.destination); o.start(when); o.stop(when + 0.4);
}

async function main() {
  const sel = $('example');
  for (const ex of EXAMPLES) sel.append(new Option(ex.title, ex.id));
  const editor = await createEditor($('editor'), { src, ns: 'poliplan-host-demo', theme: 'host', clock: 'host', transport: false, sound: false, fit: true });
  window.editor = editor;
  // Alt+Z hides the editor's tools (and again brings them back): in the editor it works by itself; on this page we ask.
  window.addEventListener('keydown', e => { if (e.altKey && e.code === 'KeyZ') { e.preventDefault(); editor.zen(); } });
  const open = async ex => {
    $('blurb').textContent = ex.blurb; $('listen').textContent = ex.listen;
    clock.playing = false; $('play').textContent = 'Play'; clock.t = 0;
    await editor.transport({ time: 0, playing: false, rate: clock.rate });
    await editor.load({ artboard: ex.doc.artboard, transport: ex.doc.settings, elements: ex.doc.elements });
    await editor.fit?.({ padding: 60 });
  };
  sel.onchange = () => open(EXAMPLES.find(e => e.id === sel.value));
  $('play').onclick = () => { audio().resume(); clock.playing = !clock.playing; clock.last = performance.now(); $('play').textContent = clock.playing ? 'Pause' : 'Play'; if (!clock.playing && drone) drone.gain.gain.value = 0; };
  $('rewind').onclick = () => { clock.t = 0; };
  $('rate').oninput = () => { clock.rate = Number($('rate').value); $('rate-out').textContent = `${clock.rate.toFixed(2)}×`; };

  // The host's clock: its own, sent to the editor ~30 times a second.
  setInterval(() => {
    const now = performance.now();
    if (clock.playing) clock.t += ((now - clock.last) / 1000) * clock.rate;
    clock.last = now;
    $('clock').textContent = `${clock.t.toFixed(2)} s`;
    editor.transport({ time: clock.t, playing: clock.playing, rate: clock.rate }).catch(() => {});
  }, 33);

  // What the score tells the host: events become blips, the first traveler's height a continuous tone.
  editor.subscribeScore({ hz: 25 }, f => {
    const k = Object.keys(f.features).find(n => n.endsWith('.y') && f.features[n.replace(/\.y$/, '.active')] !== undefined && f.features[n.replace(/\.y$/, '.u')] !== undefined);
    if (drone && ctx) { const on = clock.playing && k; drone.gain.gain.setTargetAtTime(on ? 0.04 : 0, ctx.currentTime, 0.05); if (on) drone.osc.frequency.setTargetAtTime(110 * 2 ** (f.features[k] * 2), ctx.currentTime, 0.05); }
    const rows = Object.entries(f.features).filter(([n]) => /\.(u|active)$/.test(n)).slice(0, 8);
    $('signals').textContent = rows.map(([n, v]) => `${n.padEnd(16)} ${typeof v === 'number' ? v.toFixed(2) : v}`).join('\n');
  }, blip);
  await open(EXAMPLES[0]);
}
main().catch(e => { $('blurb').textContent = `The editor did not start: ${e.message}`; });

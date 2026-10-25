/**
 * The Poliplan score demo: the editor is the sequencer (draw paths, travelers, events and nodes; play them with the
 * transport at the bottom, with the built-in sound). This page only picks an example drawing and loads it.
 */
import { createEditor } from '../embed/client.js';
import { EXAMPLES } from './examples.js';

const $ = id => document.getElementById(id);
const dev = location.pathname.includes('/src/demo/');
const src = new URLSearchParams(location.search).get('src') || (dev ? '/embed.html' : '../embed.html');

const documentOf = ex => ({ artboard: ex.doc.artboard, transport: ex.doc.settings, elements: ex.doc.elements });

async function main() {
  const sel = $('example');
  for (const ex of EXAMPLES) sel.append(new Option(ex.title, ex.id));
  const editor = await createEditor($('editor'), { src, ns: 'poliplan-score-demo', theme: 'host', fit: true });
  window.editor = editor;
  // Alt+Z hides the editor's tools (and again brings them back): in the editor it works by itself; on this page we ask.
  window.addEventListener('keydown', e => { if (e.altKey && e.code === 'KeyZ') { e.preventDefault(); editor.zen(); } });
  const show = ex => { $('blurb').textContent = ex.blurb; $('listen').textContent = ex.listen; };
  const open = async ex => {
    show(ex);
    await editor.callTool('ams_timeline', { action: 'pause' }).catch(() => {});
    await editor.load(documentOf(ex));
    await editor.callTool('ams_timeline', { action: 'seek', ms: 0 }).catch(() => {});
    await editor.fit?.({ padding: 60 });
  };
  sel.onchange = () => open(EXAMPLES.find(e => e.id === sel.value));
  await open(EXAMPLES[0]);
  // The signals the score makes, as a host sees them (a few, for show).
  const out = $('signals');
  editor.subscribeScore({ hz: 8 }, f => {
    const rows = Object.entries(f.features).filter(([k]) => /\.(u|active)$/.test(k)).slice(0, 8);
    out.textContent = rows.map(([k, v]) => `${k.padEnd(16)} ${typeof v === 'number' ? v.toFixed(2) : v}`).join('\n');
  });
}
main().catch(e => { $('blurb').textContent = `The editor did not start: ${e.message}`; });

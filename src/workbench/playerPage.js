/**
 * A script as one HTML file that plays on its own: the slide the script works on (its sketch running, its notes with the pseudocode, its
 * code), the narration inside as audio, and the same cursor, subtitles and keys as the studio. It performs the cues on the page's own
 * elements (so the sketch is dragged, the pseudocode opened and selected, the code selected), and afterwards everything on the page is
 * yours to use: drag the sketch, open the pseudocode, read the code.
 */
import { boardsOf, boardKind, boardsInFrame, isFrame } from '../process/boards.js';
import { renderMarkdown, esc, mathHtml } from '../process/markdown.js';
import { pseudoCss } from '../process/pseudo.js';
import { sketchPage } from './exportPage.js';
import RUNTIME from './playerRuntime.js?raw';
import DRAW from './scriptDraw.js?raw';

const json = v => JSON.stringify(v).replace(/</g, '\\u003c').replace(/[\u2028\u2029]/g, c => `\\u${c.charCodeAt(0).toString(16)}`);

const toDataUri = blob => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => no(r.error); r.readAsDataURL(blob); });

/** The titles a script's cues name. */
export function titlesOf(script) {
  const t = new Set();
  for (const c of script.cues) for (const x of [c.goto, c.restart, c.drag?.on, c.click?.summary, c.select?.pseudo, c.select?.code, c.draw?.on, c.formula?.on, c.clear?.on]) if (x) t.add(x);
  return [...t];
}

/**
 * The page. `app` gives the document and the sketch loaders; `clips` is one narration clip per cue ({ blob } or nothing), or [].
 */
export async function playerPageHtml(app, script, clips = [], { loadThreeFile, p5Text } = {}) {
  const doc = app.store.doc, all = boardsOf(doc);
  const first = script.cues.find(c => c.goto)?.goto;
  const frame = all.find(b => isFrame(b) && b.title === first);
  if (!frame) throw new Error(`The script starts on “${first}”, which is not a slide (a frame) in this scene.`);
  const inside = boardsInFrame(doc, frame).filter(b => !isFrame(b));
  const missing = titlesOf(script).filter(t => t !== frame.title && !inside.some(b => b.title === t));
  if (missing.length) throw new Error(`The script names boards outside its slide (not supported in a page yet): ${missing.join(', ')}`);

  const panes = [];
  for (const b of inside) {
    const kind = boardKind(b), box = `left:calc(var(--k) * ${Math.round(b.x - frame.x)}px);top:calc(var(--k) * ${Math.round(b.y - frame.y)}px);width:${Math.round(b.width)}px;height:${Math.round(b.height)}px`;
    const attrs = `class="pane ${kind}" data-board="${esc(b.title)}" style="${box};--ground:${/^#[0-9a-f]{3,8}$/i.test(b.ground || '') ? b.ground : '#1c1c1c'}"`;
    if (kind === 'three' || kind === 'p5') {
      const src = await sketchPage({ kind, title: b.title, code: b.code || '', ground: b.ground, controls: false, loadFile: loadThreeFile, p5Source: kind === 'p5' ? await p5Text() : '' });
      panes.push(`<div ${attrs}><iframe sandbox="allow-scripts allow-same-origin" srcdoc="${esc(src)}" title="${esc(b.title)}"></iframe></div>`);
    } else if (kind === 'markdown') {
      panes.push(`<div ${attrs}><div class="md">${renderMarkdown(b.code || '', { resolve: () => ({ missing: true }) })}</div></div>`);
    } else if (kind === 'code') {
      const of = all.find(x => x.id === b.of), lines = String(of?.code || '').replace(/\n$/, '').split('\n');
      panes.push(`<div ${attrs}><div class="head">${esc(b.title)}</div><div class="lines">${lines.map((l, i) => `<div class="ln"><i>${i + 1}</i><span class="t">${esc(l) || ' '}</span></div>`).join('')}</div></div>`);
    } else if (kind === 'html') {
      panes.push(`<div ${attrs}><iframe sandbox="allow-scripts" srcdoc="${esc(b.code || '')}" title="${esc(b.title)}"></iframe></div>`);
    }
  }
  const clipUris = await Promise.all(script.cues.map(async (c, i) => (clips[i]?.blob ? toDataUri(clips[i].blob) : null)));
  // the TeX in the cues, made into HTML here (the page has no KaTeX)
  const math = {};
  const texes = script.cues.flatMap(c => [c.formula?.tex, ...(c.draw?.shapes || []).map(x => x.tex)]).filter(Boolean);
  for (const t of texes) math[t] = mathHtml(t, false);
  const data = { math, title: script.title, id: script.id, W: Math.round(frame.width), H: Math.round(frame.height), cues: script.cues, clips: clipUris };
  const usesMath = panes.join('').includes('katex') || texes.length > 0;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(script.title)}</title>
${usesMath ? '<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.18.9/dist/katex.min.css">' : ''}
<style>${CSS}\n${pseudoCss('.md', { fg: '#e6e4de', muted: '#8d8b85', line: '#5b5a56' })}</style></head>
<body>
<main class="stage" style="--W:${data.W}px;--H:${data.H}px">${panes.join('\n')}</main>
<div class="cur" hidden><svg viewBox="0 0 28 34" width="22" height="27"><path d="M2 2v25l7-7 5 12 5-2-5-12h10L2 2z" fill="#f4f4f2" stroke="#1c1c1c" stroke-width="1.6" stroke-linejoin="round"/></svg></div>
<div class="halo"></div>
<div class="mouse"><svg viewBox="0 0 24 32" width="22" height="30"><rect class="body" x="3" y="2" width="18" height="28" rx="9"/><path class="l" d="M3 12V11a9 9 0 019-9v10z"/><path class="r" d="M12 2a9 9 0 019 9v1h-9z"/><path d="M3 12h18M12 2v10" fill="none"/></svg></div>
<div class="sub"></div><div class="keys"></div>
<div class="ui"><div class="title">${esc(script.title)}</div><button class="play" title="Play with sound (Space)">▶ Play</button>
<span class="ctl" hidden><button class="pause" title="Pause between steps (Space)">Pause</button><button class="stop" title="Stop (Esc)">Stop</button></span>
<button class="cc on" title="Subtitles (C)">CC</button></div>
<script>${DRAW.slice(DRAW.indexOf('function scriptDraw')).replace(/^export .*$/m, '')}\n(${RUNTIME.slice(RUNTIME.indexOf('function playerRuntime'))})(${json(data)});</script>
</body></html>
`;
}

const CSS = `
*{box-sizing:border-box}html,body{margin:0;height:100%;background:#141414;color:#e6e4de;font:14px/1.5 system-ui,-apple-system,'Inter',sans-serif;overflow:hidden}
.stage{--k:1;position:absolute;left:50%;top:50%;width:calc(var(--k) * var(--W));height:calc(var(--k) * var(--H));transform:translate(-50%,-50%);background:#1a1a1a;border-radius:6px;overflow:hidden}
.pane{position:absolute;transform:scale(var(--k));transform-origin:0 0;background:var(--ground);border:1px solid #333;border-radius:4px;overflow:hidden}
.pane.flash{outline:2px solid #e0a030}
.pane iframe{width:100%;height:100%;border:0;display:block;background:transparent}
.pane.markdown{overflow:auto;padding:14px 16px}.pane.markdown .md{max-width:none}
.md h1,.md h2,.md h3{margin:.2em 0 .5em;line-height:1.25}.md h2{font-size:1.15em}.md p{margin:.5em 0;color:#cfcdc6}.md code{font:.88em ui-monospace,Menlo,monospace;color:#e0a030}
.md details.md-callout,.md div.md-callout{border-left:3px solid #6b7fd7;background:rgba(255,255,255,.05);border-radius:3px;padding:8px 12px;margin:.6em 0}
.md .md-callout summary{cursor:pointer;font-weight:600;list-style:none}.md .md-callout summary::-webkit-details-marker{display:none}
.md .md-callout-icon{margin-right:.5em;opacity:.7}.md pre{background:#101010;border:1px solid #333;border-radius:4px;padding:10px 12px;overflow:auto}
.md a{color:#e0a030}.md .pseudo{margin:.5em 0 0}.md li.sc-hl{background:rgba(224,160,48,.22);border-radius:3px}
.pane.code{display:flex;flex-direction:column;font:12px/1.55 ui-monospace,'JetBrains Mono',Menlo,monospace;background:#161616}
.pane.code .head{padding:4px 10px;font:11px system-ui;color:#8d8b85;border-bottom:1px solid #2a2a2a}
.pane.code .lines{overflow:auto;padding:6px 0;flex:1}.ln{display:flex;white-space:pre;padding-right:10px}.ln i{flex:none;width:3.2em;padding-right:1em;text-align:right;color:#666;font-style:normal;user-select:none}
.ln.sel{background:rgba(120,140,200,.28)}::selection{background:rgba(120,140,200,.45)}
.cur{position:fixed;left:0;top:0;z-index:30;pointer-events:none;filter:drop-shadow(0 2px 3px rgba(0,0,0,.4))}
.halo{position:fixed;left:0;top:0;width:28px;height:28px;border-radius:50%;border:2px solid #fff;opacity:0;z-index:29;pointer-events:none}.halo.on{animation:halo .5s ease-out}
@keyframes halo{from{opacity:.9;transform:var(--t) scale(.4)}to{opacity:0;transform:var(--t) scale(1.4)}}
.mouse{position:fixed;left:0;top:0;z-index:28;pointer-events:none;opacity:0;transition:opacity .15s;filter:drop-shadow(0 2px 3px rgba(0,0,0,.4))}.mouse.on{opacity:1}.mouse .body{fill:#f5f3ee;stroke:#1c1c1c;stroke-width:1.4}.mouse path{stroke:#1c1c1c;stroke-width:1.2;fill:transparent}.mouse.left .l,.mouse.right .r{fill:#e0a030}
.sub{position:fixed;left:50%;bottom:5%;transform:translateX(-50%);z-index:31;max-width:min(900px,86vw);padding:10px 20px;border-radius:10px;background:rgba(12,12,12,.8);color:#fff;font:600 clamp(15px,1.8vw,24px)/1.35 system-ui,sans-serif;text-align:center;opacity:0;pointer-events:none;transition:opacity .25s;text-wrap:balance}.sub.on{opacity:1}body.nocc .sub{display:none}
.keys{position:fixed;left:22px;bottom:5%;z-index:31;display:flex;flex-direction:column;gap:6px;pointer-events:none}.key{display:flex;gap:4px;opacity:0;transition:opacity .2s}.key.on{opacity:1}
.key kbd{min-width:30px;padding:5px 9px;border-radius:7px;background:#f5f3ee;color:#1c1c1c;border:1px solid #b9b5ab;border-bottom-width:3px;font:600 15px/1 system-ui;text-align:center}
.sc-over{position:absolute;inset:0;pointer-events:none;z-index:6;overflow:visible}.sc-label{position:absolute;white-space:nowrap;transform:translate(-50%,-50%);font:600 22px/1 'Latin Modern Roman','Times New Roman',Georgia,serif;text-shadow:0 0 4px #fff,0 0 4px #fff,0 0 2px #fff}.sc-label.sc-formula{color:#fff;background:rgba(18,18,22,.9);padding:8px 14px;border-radius:8px;box-shadow:0 4px 14px rgba(0,0,0,.35);text-shadow:none}
.ui{position:fixed;top:10px;left:14px;right:14px;z-index:32;display:flex;align-items:center;gap:8px;pointer-events:none}.ui>*{pointer-events:auto}.title{flex:1;color:#8d8b85;font-size:13px;pointer-events:none}
.ui button{font:inherit;color:#e6e4de;background:#262626;border:1px solid #444;border-radius:6px;padding:5px 12px;cursor:pointer}.ui button:hover{border-color:#999}.ui .play{background:#e0a030;color:#1a1a1a;border-color:#e0a030;font-weight:600}.ui .cc.on{border-color:#e0a030;color:#e0a030}
`;

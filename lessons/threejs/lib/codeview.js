// Code viewer for the lessons: a drawer with "Key ideas" (curated snippets) and "Full code"
// (whole files, syntax highlighted, comments on/off). Highlights come from markers in the source:
//
//   // @key Title | one-line explanation
//   ...lines to highlight...
//   // @/key
//
// The markers are removed from what is shown. No dependencies.

const KW = new Set(('const let var function return if else for while of in new class extends import export from default await async ' +
  'try catch throw switch case break continue typeof instanceof this null undefined true false static get set void delete').split(' '));
const RE = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|('(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|`(?:\\.|[^`\\])*`)|(0x[\da-f]+|\b\d[\d_]*\.?\d*(?:e[+-]?\d+)?\b)|([A-Za-z_$][\w$]*)|([\s\S])/gy;
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// -> array of lines, each an HTML string; spans never cross a line break
export function highlightLines(src) {
  const lines = [[]]; RE.lastIndex = 0; let m;
  const push = (cls, text) => text.split('\n').forEach((part, i) => {
    if (i) lines.push([]);
    if (part) lines.at(-1).push(cls ? `<span class="${cls}">${esc(part)}</span>` : esc(part));
  });
  while ((m = RE.exec(src))) {
    if (m[1]) push('c', m[1]); else if (m[2]) push('s', m[2]); else if (m[3]) push('n', m[3]);
    else if (m[4]) {
      const next = src[RE.lastIndex] === '(', t = m[4];
      push(KW.has(t) ? 'k' : next ? 'f' : /^[A-Z]/.test(t) ? 't' : '', t);
    } else push('', m[5]);
  }
  return lines.map(l => l.join(''));
}
export const highlight = src => highlightLines(src).join('\n');

// strip @key markers; returns { text, keys:[{title,note,from,to}] } with 0-based inclusive line numbers in the stripped text
export function parse(src) {
  const out = [], keys = []; let cur = null;
  for (const line of src.split('\n')) {
    let m;
    if ((m = /^\s*\/\/ @key (.+?)(?: \| (.*))?\s*$/.exec(line))) cur = { title: m[1], note: m[2] || '', from: out.length };
    else if (/^\s*\/\/ @\/key\s*$/.test(line)) { if (cur) { cur.to = out.length - 1; keys.push(cur); cur = null; } }
    else out.push(line);
  }
  return { text: out.join('\n'), keys };
}

const css = `
.cv-btn{position:fixed;right:12px;bottom:12px;z-index:20;background:var(--panel);color:var(--ink);border:1px solid var(--line);border-radius:6px;padding:4px 10px;font:600 14px ui-monospace,monospace;cursor:pointer}
.cv{position:fixed;top:0;right:0;bottom:0;width:min(780px,94vw);z-index:30;background:var(--panel);border-left:1px solid var(--line);display:none;flex-direction:column;box-shadow:-8px 0 24px #0006}
.cv.open{display:flex}
.cv header{display:flex;gap:6px;align-items:center;padding:8px 12px;border-bottom:1px solid var(--line);flex-wrap:wrap}
.cv header button,.cv header select{background:none;color:var(--ink);border:1px solid var(--line);border-radius:6px;padding:3px 10px;font:inherit;cursor:pointer}
.cv header button[aria-selected=true]{background:var(--accent);color:#000;border-color:var(--accent)}
.cv header label{font-size:13px;color:var(--dim);display:flex;gap:4px;align-items:center}
.cv .sp{flex:1}
.cv-body{overflow:auto;flex:1;padding:10px 14px 40px}
.cv-card{border:1px solid var(--line);border-radius:8px;padding:10px 12px;margin:10px 0}
.cv-card h3{margin:0 0 2px;font-size:14px} .cv-card p{margin:2px 0 6px;color:var(--dim);font-size:13px} .cv-card .cf{font:11.5px ui-monospace,monospace;color:var(--dim)}
.cv-card pre{margin:6px 0;border:0;background:var(--bg)} .cv-card button{background:none;border:0;color:var(--accent);cursor:pointer;font:inherit;padding:0}
.cv-code{font:12.5px/1.55 ui-monospace,Menlo,monospace;counter-reset:l}
.cv-code .l{white-space:pre;min-height:1.55em}
.cv-code .l::before{content:attr(data-n);display:inline-block;width:3.2em;text-align:right;padding-right:1em;color:var(--dim);opacity:.6;user-select:none}
.cv-code .l.key{background:color-mix(in srgb,var(--accent) 14%,transparent);box-shadow:inset 3px 0 var(--accent)}
.cv-code .l .tag{position:absolute;right:20px;font:11px system-ui;color:var(--accent);opacity:.9}
.cv-code .l{position:relative}
.cv-code.nocomments .l.cm{display:none} .cv-code.nocomments .c{display:none}
.hl .k{color:#c678dd}.hl .s{color:#7fb86a}.hl .n{color:#d19a66}.hl .c{color:#7f848e;font-style:italic}.hl .f{color:#61afef}.hl .t{color:#e5c07b}
@media (prefers-color-scheme: light){.hl .k{color:#a626a4}.hl .s{color:#3d7d28}.hl .n{color:#b05a00}.hl .c{color:#8a8d95}.hl .f{color:#2368c4}.hl .t{color:#8a6a00}}
`;

// files: [{ path, label }] relative to the page. Returns { open }.
export function mountCodeView({ files }) {
  const st = document.createElement('style'); st.textContent = css; document.head.append(st);
  const btn = Object.assign(document.createElement('button'), { className: 'cv-btn', textContent: '‹›', title: 'Code: key ideas and the full source' });
  const el = document.createElement('div'); el.className = 'cv hl';
  el.innerHTML = `<header><button data-t="key" aria-selected="true" title="The few lines that carry the idea">Key ideas</button><button data-t="full" aria-selected="false" title="Whole files, highlighted">Full code</button>
    <select title="File"></select><label title="Show or hide the comments"><input type="checkbox" checked> comments</label><span class="sp"></span><button data-t="copy" title="Copy this file">⧉</button><button data-t="close" title="Close (Esc)">✕</button></header><div class="cv-body"></div>`;
  document.body.append(btn, el);
  const body = el.querySelector('.cv-body'), sel = el.querySelector('select'), cb = el.querySelector('input');
  files.forEach((f, i) => sel.add(new Option(f.label || f.path, i)));
  const cache = {}; let tab = 'key', scrollTo = null;
  const load = async i => cache[i] ??= (async () => { const t = await (await fetch(files[i].path)).text(); const p = parse(t); return { ...p, lines: highlightLines(p.text) }; })();

  async function render() {
    el.querySelectorAll('[data-t=key],[data-t=full]').forEach(b => b.setAttribute('aria-selected', b.dataset.t === tab));
    sel.style.display = cb.parentElement.style.display = tab === 'full' ? '' : 'none';
    body.replaceChildren();
    if (tab === 'key') {
      for (let i = 0; i < files.length; i++) {
        const d = await load(i);
        for (const k of d.keys) {
          const c = document.createElement('div'); c.className = 'cv-card';
          const code = d.lines.slice(k.from, k.to + 1);
          c.innerHTML = `<div class="cf">${files[i].label || files[i].path}</div><h3>${esc(k.title)}</h3>${k.note ? `<p>${esc(k.note)}</p>` : ''}<pre>${code.join('\n')}</pre><button>in the full code ↗</button>`;
          c.querySelector('button').onclick = () => { sel.value = i; tab = 'full'; scrollTo = k.from; render(); };
          body.append(c);
        }
      }
      if (!body.children.length) body.textContent = 'No key ideas marked in these files.';
    } else {
      const d = await load(+sel.value), root = document.createElement('div');
      root.className = 'cv-code' + (cb.checked ? '' : ' nocomments');
      const keyAt = new Map(); d.keys.forEach(k => { for (let n = k.from; n <= k.to; n++) keyAt.set(n, k); });
      d.lines.forEach((h, n) => {
        const l = document.createElement('div'), k = keyAt.get(n);
        l.className = 'l' + (k ? ' key' : '') + (/^\s*<span class="c">/.test(h) && !/<\/span>./.test(h.replace(/<span class="c">.*?<\/span>/, '')) ? ' cm' : '');
        l.dataset.n = n + 1; l.id = 'cvl' + n;
        l.innerHTML = h + (k && n === k.from ? `<span class="tag">${esc(k.title)}</span>` : '');
        root.append(l);
      });
      body.append(root);
      if (scrollTo != null) { body.querySelector('#cvl' + scrollTo)?.scrollIntoView({ block: 'center' }); scrollTo = null; }
    }
  }
  const open = () => { el.classList.add('open'); render(); };
  btn.onclick = () => el.classList.contains('open') ? el.classList.remove('open') : open();
  el.addEventListener('click', e => {
    const t = e.target.dataset?.t;
    if (t === 'close') el.classList.remove('open');
    else if (t === 'key' || t === 'full') { tab = t; render(); }
    else if (t === 'copy') load(+sel.value).then(d => navigator.clipboard?.writeText(d.text));
  });
  sel.onchange = render; cb.onchange = render;
  addEventListener('keydown', e => { if (e.key === 'Escape') el.classList.remove('open'); });
  return { open };
}

/**
 * Code help for p5.js and three.js sketches: completion and hover docs from TypeScript's language service, which
 * runs in a worker (public/lang/, built by scripts/build-language.mjs) and is fetched only when a sketch is first edited
 * with code help on. The source stays in the browser. After Genereti's language-service.
 */
import { hoverTooltip } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';

let worker = null, serial = 0, broken = false;
const requests = new Map();
const base = () => `${(import.meta.env && import.meta.env.BASE_URL) || '/'}lang/language-worker.mjs`;

function ask(data) {
  if (broken) return Promise.reject(Error('Code help is not available in this build'));
  if (!worker) {
    worker = new Worker(base(), { type: 'module' });
    worker.onmessage = ({ data: d }) => {
      const r = requests.get(d.id);
      if (!r) return;
      clearTimeout(r.timer); requests.delete(d.id);
      d.error ? r.reject(Error(d.error)) : r.resolve(d.result);
    };
    worker.onerror = () => {
      broken = true;
      for (const r of requests.values()) { clearTimeout(r.timer); r.reject(Error('Code help is not available')); }
      requests.clear(); worker.terminate(); worker = null;
    };
  }
  return new Promise((resolve, reject) => {
    const id = ++serial;
    const timer = setTimeout(() => { requests.delete(id); reject(Error('Code help timed out')); }, 20000);
    requests.set(id, { resolve, reject, timer });
    worker.postMessage({ ...data, id });
  });
}

const excluded = (state, pos) => /Comment|String|RegExp/i.test(syntaxTree(state).resolveInner(pos, -1).name);

const docDom = (signature, description) => {
  const dom = document.createElement('div');
  dom.className = 'cm-hover-doc cm-ts-doc';
  const sig = document.createElement('code'); sig.textContent = signature;
  dom.append(sig);
  if (description) { const d = document.createElement('div'); d.className = 'cm-ts-doc-text'; d.textContent = description; dom.append(d); }
  return dom;
};

/** Completion for a p5 or three sketch (`mode`). */
export const semanticCompletion = mode => async context => {
  if (excluded(context.state, context.pos)) return null;
  const word = context.matchBefore(/[\w$]+/), member = /\.\s*[\w$]*$/.test(context.state.sliceDoc(0, context.pos));
  if (!context.explicit && !word && !member) return null;
  const source = context.state.doc.toString(), pos = context.pos;
  try {
    const options = await ask({ mode, source, pos });
    if (context.aborted || !options.length) return null;
    return { from: word?.from ?? pos, validFor: /^[\w$]*$/, options: options.map(o => ({ ...o, info: async () => { const d = await ask({ mode, source, pos, operation: 'detail', name: o.label }); return docDom(d?.signature || o.label, d?.description || ''); } })) };
  } catch { return null; }
};

/** Hover docs: the signature and what the library says about it. */
export const semanticHover = mode => hoverTooltip(async (view, pos) => {
  if (excluded(view.state, pos)) return null;
  try {
    const info = await ask({ mode, source: view.state.doc.toString(), pos, operation: 'hover' });
    if (!info) return null;
    return { pos: info.from, end: info.to, above: true, create: () => ({ dom: docDom(info.signature, info.description) }) };
  } catch { return null; }
}, { hoverTime: 350 });

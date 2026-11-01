/**
 * How code editors look, for all of them: line numbers on or off, and where parameter sliders go
 * ('code': on the lines, right side; 'preview': a strip beside the preview; 'off').
 */
const KEY = 'ams_code_view';
const listeners = new Set();
let view = { lineNumbers: true, sliders: 'code', fontSize: 12, wrap: true, help: true, colorDots: true, ligatures: false, tabSize: 2 };
try { view = { ...view, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { /* ignore */ }

const apply = () => {
  try {
    const st = document.documentElement.style;
    st.setProperty('--code-fs', `${view.fontSize}px`);
    // Ligatures draw runs like ... and -> as one shape, which hides how many characters there are: off unless asked for.
    st.setProperty('--code-lig', view.ligatures ? 'normal' : 'none');
    st.setProperty('--code-feat', view.ligatures ? 'normal' : '"liga" 0, "calt" 0, "clig" 0');
  } catch { /* no document */ }
};
apply();

export const codeView = () => view;
/** Cmd+Shift +/−: the text size of code editors only (not the studio). */
export const bumpCodeFont = d => setCodeView({ fontSize: Math.min(28, Math.max(8, (Number(view.fontSize) || 12) + d)) });
export function setCodeView(patch) {
  view = { ...view, ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(view)); } catch { /* ignore */ }
  apply();
  for (const f of listeners) f(view);
}
export const onCodeView = f => { listeners.add(f); return () => listeners.delete(f); };

/**
 * How code editors look, for all of them: line numbers on or off, and where parameter sliders go
 * ('code': on the lines, right side; 'preview': a strip beside the preview; 'off').
 */
const KEY = 'ams_code_view';
const listeners = new Set();
let view = { lineNumbers: true, sliders: 'code' };
try { view = { ...view, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { /* ignore */ }

export const codeView = () => view;
export function setCodeView(patch) {
  view = { ...view, ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(view)); } catch { /* ignore */ }
  for (const f of listeners) f(view);
}
export const onCodeView = f => { listeners.add(f); return () => listeners.delete(f); };

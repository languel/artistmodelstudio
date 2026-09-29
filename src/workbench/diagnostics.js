/**
 * A flight recorder for "the page froze": every 2 s one line of what the page did in that interval,
 * plus the events that change a page's life (hidden, shown, frozen, resumed, errors). Kept in
 * localStorage (the last ~30 minutes), so it survives a reload and can be read after a freeze:
 * window.ams.diagnostics() in the console, or ams_diagnostics for agents.
 *
 * A line: t (time), vis (v visible / h hidden), foc (focus), raf (ms until the browser gave the page a
 * frame when asked, once per interval; -1: no frame at all),
 * draw (canvas redraws), heap (MB), smp (source samples), det (landmark detections), live (live
 * board runs), lag (worst event-loop delay, ms), long (long tasks, ms).
 *
 * Frozen-while-visible looks like vis v with raf -1: the page runs but is given no frames.
 * It asks for one frame per interval, not every frame: an idle page is left idle.
 */
const KEY = 'ams_flight_v1';
const MAX = 900;   // 2 s each: 30 minutes

export function startDiagnostics(app) {
  let log = [];
  try { log = JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { /* start fresh */ }
  const c = { raf: 0, smp: 0, det: 0, live: 0, lag: 0, long: 0 };
  let draws = app.canvas?.stats?.frames || 0;
  const push = entry => { log.push(entry); if (log.length > MAX) log.splice(0, log.length - MAX); };
  const event = (kind, detail = '') => push({ t: Date.now(), ev: kind, ...(detail ? { d: String(detail).slice(0, 200) } : {}) });
  event('load', location.href);

  // Whether the browser gives the page frames: one asked for per interval (none while hidden, and none
  // when it is stuck), timed. Not a loop over every frame, which would keep an idle page busy.
  let asked = 0;
  const probe = () => { const t0 = performance.now(); asked = t0; c.raf = -1; requestAnimationFrame(() => { if (asked === t0) c.raf = Math.round(performance.now() - t0); }); };
  probe();
  // Event-loop delay: a timer that should fire every 250 ms, and how late it is.
  let expect = performance.now() + 250;
  setInterval(() => { const now = performance.now(); c.lag = Math.max(c.lag, Math.round(now - expect)); expect = now + 250; }, 250);
  try { new PerformanceObserver(l => { for (const e of l.getEntries()) c.long += Math.round(e.duration); }).observe({ type: 'longtask' }); } catch { /* not supported */ }

  // Counting the studio's own work, without changing it.
  const S = app.sources;
  if (S) {
    const sample = S.sample.bind(S), detect = S.detect.bind(S);
    S.sample = e => { c.smp++; return sample(e); };
    S.detect = e => { if (e.want?.size && !e.busy) c.det++; return detect(e); };
  }
  app.store?.subscribe((doc, reason) => { if (reason === 'live board code') c.live++; }, { live: true });

  for (const [target, names] of [[document, ['visibilitychange', 'freeze', 'resume']], [window, ['focus', 'blur', 'pagehide', 'pageshow']]]) {
    for (const name of names) target.addEventListener(name, () => event(name, name === 'visibilitychange' ? document.visibilityState : ''));
  }
  window.addEventListener('error', e => event('error', e.message));
  window.addEventListener('unhandledrejection', e => event('rejection', e.reason?.message || e.reason));

  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(log)); } catch { log.splice(0, log.length >> 1); } };
  setInterval(() => {
    const d = app.canvas?.stats?.frames || 0;
    push({ t: Date.now(), vis: document.visibilityState[0], foc: document.hasFocus() ? 1 : 0, raf: c.raf, draw: d - draws, heap: Math.round((performance.memory?.usedJSHeapSize || 0) / 1e6), smp: c.smp, det: c.det, live: c.live, lag: c.lag, long: c.long });
    draws = d;
    Object.assign(c, { smp: 0, det: 0, live: 0, lag: 0, long: 0 });
    probe();
    save();
  }, 2000);
  window.addEventListener('pagehide', save);

  /** The recent log as text: one line per interval, events marked with >. */
  return (minutes = 30) => {
    const since = Date.now() - minutes * 60000;
    const time = t => new Date(t).toTimeString().slice(0, 8);
    return log.filter(x => x.t >= since).map(x => (x.ev
      ? `${time(x.t)} > ${x.ev}${x.d ? ` ${x.d}` : ''}`
      : `${time(x.t)} ${x.vis}${x.foc ? 'f' : ' '} raf ${String(x.raf).padStart(3)} draw ${String(x.draw).padStart(3)} heap ${x.heap} smp ${x.smp} det ${x.det} live ${x.live} lag ${x.lag} long ${x.long}`)).join('\n');
  };
}

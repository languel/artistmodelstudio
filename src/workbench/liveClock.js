/**
 * One clock for the live Timeline tracks (History and Interactions), so a click, the stroke it drew and the entry in History land at the same place.
 * Both come from real timestamps; long idle stretches are shortened the same way for both (a gap longer than `gap` ms is cut to it, the time inside
 * it squeezed in proportion), so they stay in step. Pure.
 *
 *   const clock = liveClock([t1, t2, …])   // every moment either track will use, real ms
 *   clock.at(t)                             // → ms from the first of them, with the gaps shortened
 */
export function liveClock(anchors, gap = 2000) {
  const a = [...new Set(anchors.filter(Number.isFinite))].sort((x, y) => x - y);
  const F = [0];
  for (let i = 1; i < a.length; i++) F[i] = F[i - 1] + Math.min(gap, a[i] - a[i - 1]);
  return {
    origin: a[0] ?? 0,
    at(t) {
      if (!a.length || t <= a[0]) return Math.min(0, (t - a[0]) || 0);
      let lo = 0, hi = a.length - 1;
      if (t >= a[hi]) return F[hi] + (t - a[hi]);
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (a[m] <= t) lo = m; else hi = m; }
      const L = a[lo + 1] - a[lo], C = F[lo + 1] - F[lo];
      return F[lo] + (t - a[lo]) * (L ? C / L : 0);
    }
  };
}

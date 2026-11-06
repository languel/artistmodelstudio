/**
 * Which takes carry the live History and Interactions tracks: those made (New take, Record, a first insert) in this session. A take is marked with where its live
 * tracks start: what was recorded since the last take was made, or since interaction recording began, else from now. Not saved with the take.
 */
export function markLive(app, take) {
  const I = app.interactions, now = Date.now();
  const from = I?.capturing && I.startedAt ? Math.max(I.startedAt, I.claimed || 0) : now;
  if (I) I.claimed = now;
  Object.defineProperty(take, '_liveFrom', { value: from, writable: true, configurable: true, enumerable: false });
  return take;
}

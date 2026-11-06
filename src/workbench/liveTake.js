/**
 * Which takes carry the live History and Interactions tracks, and how they are kept.
 *   a take made now (New take): starts from now, built once and then left alone: it does not keep growing while you work on it
 *   a take made with the record button: grows while it records (on the transport's own time: what you did at second 12 of the recording is at 12 s), then is left alone
 *   "Take from the recording": starts from when interaction recording began, built once
 * Not saved with the take (the saved copy keeps the tracks as plain clips).
 */
export function markLive(app, take, from = Date.now(), { record = false, at = 0 } = {}) {
  const set = (k, v) => Object.defineProperty(take, k, { value: v, writable: true, configurable: true, enumerable: false });
  set('_liveFrom', from); set('_liveRecording', record); set('_liveRealtime', record); set('_liveAt', at); set('_liveDone', false);
  return take;
}

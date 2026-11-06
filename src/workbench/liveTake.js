/**
 * Which takes carry the live History and Interactions tracks: those made (New take, Record, a first insert) in this session. A take made now starts its live
 * tracks from now: nothing before it is carried over. `from` starts them earlier: "Take from the recording" uses when interaction recording began.
 * Not saved with the take.
 */
export function markLive(app, take, from = Date.now()) {
  Object.defineProperty(take, '_liveFrom', { value: from, writable: true, configurable: true, enumerable: false });
  return take;
}

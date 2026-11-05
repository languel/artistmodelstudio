/**
 * Undo for the Timeline. A take lives outside the drawing's store (its clips and tracks are not in
 * the document), so the drawing's undo never saw clip edits. This keeps the Timeline's states (the
 * take's clips and tracks, In and Out, the loop region): each edit adds one; a drag that changes
 * something many times a second adds one in all (changes of one kind within `merge` ms of each other
 * are one step).
 */
export class TimelineUndo {
  constructor({ merge = 500, max = 120, key = s => JSON.stringify(s) } = {}) {
    this.merge = merge; this.max = max; this.key = key;
    this.reset(null);
  }

  /** Start over from a state (a take was opened, started or closed). */
  reset(state) { this.stack = state ? [state] : []; this.keys = state ? [this.key(state)] : []; this.i = this.stack.length - 1; this.lastKind = null; this.lastAt = 0; }

  /** The state after an edit. Nothing changes if it is the same as the current one. */
  push(state, kind = 'edit', now = Date.now()) {
    if (!state) return false;
    const k = this.key(state);
    if (this.i >= 0 && this.keys[this.i] === k) return false;
    const mergeIt = this.i > 0 && this.i === this.stack.length - 1 && kind === this.lastKind && now - this.lastAt < this.merge;
    this.stack.length = this.keys.length = this.i + 1;   // (a new edit drops what was undone)
    if (mergeIt) { this.stack[this.i] = state; this.keys[this.i] = k; }
    else { this.stack.push(state); this.keys.push(k); this.i++; }
    if (this.stack.length > this.max) { this.stack.shift(); this.keys.shift(); this.i--; }
    this.lastKind = kind; this.lastAt = now;
    return true;
  }

  get canUndo() { return this.i > 0; }
  get canRedo() { return this.i < this.stack.length - 1; }
  /** The state to go back to, or null. */
  undo() { if (!this.canUndo) return null; this.lastKind = null; return this.stack[--this.i]; }
  /** The state to go forward to, or null. */
  redo() { if (!this.canRedo) return null; this.lastKind = null; return this.stack[++this.i]; }
}

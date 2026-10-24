/**
 * Published values: what a score's code sends out under a name (`out('cutoff', ny)` in event code), kept
 * until the next value. Pure and dependency-free, so the kernel, the bus and the runtime can share it.
 *   publish(name, value, t)   get(name) → { value, t } | undefined   names() → string[]   clear()
 */
const values = new Map();
export const publish = (name, value, t = 0) => { if (typeof name === 'string' && name) values.set(name, { value, t }); };
export const get = name => values.get(name);
export const names = () => [...values.keys()];
export const clear = () => values.clear();

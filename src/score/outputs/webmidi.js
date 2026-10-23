/**
 * Web MIDI output: a score on real instruments and synths. The browser asks permission when `connect()`
 * is called, so call it from a click. Messages carry a time (a performance.now() value), which Web MIDI
 * schedules in the device itself, so notes keep their timing better than through a timer.
 *
 *   const midi = createWebMidiOutput()
 *   await midi.connect()          the ports are in midi.ports(); midi.select(id | 'all' | 'none')
 *   midi.send([0x90, 60, 100], atMs)
 */
export function createWebMidiOutput({ requestAccess = () => navigator.requestMIDIAccess({ sysex: false }), now = () => performance.now() } = {}) {
  let access = null, selected = 'none';
  const list = () => (access ? [...access.outputs.values()] : []);
  const targets = () => (selected === 'all' ? list() : selected === 'none' ? [] : list().filter(p => p.id === selected));
  const out = {
    id: 'webmidi', name: 'MIDI output',
    get connected() { return Boolean(access); },
    /** Ask the browser for MIDI access (a click); the first port is chosen if none was. */
    async connect() {
      if (!access) {
        access = await requestAccess();
        access.onstatechange = () => { if (selected !== 'all' && selected !== 'none' && !list().some(p => p.id === selected)) selected = 'none'; out.onchange?.(); };
      }
      if (selected === 'none' && list().length) selected = list()[0].id;
      return out.ports();
    },
    ports: () => list().map(p => ({ id: p.id, name: p.name || p.id })),
    get selected() { return selected; },
    select(id) { selected = id; },
    send(bytes, atMs) {
      const when = Number(atMs) > now() + 1 ? Number(atMs) : undefined;
      for (const p of targets()) { try { p.send(bytes, when); } catch { /* a port that went away */ } }
    },
    /** All notes off, sound off and sustain off on every channel, now. */
    clear() { for (const p of targets()) for (let c = 0; c < 16; c++) for (const n of [64, 120, 123]) { try { p.send([0xb0 | c, n, 0]); } catch { /* ignore */ } } }
  };
  return out;
}

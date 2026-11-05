/**
 * Input streams: the microphone, the camera and the screen, opened once and shared.
 *
 * Whatever wants a live stream (dictation, a lecture recording, a camera source) asks here, gets the same MediaStream while any of
 * them holds it, and lets go when the last one does, so the browser's recording light goes out the moment nothing needs it.
 * `level` reads a stream's loudness for a meter. The device a person chose is remembered.
 */
const held = new Map();   // key → { stream, count }
const pref = k => { try { return localStorage.getItem(`ams_input_${k}`) || ''; } catch { return ''; } };
const setPref = (k, v) => { try { v ? localStorage.setItem(`ams_input_${k}`, v) : localStorage.removeItem(`ams_input_${k}`); } catch { /* private mode */ } };

export const inputs = {
  supported: () => Boolean(navigator.mediaDevices?.getUserMedia),

  /** The devices of a kind ('audioinput' or 'videoinput'). Labels are empty until the person has allowed one once. */
  async devices(kind) {
    if (!navigator.mediaDevices?.enumerateDevices) return [];
    return (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === kind).map((d, i) => ({ id: d.deviceId, label: d.label || `${kind === 'audioinput' ? 'Microphone' : 'Camera'} ${i + 1}` }));
  },
  preferred: kind => pref(kind),
  prefer: (kind, id) => setPref(kind, id),

  /**
   * Open 'mic' or 'camera'. Returns { stream, release() }; call release when done (calling it twice is harmless).
   * Rejects with a message fit to show: the person said no, or there is no such device.
   */
  async open(what, { deviceId = '' } = {}) {
    if (!inputs.supported()) throw new Error('This browser cannot reach a microphone or camera here (it needs https or localhost).');
    const id = deviceId || pref(what);
    const key = `${what}:${id}`;
    let h = held.get(key);
    if (!h || h.stream.getTracks().every(t => t.readyState === 'ended')) {
      const constraints = what === 'mic'
        ? { audio: id ? { deviceId: { exact: id }, echoCancellation: true, noiseSuppression: true } : { echoCancellation: true, noiseSuppression: true } }
        : { video: id ? { deviceId: { exact: id }, width: { ideal: 1280 } } : { width: { ideal: 1280 } } };
      let stream;
      try { stream = await navigator.mediaDevices.getUserMedia(constraints); } catch (err) {
        throw new Error(err?.name === 'NotAllowedError' ? `The ${what === 'mic' ? 'microphone' : 'camera'} is blocked. Allow it in the address bar and try again.`
          : err?.name === 'NotFoundError' || err?.name === 'OverconstrainedError' ? `No ${what === 'mic' ? 'microphone' : 'camera'} found${id ? ' (the one you chose is not connected)' : ''}.`
            : `Could not open the ${what === 'mic' ? 'microphone' : 'camera'}: ${err?.message || err}`);
      }
      h = { stream, count: 0 };
      held.set(key, h);
    }
    h.count++;
    let done = false;
    return {
      stream: h.stream,
      release: () => {
        if (done) return; done = true;
        if (--h.count <= 0) { for (const t of h.stream.getTracks()) t.stop(); held.delete(key); }
      }
    };
  },

  /** A loudness meter on a stream: read() is 0..1 now (about a frame's worth, smoothed), stop() lets go. */
  level(stream) {
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = new AC(), src = ctx.createMediaStreamSource(stream), an = ctx.createAnalyser();
    an.fftSize = 512; src.connect(an);
    const buf = new Uint8Array(an.fftSize);
    let smooth = 0;
    return {
      read() {
        an.getByteTimeDomainData(buf);
        let peak = 0; for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i] - 128));
        const v = Math.min(1, (peak / 128) * 1.6);
        smooth = v > smooth ? v : smooth * 0.85 + v * 0.15;
        return smooth;
      },
      stop() { try { src.disconnect(); ctx.close(); } catch { /* already closed */ } }
    };
  }
};

/**
 * The sound of a render: the take's audio clips (a sound, narration), and media clips whose Volume is raised, mixed into
 * one stereo track for the range being rendered. Done offline (an OfflineAudioContext), so it takes no real time and is the
 * same each time. Clips start, trim and fade as on the Timeline (`offset`, `rate`/`speed`, `fx.fade`, `volume`, mute).
 */
import { flatClips } from '../process/take.js';

export const SAMPLE_RATE = 48000;

/** 16-bit PCM WAV bytes for planar float channels (the format ffmpeg reads without question). */
export function encodeWav(channels, sampleRate = SAMPLE_RATE) {
  const n = channels[0]?.length || 0, ch = channels.length, bytes = new Uint8Array(44 + n * ch * 2), v = new DataView(bytes.buffer);
  const put = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  put(0, 'RIFF'); v.setUint32(4, 36 + n * ch * 2, true); put(8, 'WAVE'); put(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
  v.setUint16(22, ch, true); v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * ch * 2, true); v.setUint16(32, ch * 2, true); v.setUint16(34, 16, true);
  put(36, 'data'); v.setUint32(40, n * ch * 2, true);
  let o = 44;
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) { const s = Math.max(-1, Math.min(1, channels[c][i])); v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); o += 2; }
  return bytes;
}

/**
 * What to play, as plain data: [{ key, src|blob, when (s from the range start), offset (s into the sound), dur (s of the
 * timeline it fills), rate, gain, fade (s) }]. Pure, so it can be checked without audio.
 */
export function soundPlan(take, [t0, t1], assetUrl = () => null) {
  const out = [];
  for (const c of flatClips(take)) {
    if (c.muted || c.start >= t1 || c.start + c.dur <= t0) continue;
    let src = null, offset = 0, rate = 1, gain = 1;
    if (c.track === 'audio' && c.src) { src = c.src; offset = (c.offset || 0) / 1000; rate = c.rate > 0 ? c.rate : 1; gain = c.volume ?? 1; }
    else if (c.track === 'media' && !c.board && !c.still && c.volume > 0 && (c.url || c.asset)) { src = c.url || assetUrl(c.asset); offset = c.in || 0; rate = c.speed > 0 ? c.speed : 1; gain = c.volume; }
    if (!src) continue;
    const skip = Math.max(0, t0 - c.start) / 1000;              // the clip began before the range: start inside it
    const when = Math.max(0, c.start - t0) / 1000, dur = (Math.min(c.start + c.dur, t1) - Math.max(c.start, t0)) / 1000;
    out.push({ key: c.asset ? `${c.track}:${c.asset}` : src, src, offset: offset + skip * rate, when, dur, rate, gain, fade: (c.fx?.fade || 0) / 1000, clip: c.id });
  }
  return out;
}

/** Mix a take's sound for [t0, t1] ms: { channels: [L, R], sampleRate } or null when there is none. */
export async function mixTake(app, take, range, { onStatus = null } = {}) {
  const urls = new Map();
  const assetUrl = id => urls.get(id);
  // Media clips kept as a copy in Assets have no address: make one from the blob.
  for (const c of flatClips(take)) if (c.track === 'media' && c.asset && !c.url && c.volume > 0) { try { const a = await app.assetStore.get(c.asset); if (a?.blob) urls.set(c.asset, URL.createObjectURL(a.blob)); } catch { /* no sound from it */ } }
  const plan = soundPlan(take, range, assetUrl);
  if (!plan.length) { for (const u of urls.values()) URL.revokeObjectURL(u); return null; }
  const length = Math.ceil((range[1] - range[0]) / 1000 * SAMPLE_RATE), ctx = new OfflineAudioContext(2, Math.max(1, length), SAMPLE_RATE);
  const cache = new Map();
  let used = 0;
  for (const p of plan) {
    try {
      let buf = cache.get(p.key);
      if (!buf) { onStatus?.('Mixing the sound…'); buf = await ctx.decodeAudioData(await (await fetch(p.src)).arrayBuffer()); cache.set(p.key, buf); }
      const src = ctx.createBufferSource(), g = ctx.createGain();
      src.buffer = buf; src.playbackRate.value = p.rate;
      g.gain.setValueAtTime(p.fade > 0 ? 0 : p.gain, p.when);
      if (p.fade > 0) { g.gain.linearRampToValueAtTime(p.gain, p.when + Math.min(p.fade, p.dur / 2)); g.gain.setValueAtTime(p.gain, Math.max(p.when, p.when + p.dur - p.fade)); g.gain.linearRampToValueAtTime(0, p.when + p.dur); }
      src.connect(g).connect(ctx.destination);
      src.start(p.when, Math.min(p.offset, Math.max(0, buf.duration - 0.001)), p.dur * p.rate);   // (duration is in the sound's own time)
      used++;
    } catch (err) { onStatus?.(`No sound from one clip: ${err.message}`); }
  }
  for (const u of urls.values()) URL.revokeObjectURL(u);
  if (!used) return null;
  const done = await ctx.startRendering();
  return { channels: [done.getChannelData(0), done.getChannelData(1)], sampleRate: SAMPLE_RATE };
}

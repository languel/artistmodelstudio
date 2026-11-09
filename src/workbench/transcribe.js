/**
 * Speech to text for audio clips: the words with their times, as notes on the clip or as a text track.
 *
 *   transcribeClip(app, clip, { as: 'notes' | 'track' | 'both' })
 *
 * The words come from Whisper running here (voice.js: about 40 MB the first time, nothing leaves the machine; English).
 * Each stretch of speech becomes
 *   notes  a note on the clip with a start and an end (kind note, by 'whisper'; src/process/marks.js), or
 *   track  a text clip on a track called Transcript: a Narration clip marked `transcript`, so it shows as a caption and is never
 *          read aloud by the voice engine.
 * Running it again replaces what an earlier run made (and only that: notes people wrote stay).
 */
import { addMark } from '../process/marks.js';
import { addTrack, tracksOf, clipId } from '../process/take.js';
import { transcribeTimed } from './voice.js';

const RATE = 16000;
export const TRANSCRIPT_TRACK = 'Transcript';

/** Whisper's chunks [{ text, timestamp: [s, e|null] }] → clean segments [{ text, start, end }] in seconds, inside 0..limit. */
export function segmentsFrom(chunks, limit = Infinity) {
  const rows = (chunks || []).map(c => ({ text: String(c.text || '').replace(/\s+/g, ' ').trim(), start: Number(c.timestamp?.[0]), end: c.timestamp?.[1] == null ? null : Number(c.timestamp[1]) }));
  const out = [];
  rows.forEach((r, i) => {
    if (!r.text || /^[\[(].*[\])]$/.test(r.text) || !Number.isFinite(r.start) || r.start >= limit) return;   // ([BLANK_AUDIO], (music)…)
    const next = rows.slice(i + 1).find(n => Number.isFinite(n.start));
    const end = Math.min(limit, r.end != null && Number.isFinite(r.end) ? r.end : next ? next.start : limit);
    out.push({ text: r.text, start: Math.max(0, r.start), end: Math.max(r.start + 0.2, end) });
  });
  return out;
}

/** The sound of a clip as 16 kHz mono samples: from its in-point (`offset`, ms) for its length. */
export async function clipSamples(clip) {
  const AC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const data = await (await fetch(clip.src)).arrayBuffer();
  const buf = await new AC(1, RATE, RATE).decodeAudioData(data);   // (decoded at 16 kHz)
  const ch = [...Array(buf.numberOfChannels)].map((_, i) => buf.getChannelData(i));
  const from = Math.max(0, Math.round((clip.offset || 0) / 1000 * RATE)), to = Math.min(buf.length, from + Math.round((clip.dur || 0) / 1000 * RATE));
  const out = new Float32Array(Math.max(0, to - from));
  for (let i = 0; i < out.length; i++) { let v = 0; for (let k = 0; k < ch.length; k++) v += ch[k][from + i]; out[i] = v / ch.length; }
  return out;
}

/** Put the segments on the clip as notes (replacing the ones an earlier run made). Returns how many. */
export function segmentsToNotes(clip, segments) {
  clip.marks = (clip.marks || []).filter(m => m.by !== 'whisper'); if (!clip.marks.length) delete clip.marks;
  for (const s of segments) addMark(clip, s.start * 1000, s.text, 'note', { end: s.end * 1000, by: 'whisper' });
  return segments.length;
}

/** Put the segments in the take as Transcript clips (replacing the ones an earlier run made from this clip). Returns the clips made. */
export function segmentsToTrack(take, clip, segments) {
  const tracks = tracksOf(take);
  const tr = tracks.find(t => t.kind === 'say' && t.name === TRANSCRIPT_TRACK) || addTrack(take, 'say', TRANSCRIPT_TRACK);
  take.clips = take.clips.filter(c => !(c.transcript && c.from === clip.id));
  const made = segments.map(s => ({ id: clipId(), track: 'say', lane: tr.id, start: Math.round(clip.start + s.start * 1000), dur: Math.max(200, Math.round((s.end - s.start) * 1000)), text: s.text, transcript: true, from: clip.id, fx: { fade: 80 } }));
  take.clips.push(...made);
  return made;
}

/**
 * Transcribe an audio clip. as: 'notes' (marks on the clip), 'track' (a Transcript track), or 'both'.
 * onStatus(text) says what is going on (the model is downloaded the first time). Returns { segments, notes, clips }.
 */
export async function transcribeClip(take, clip, { as = 'notes', onStatus = () => {} } = {}) {
  if (clip.track !== 'audio' || !clip.src) throw new Error('Speech to text needs an audio clip with a sound.');
  onStatus('Loading the speech model (the first time it is about 40 MB)…');
  const samples = await clipSamples(clip);
  const chunks = await transcribeTimed(samples, p => onStatus(`Loading the speech model… ${Math.round(p)}%`));
  onStatus('Reading the speech…');
  const segments = segmentsFrom(chunks, (clip.dur || 0) / 1000);
  const r = { segments, notes: 0, clips: [] };
  if (as === 'notes' || as === 'both') r.notes = segmentsToNotes(clip, segments);
  if (as === 'track' || as === 'both') r.clips = segmentsToTrack(take, clip, segments);
  return r;
}

#!/usr/bin/env node
/**
 * Turn an exported script page (the player) into an MP4: the page is opened in headless Chrome and played with its own clock, its picture
 * is captured as it changes (Chrome's screencast, no window to share), its narration is mixed from the clips inside it at the times it
 * played them, and ffmpeg makes the movie. Subtitles go beside it as .vtt (they are in the picture too).
 *
 *   node scripts/render-video.mjs page.html [out.mp4] [--width 1920] [--height 1080] [--fps 30] [--chrome /path/to/chrome]
 *
 * Progress is printed as JSON lines ({ stage, ... }) so a caller (the dev server) can follow it.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';
import { concatList, audioPlan, mixArgs, vttFor, bytesOfDataUri } from '../src/workbench/videoPlan.js';

const args = process.argv.slice(2);
const opt = (name, d) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args.splice(i, 2)[1] : d; };
const width = Number(opt('width', 1920)), height = Number(opt('height', 1080)), fps = Number(opt('fps', 30));
const chrome = opt('chrome', ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium'].find(p => fs.existsSync(p)));
const [pagePath, outArg] = args;
const say = o => process.stdout.write(`${JSON.stringify(o)}\n`);
if (!pagePath || !fs.existsSync(pagePath)) { say({ stage: 'error', error: 'Give the page to render (an exported script page).' }); process.exit(2); }
if (!chrome) { say({ stage: 'error', error: 'No Chrome or Chromium found: pass --chrome /path/to/chrome.' }); process.exit(2); }
const out = path.resolve(outArg || pagePath.replace(/\.html$/, '.mp4'));
fs.mkdirSync(path.dirname(out), { recursive: true });
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'ams-render-'));
const run = (cmd, a) => new Promise((ok, no) => { const p = spawn(cmd, a, { stdio: ['ignore', 'ignore', 'pipe'] }); let err = ''; p.stderr.on('data', d => { err += d; }); p.on('close', c => (c === 0 ? ok() : no(new Error(`${cmd} failed (${c}): ${err.slice(-600)}`)))); });

const browser = await puppeteer.launch({
  executablePath: chrome, headless: true, protocolTimeout: 0, defaultViewport: { width, height, deviceScaleFactor: 1 },
  args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio', '--hide-scrollbars', '--force-color-profile=srgb', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', `--window-size=${width},${height}`]
});
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e.message || e)));
  await page.goto(`${pathToFileURL(path.resolve(pagePath)).href}?render`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__ams && window.__ams.data, { timeout: 30000 });
  const data = await page.evaluate(() => ({ cues: window.__ams.data.cues.map(c => c.say || ''), clips: window.__ams.data.clips, total: window.__ams.data.total, fade: window.__ams.data.fade }));
  say({ stage: 'ready', cues: data.cues.length, seconds: Math.round(data.total) });

  // Capture: a frame whenever the picture changes, at most `fps` a second.
  const cdp = await page.createCDPSession();
  const frames = []; let last = -1, n = 0, pending = 0, clockSkew = null;
  cdp.on('Page.screencastFrame', async ({ data: b64, metadata, sessionId }) => {
    const t = metadata.timestamp;
    if (t - last >= 1 / fps - 0.002) {
      const file = path.join(work, `f${String(n++).padStart(6, '0')}.jpg`);
      frames.push({ file, t }); last = t;
      pending++; fs.promises.writeFile(file, Buffer.from(b64, 'base64')).then(() => { pending--; });
    }
    cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: width, maxHeight: height, everyNthFrame: 1 });
  await new Promise(r => setTimeout(r, 400));   // (a first picture, before anything moves)

  const started = Date.now();
  const ticker = setInterval(async () => {
    try { const k = await page.evaluate(() => window.__ams.cues.filter(Boolean).length); say({ stage: 'record', cue: k, of: data.cues.length, seconds: Math.round((Date.now() - started) / 1000) }); } catch { /* the page is going */ }
  }, 2000);
  // (not one long call: poll, so that a script of any length is waited for)
  await page.evaluate(() => { window.__ams.finished = false; window.__ams.play().then(() => { window.__ams.finished = true; }); });
  while (!(await page.evaluate(() => window.__ams.finished))) await new Promise(r => setTimeout(r, 500));
  clearInterval(ticker);
  await new Promise(r => setTimeout(r, 300));
  await cdp.send('Page.stopScreencast');
  while (pending) await new Promise(r => setTimeout(r, 20));
  const ams = await page.evaluate(() => ({ cues: window.__ams.cues, fadeAt: window.__ams.fadeAt, endedAt: window.__ams.endedAt, now: Date.now(), nowPerf: performance.now() }));
  if (errors.length) say({ stage: 'warning', errors: errors.slice(0, 5) });

  // One clock: the frames' timestamps; the page's cues are on the epoch. They agree when the screencast clock is the epoch's.
  const t0 = frames[0].t, skew = ams.cues.find(Boolean).start / 1000 - t0;   // (a few seconds at most, if the clocks agree)
  say({ stage: 'clock', frames: frames.length, skewSeconds: Math.round(skew * 100) / 100 });
  const t0ms = frames[0].t * 1000, endT = Math.max(frames[frames.length - 1].t, ams.endedAt / 1000) + 0.2, duration = endT - t0;

  // The picture.
  say({ stage: 'encode', what: 'picture' });
  const list = path.join(work, 'frames.txt'), silent = path.join(work, 'picture.mp4');
  fs.writeFileSync(list, concatList(frames.map(f => ({ file: f.file, t: f.t - t0 })), endT - t0));
  await run('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', list, '-vf', `fps=${fps},scale=${width}:${height}:flags=lanczos,format=yuv420p`, '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-movflags', '+faststart', silent]);

  // The sound: each clip, at the time its cue played it.
  say({ stage: 'encode', what: 'sound' });
  const plan = audioPlan(ams.cues, data.clips, t0ms), files = {};
  for (const p of plan) { const f = path.join(work, `clip${p.i}.wav`); fs.writeFileSync(f, bytesOfDataUri(data.clips[p.i])); files[p.i] = f; }
  const track = path.join(work, 'sound.wav');
  await run('ffmpeg', ['-y', ...mixArgs(plan, files, duration.toFixed(3), track)]);
  await run('ffmpeg', ['-y', '-i', silent, '-i', track, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart', out]);

  const vtt = out.replace(/\.mp4$/, '.vtt');
  fs.writeFileSync(vtt, vttFor(ams.cues, data.cues, t0ms, ams.fadeAt || ams.endedAt));
  say({ stage: 'done', file: out, vtt, seconds: Math.round(duration), bytes: fs.statSync(out).size });
} catch (err) {
  say({ stage: 'error', error: err.message });
  process.exitCode = 1;
} finally {
  await browser.close().catch(() => {});
  fs.rmSync(work, { recursive: true, force: true });
}

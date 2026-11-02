/**
 * Scripts: a lesson performed. Where the guide walks a person to a control, a script does what a person would do: the cursor
 * drags the joints of a sketch (the pointer reaches the sketch as real events), opens the pseudocode, selects a line of it, goes to
 * the code and selects the lines that implement it. Keys and the mouse show on screen, and each cue has its subtitle.
 *
 *   { id, title, lesson?, cues: [ cue, … ] }
 *   cue: { say?, hold?, …one action… }
 *     goto: title                       the camera goes to a board (a frame, or any board)
 *     restart: title                    a sketch starts again from its code (so a drag starts from a known pose)
 *     drag: { on, path, space?, ms? }   press on a sketch, move along the path, release. The path is in fractions of the board
 *                                       ([0.5, 0.5] is its middle) or, with `space: { frame }`, in the units of an orthographic
 *                                       camera that sees `frame` units from top to bottom
 *     click: { summary: title }         press the folded callout (a pseudocode, an example) of a document board
 *     select: { pseudo: title, line }   drag across a line of a pseudocode; { code: title, from, to } across the lines of a code
 *                                       board from the first line that has `from` to the next line that has `to`
 *     key: 'Alt+K'  (run: true)         show the keys, and press them
 *     wait: ms
 *   `say` is the subtitle while the cue lasts (long enough to read); `hold` is the least time it lasts, in ms.
 */
import { boardsOf } from '../process/boards.js';
import { ScriptOverlay } from './scriptOverlay.js';
import { h } from './ui.js';

const ABORT = Symbol('stop');
const ease = t => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const frameNext = () => new Promise(r => requestAnimationFrame(r));
const readMs = text => 700 + String(text || '').length * 45;   // about 180 words a minute

export class ScriptPlayer {
  constructor(app) {
    this.app = app;
    this.scripts = new Map();
    this.overlay = new ScriptOverlay();
    this.run = null;
    // the overlay's mouse follows the guide's cursor
    const g = app.guide, place = g.place.bind(g);
    g.place = (x, y) => { place(x, y); this.overlay.follow(x, y); };
    this.bar = h('div', { class: 'wb-sc-bar', hidden: true },
      this.pauseBtn = h('button', { class: 'wb-icon-btn', title: 'Pause between cues (Space)', onclick: () => this.togglePause() }, '❚❚'),
      h('button', { class: 'wb-icon-btn', title: 'Stop (Esc)', onclick: () => this.stop() }, '■'));
    document.body.append(this.bar);
    addEventListener('keydown', e => {
      if (!this.run) return;
      if (e.key === 'Escape') { e.preventDefault(); this.stop(); }
      else if (e.key === ' ' && !e.target.closest?.('input, textarea, select, .cm-editor, [contenteditable]')) { e.preventDefault(); this.togglePause(); }
    }, true);
  }

  register(script) { this.scripts.set(script.id, script); return script; }
  list() { return [...this.scripts.values()].map(({ id, title, summary, cues }) => ({ id, title, summary, cues: cues.length })); }

  // ---- finding things ----------------------------------------------------------------------------------------------------
  board(title) {
    const all = boardsOf(this.app.store.doc);
    return all.find(b => b.title === title && b.kind !== 'frame') || all.find(b => b.title === title) || null;
  }
  frameEl(title) { const b = this.board(title); return b ? this.app.frames?.frames.get(b.id) || null : null; }

  // ---- running -----------------------------------------------------------------------------------------------------------
  get pace() { return this.app.guide.pace; }
  get fast() { return !this.app.guide.active || document.hidden; }
  async pause(ms) { await this.gate(); if (this.fast) return; await new Promise(r => setTimeout(r, ms * this.pace)); this.check(); }
  check() { if (!this.run || this.run.aborted) throw ABORT; }
  async gate() { while (this.run?.paused && !this.run.aborted) await new Promise(r => setTimeout(r, 80)); this.check(); }
  togglePause() { if (!this.run) return; this.run.paused = !this.run.paused; this.pauseBtn.textContent = this.run.paused ? '▶' : '❚❚'; this.pauseBtn.title = this.run.paused ? 'Go on (Space)' : 'Pause between cues (Space)'; }

  /** Play a script (by id or the object). Resolves when it ends or is stopped. */
  async play(which) {
    const script = typeof which === 'string' ? this.scripts.get(which) : which;
    if (!script) throw new Error(`No script “${which}”`);
    this.stop();
    const g = this.app.guide, run = this.run = { script, aborted: false, paused: false, hl: [] };
    this.bar.hidden = false; this.pauseBtn.textContent = '❚❚';
    g.card.hidden = true; g.cursor.style.opacity = '1';
    this.app.emit('script', 'start', script.id);
    try {
      if (script.lesson) { const { openLesson } = await import('./walkthroughs.js'); await openLesson(this.app, script.lesson); await frameNext(); }
      for (let i = 0; i < script.cues.length; i++) { await this.gate(); await this.cue(script.cues[i], i); }
      this.overlay.subtitle('');
    } catch (err) {
      if (err !== ABORT) { this.app.log(`Script “${script.title}”: ${err.message}`, 'error'); console.error(err); }
    }
    this.finish(run);
  }

  stop() { if (this.run) { this.run.aborted = true; this.finish(this.run); } }

  finish(run) {
    if (this.run !== run) return;
    this.run = null;
    this.clearHighlights(run);
    this.overlay.clear();
    this.bar.hidden = true;
    const g = this.app.guide; g.cursor.style.opacity = '0';
    this.app.emit('script', 'end', run.script.id);
  }

  async cue(c, index) {
    const t0 = performance.now();
    this.app.emit('say', c.say || '', 'Script');
    this.overlay.subtitle(c.say || '');
    if (c.goto) await this.goto(c.goto);
    if (c.restart) await this.restart(c.restart);
    if (c.drag) await this.drag(c.drag);
    if (c.click) await this.click(c.click);
    if (c.select) await this.select(c.select);
    if (c.key) await this.key(c.key, c.run);
    if (c.wait) await this.pause(c.wait);
    // the subtitle stays long enough to read
    const least = Math.max(c.hold || 0, c.say ? readMs(c.say) : 0) * (this.fast ? 0 : this.pace);
    const left = least - (performance.now() - t0);
    if (left > 0) await this.pause(left / Math.max(this.pace, 0.0001));
    void index;
  }

  // ---- cues --------------------------------------------------------------------------------------------------------------
  async goto(title) {
    const all = [{ ...this.app.store.doc.artboard, id: 'main', kind: undefined }, ...this.app.store.doc.boards];
    const b = all.find(x => x.title === title && x.kind === 'frame') || all.find(x => x.title === title);
    if (!b) throw new Error(`No board “${title}”`);
    this.app.goToBoard(b.id, { animate: true });
    await this.pause(1100);
    for (let i = 0; i < 20 && !(this.frameEl(title)?.el?.isConnected); i++) await this.pause(100);   // (a board mounts as it comes into view)
  }

  async restart(title) {
    const b = this.board(title); if (!b) throw new Error(`No board “${title}”`);
    this.app.frames?.restart(b.id);
    this.app.canvas.invalidate();
    for (let i = 0; i < 30; i++) { await this.pause(100); const f = this.app.frames?.frames.get(b.id); if (f?.iframe?.contentWindow && f.running) break; }
    await this.pause(700);
  }

  /** Move the cursor to a screen point (a glide). */
  async glide(x, y, ms) {
    const g = this.app.guide;
    if (this.fast) { g.place(x, y); return; }
    const x0 = g.pos.x, y0 = g.pos.y, t0 = performance.now(), d = Math.max(60, ms ?? Math.min(900, 250 + Math.hypot(x - x0, y - y0) * 0.6) * this.pace);
    await new Promise(res => {
      const step = now => {
        if (!this.run || this.run.aborted) { res(); return; }
        const t = Math.min(1, (now - t0) / d), e = ease(t);
        g.place(x0 + (x - x0) * e, y0 + (y - y0) * e);
        if (t < 1) requestAnimationFrame(step); else res();
      };
      requestAnimationFrame(step);
    });
    this.check();
  }

  /** Press: the halo on the cursor, the mouse glyph down. */
  async down(button = 'left', drag = false) { this.overlay.press(button, drag); await this.app.guide.click(); }
  up() { this.overlay.press(null); }

  /** Drag on a sketch: the pointer reaches it as events, so it does what it does for a hand. */
  async drag(d) {
    const b = this.board(d.on); if (!b) throw new Error(`No board “${d.on}”`);
    const f = this.app.frames?.frames.get(b.id);
    if (!f?.iframe?.contentWindow) throw new Error(`“${d.on}” is not running`);
    const aspect = b.width / b.height;
    const frac = ([x, y]) => (d.space?.frame ? [0.5 + x / (d.space.frame * aspect), 0.5 - y / d.space.frame] : [x, y]);
    const pts = d.path.map(frac);
    const screen = ([fx, fy]) => { const r = f.iframe.getBoundingClientRect(); return [r.left + fx * r.width, r.top + fy * r.height]; };
    const send = (t, [fx, fy], buttons) => { try { f.iframe.contentWindow.postMessage({ amsFrame: f.token, type: 'input', ev: { t, x: fx, y: fy, button: 0, buttons, shift: false, ctrl: false, alt: false, meta: false } }, '*'); } catch { /* gone */ } };
    await this.glide(...screen(pts[0]));
    send('pointermove', pts[0], 0);
    await this.pause(200);
    await this.down('left', true);
    send('pointerdown', pts[0], 1); send('mousedown', pts[0], 1);
    const total = (d.ms ?? 1600) * (this.fast ? 0 : this.pace), n = pts.length - 1;
    const at = u => { const k = Math.min(n - 1e-9, u * n), i = Math.floor(k), s = k - i; return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * s, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * s]; };
    if (n > 0 && total > 0) {
      const t0 = performance.now();
      await new Promise(res => {
        const step = now => {
          if (!this.run || this.run.aborted) { res(); return; }
          const t = Math.min(1, (now - t0) / total), p = at(ease(t));
          this.app.guide.place(...screen(p)); send('pointermove', p, 1);
          if (t < 1) requestAnimationFrame(step); else res();
        };
        requestAnimationFrame(step);
      });
    } else for (const p of pts) send('pointermove', p, 1);
    this.check();
    const last = pts[pts.length - 1];
    send('pointermove', last, 1); send('pointerup', last, 0); send('mouseup', last, 0);
    this.up();
    await this.pause(350);
  }

  /** Press a folded callout of a document board (a pseudocode, an example) and let it open or close. */
  async click(c) {
    if (c.summary) {
      const f = this.frameEl(c.summary); const el = f?.el.querySelector('details.md-callout > summary');
      if (!el) throw new Error(`No folded callout in “${c.summary}”`);
      el.scrollIntoView({ block: 'nearest' }); await frameNext();
      const r = el.getBoundingClientRect();
      await this.glide(r.left + Math.min(r.width / 2, 90), r.top + r.height / 2);
      await this.down('left'); el.click(); this.up();
      await this.pause(350);
    }
  }

  async select(s) {
    if (s.pseudo) await this.selectPseudo(s);
    else if (s.code) await this.selectCode(s);
  }

  clearHighlights(run = this.run) {
    for (const el of run?.hl.splice(0) || []) el.classList.remove('sc-hl');
  }

  /** Drag across a line of pseudocode: the text is selected as the cursor passes, and the line stays marked. */
  async selectPseudo({ pseudo, line }) {
    const f = this.frameEl(pseudo); if (!f) throw new Error(`No board “${pseudo}”`);
    const rows = [...f.el.querySelectorAll('.pseudo li:not(.gap)')], li = rows[line - 1], code = li?.querySelector('.code');
    if (!code) throw new Error(`“${pseudo}” has no pseudocode line ${line} (open the pseudocode first)`);
    code.scrollIntoView({ block: 'nearest' }); await frameNext();
    const walker = document.createTreeWalker(code, NodeFilter.SHOW_TEXT), nodes = [];
    for (let n; (n = walker.nextNode());) if (n.nodeValue.length) nodes.push(n);
    const total = nodes.reduce((a, n) => a + n.nodeValue.length, 0);
    const caret = k => { let left = Math.round(k * total); for (const n of nodes) { if (left <= n.nodeValue.length) return [n, left]; left -= n.nodeValue.length; } const l = nodes[nodes.length - 1]; return [l, l.nodeValue.length]; };
    const rect = k => { const [n, o] = caret(k), r = document.createRange(); r.setStart(n, Math.max(0, o - (o > 0 ? 1 : 0))); r.setEnd(n, Math.max(o, 1)); const b = r.getBoundingClientRect(); return [k === 0 ? b.left : b.right, b.top + b.height / 2]; };
    this.clearHighlights();
    const sel = getSelection(), [sx, sy] = rect(0), [ex, ey] = rect(1);
    await this.glide(sx, sy);
    await this.down('left', true);
    const total_ms = this.fast ? 0 : Math.min(2200, 500 + total * 28) * this.pace, t0 = performance.now();
    const set = k => { const [a, ao] = caret(0), [b, bo] = caret(k); sel.setBaseAndExtent(a, ao, b, bo); };
    if (total_ms > 0) await new Promise(res => {
      const step = now => {
        if (!this.run || this.run.aborted) { res(); return; }
        const t = Math.min(1, (now - t0) / total_ms), k = ease(t);
        set(k); const [x, y] = rect(k); this.app.guide.place(x, y || sy);
        if (t < 1) requestAnimationFrame(step); else res();
      };
      requestAnimationFrame(step);
    });
    set(1); this.app.guide.place(ex, ey);
    this.up(); this.check();
    li.classList.add('sc-hl'); this.run.hl.push(li);
    await this.pause(250);
  }

  /** Drag across the lines of a code board that implement something: the lines are found by their text, so the script survives edits. */
  async selectCode({ code, from, to, lines, extra = 0 }) {
    const f = this.frameEl(code), ed = f?.editor;
    if (!ed) throw new Error(`No code editor on “${code}”`);
    const doc = ed.view.state.doc;
    let a, b;
    if (lines) [a, b] = lines;
    else {
      for (let i = 1; i <= doc.lines && !a; i++) if (doc.line(i).text.includes(from)) a = i;
      if (!a) throw new Error(`No line with “${from}” in “${code}”`);
      for (let i = a; i <= doc.lines && !b; i++) if (doc.line(i).text.includes(to)) b = i;
      if (!b) throw new Error(`No line with “${to}” in “${code}”`);
      b = Math.min(doc.lines, b + extra);
    }
    ed.scrollToLine(Math.max(1, a - 2)); await frameNext(); await frameNext();
    const p0 = doc.line(a).from + (doc.line(a).text.length - doc.line(a).text.trimStart().length), p1 = doc.line(b).to;
    const at = pos => { const c = ed.view.coordsAtPos(pos); return c ? [c.left, (c.top + c.bottom) / 2] : null; };
    const s0 = at(p0), s1 = at(p1);
    if (!s0 || !s1) throw new Error(`The lines of “${code}” are not on screen`);
    this.clearHighlights();
    await this.glide(...s0);
    await this.down('left', true);
    const ms = this.fast ? 0 : Math.min(2600, 500 + (b - a + 1) * 220) * this.pace, t0 = performance.now();
    const set = pos => ed.view.dispatch({ selection: { anchor: p0, head: pos } });
    if (ms > 0) await new Promise(res => {
      const step = now => {
        if (!this.run || this.run.aborted) { res(); return; }
        const t = Math.min(1, (now - t0) / ms), pos = Math.round(p0 + (p1 - p0) * ease(t));
        set(pos); const p = at(pos); if (p) this.app.guide.place(...p);
        if (t < 1) requestAnimationFrame(step); else res();
      };
      requestAnimationFrame(step);
    });
    set(p1); const e = at(p1); if (e) this.app.guide.place(...e);
    this.up(); this.check();
    await this.pause(300);
  }

  /** Show keys, and press them (the studio takes them as it takes a real key). */
  async key(chord, run = false) {
    this.overlay.key(chord);
    if (run) {
      const parts = String(chord).split('+').map(s => s.trim()), key = parts[parts.length - 1], mods = parts.slice(0, -1).map(s => s.toLowerCase());
      const ev = { key: key.length === 1 ? key.toLowerCase() : key, bubbles: true, cancelable: true, altKey: mods.includes('alt') || mods.includes('opt'), ctrlKey: mods.includes('ctrl'), metaKey: mods.includes('cmd') || mods.includes('meta'), shiftKey: mods.includes('shift') };
      document.body.dispatchEvent(new KeyboardEvent('keydown', ev));
      document.body.dispatchEvent(new KeyboardEvent('keyup', ev));
    }
    await this.pause(500);
  }
}

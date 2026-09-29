/**
 * A board as a source: its picture (the source under it, then its marks) sampled small, live. Whatever
 * a board shows becomes something other boards can read: source('screen'). A playlist that routes videos
 * to a target board and a drawing board that reads that board make a chain: dance clips in, drawings out.
 */
import { boardById } from '../process/boards.js';
import { renderDocument } from '../process/render.js';

const SIDE = 384;

/** A live source (the shape LiveSource has, for Sources) that draws a board of the studio's document. */
export function boardLive(app, boardId) {
  const canvas = document.createElement('canvas');
  const live = { kind: 'board', canvas, ready: true, version: 0, rate: 1, tick() {
    const doc = app.store.doc, b = boardById(doc, boardId);
    if (!b) return;
    const under = b.source && app.sources.view(b.source), uv = b.source ? app.sources.entries.get(b.source)?.live?.version ?? 0 : 0;
    // Only when something changed: the board's document, or the picture under it.
    if (!live.dirty && uv === live.uv && live.version) return;
    live.dirty = false; live.uv = uv;
    const k = Math.min(1, SIDE / Math.max(b.width, b.height));
    const w = Math.max(1, Math.round(b.width * k)), h = Math.max(1, Math.round(b.height * k));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = b.ground || '#f3efe6'; ctx.fillRect(0, 0, w, h);
    if (under?.width) {
      const fit = (b.sourceFit === 'contain' ? Math.min : Math.max)(w / under.width, h / under.height), dw = under.width * fit, dh = under.height * fit;
      ctx.save(); ctx.globalAlpha = b.sourceOpacity ?? 0.5;
      if (b.sourceBlend && b.sourceBlend !== 'normal') ctx.globalCompositeOperation = b.sourceBlend;
      ctx.drawImage(under, (w - dw) / 2, (h - dh) / 2, dw, dh); ctx.restore();
    }
    const els = doc.elements.filter(e => (e.board || 'main') === boardId);
    if (els.length) renderDocument(ctx, { ...doc, elements: els }, { mode: 'picture', transform: { x: -b.x * k, y: -b.y * k, scale: k }, ground: false, screenNotes: true, frozen: true });
    live.version++;
  }, stop() { live.ready = false; } };
  // The rest of a source's controls: a board has nothing to play.
  Object.assign(live, { setLoop() {}, setRange() {}, setVolume() {}, setRate() {}, position: () => null, hasAudio: () => false });
  live.dirty = true;
  // The board changes (a mark, its code running): draw it again on the next tick.
  live.off = app.store.subscribe(() => { live.dirty = true; }, { live: true });
  live.stop = () => { live.ready = false; live.off?.(); };
  return live;
}

/**
 * Draws one frame of continuous mode, with the optional reference overlay:
 *
 *   off    the painting only
 *   under  the reference (at `refOpacity`) replaces the plain ground; the
 *          layered watercolor has its ground baked in, so it falls back to over
 *   over   the reference on top of the painting at `refOpacity`, for comparing
 *   solo   the reference only
 *
 * Render 'pixel' and 'ascii' draw the flat painting through stylize.js
 * (drawStylized must be in scope; the studio passes it in as opts.stylize).
 *
 * With cf.ground === 'transparent' no ground color or paper is painted (the
 * layered watercolor keeps its paper, which is part of its painting).
 *
 * Shared by the studio's live preview and the continuous p5 export, which
 * embeds this file with import/export lines stripped. Renderers are updated by
 * the caller; this only draws.
 */
export function drawScene(ctx, x, y, w, h, opts) {
  // Fit 'contain': clip everything to the reference's area inside the canvas.
  const r = opts.cf.contentRect;
  if (!r) return drawSceneInner(ctx, x, y, w, h, opts);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x + r.x * w, y + r.y * h, r.w * w, r.h * h);
  ctx.clip();
  drawSceneInner(ctx, x, y, w, h, opts);
  ctx.restore();
}

function drawSceneInner(ctx, x, y, w, h, { cf, now, render = 'flat', sprites = null, layer = null, ref = null, overlay = 'off', refOpacity = 0.5, style = null, stylize = null }) {
  if (overlay === 'solo' && ref) {
    ctx.drawImage(ref, x, y, w, h);
    return;
  }
  const canUnder = render !== 'layered';
  const under = overlay === 'under' && ref && canUnder;
  const transparent = cf.ground === 'transparent';
  if (under) {
    ctx.save();
    if (!transparent) {
      ctx.fillStyle = cf.background;
      ctx.fillRect(x, y, w, h);
    }
    ctx.globalAlpha = refOpacity;
    ctx.drawImage(ref, x, y, w, h);
    ctx.restore();
  }
  const ground = !under && !transparent;
  const styler = stylize || (typeof drawStylized === 'function' ? drawStylized : null);
  if ((render === 'pixel' || render === 'ascii') && styler) {
    styler(ctx, render, x, y, w, h, (c, X, Y, W, H) => cf.draw(c, X, Y, W, H, now, { ground }), style || undefined);
  } else if (render === 'watercolor' && sprites) sprites.draw(ctx, x, y, w, h, cf, now, { ground });
  else if (render === 'layered' && layer) layer.draw(ctx, x, y, w, h);
  else cf.draw(ctx, x, y, w, h, now, { ground });
  if (ref && (overlay === 'over' || (overlay === 'under' && !canUnder))) {
    ctx.save();
    ctx.globalAlpha = refOpacity;
    ctx.drawImage(ref, x, y, w, h);
    ctx.restore();
  }
}

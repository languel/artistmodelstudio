/**
 * Draws one frame of continuous mode, with the optional reference overlay:
 *
 *   off    the painting only
 *   under  the reference (at `refOpacity`) replaces the plain ground; the
 *          layered watercolor has its ground baked in, so it falls back to over
 *   over   the reference on top of the painting at `refOpacity`, for comparing
 *   solo   the reference only
 *
 * Shared by the studio's live preview and the continuous p5 export, which
 * embeds this file with import/export lines stripped. Renderers are updated by
 * the caller; this only draws.
 */
export function drawScene(ctx, x, y, w, h, { cf, now, render = 'flat', sprites = null, layer = null, ref = null, overlay = 'off', refOpacity = 0.5 }) {
  if (overlay === 'solo' && ref) {
    ctx.drawImage(ref, x, y, w, h);
    return;
  }
  const canUnder = render !== 'layered';
  const under = overlay === 'under' && ref && canUnder;
  if (under) {
    ctx.save();
    ctx.fillStyle = cf.background;
    ctx.fillRect(x, y, w, h);
    ctx.globalAlpha = refOpacity;
    ctx.drawImage(ref, x, y, w, h);
    ctx.restore();
  }
  if (render === 'watercolor' && sprites) sprites.draw(ctx, x, y, w, h, cf, now, { ground: !under });
  else if (render === 'layered' && layer) layer.draw(ctx, x, y, w, h);
  else cf.draw(ctx, x, y, w, h, now, { ground: !under });
  if (ref && (overlay === 'over' || (overlay === 'under' && !canUnder))) {
    ctx.save();
    ctx.globalAlpha = refOpacity;
    ctx.drawImage(ref, x, y, w, h);
    ctx.restore();
  }
}

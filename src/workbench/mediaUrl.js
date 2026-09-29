/**
 * Media by address: a URL to a video or picture, or a Wikipedia / Commons File: page (resolved to the
 * file itself through the wiki's API, with its licence and author). Videos are streamed (the browser
 * fetches what it plays), pictures fetched once. Servers must allow it (CORS): Wikimedia does.
 */
const VIDEO = /\.(webm|mp4|m4v|ogv|ogg|mov|mkv)(\?|#|$)/i;
const clean = html => String(html || '').replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

/** The quality tiers of a wiki video, by the height of the derivative: pick the nearest at or below (else the smallest). */
export const QUALITIES = [['240', '240p'], ['480', '480p'], ['1080', '1080p'], ['original', 'original']];
const pick = (list, q) => {
  if (q === 'original') return list.find(d => !d.transcodekey) || list[0];
  const want = Number(q) || 480, small = list.filter(d => d.transcodekey && d.height <= want).sort((a, b) => b.height - a.height)[0];
  return small || list.filter(d => d.transcodekey).sort((a, b) => a.height - b.height)[0] || list[0];
};

/**
 * { url, kind: 'video' | 'image', title, license?, artist?, source?, mime?, height? } for whatever was typed.
 * quality: for a wiki video, the derivative to stream ('240' | '480' | '1080' | 'original'): the smaller
 * ones are re-encoded, light on bandwidth and quick to seek; the original of a feature film is gigabytes.
 */
export async function resolveMediaUrl(input, { quality = '480' } = {}) {
  const text = String(input || '').trim();
  if (!/^https?:\/\//i.test(text)) throw new Error('Not an address (https://…)');
  const wiki = /^https?:\/\/([a-z.]*(?:wikipedia|wikimedia)\.org)\/wiki\/(File:[^?#]+)/i.exec(text);
  if (wiki) {
    const [, host, file] = wiki;
    const api = `https://${host}/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url|mime|size|extmetadata&titles=${encodeURIComponent(decodeURIComponent(file))}&origin=*`;
    const r = await fetch(api);
    if (!r.ok) throw new Error(`The wiki did not answer (${r.status})`);
    const page = Object.values((await r.json()).query?.pages || {})[0], ii = page?.imageinfo?.[0];
    if (!ii?.url) throw new Error('No such file on that wiki');
    const em = ii.extmetadata || {};
    // A video: its derivatives (other sizes) by the wiki's videoinfo, when it has them.
    let url = ii.url, height = null;
    if (/^video\//.test(ii.mime) || /ogg/.test(ii.mime)) {
      try {
        const v = await (await fetch(api.replace('prop=imageinfo&iiprop=url|mime|size|extmetadata', 'prop=videoinfo&viprop=derivatives'))).json();
        const list = Object.values(v.query?.pages || {})[0]?.videoinfo?.[0]?.derivatives || [];
        if (list.length) { const d = pick(list, quality); url = d.src; height = d.height; }
      } catch { /* the original then */ }
    }
    return { url, height, kind: /^video\//.test(ii.mime) || /ogg/.test(ii.mime) && VIDEO.test(ii.url) ? 'video' : 'image', mime: ii.mime, size: ii.size, title: decodeURIComponent(file).replace(/^File:/, '').replace(/\.[a-z0-9]+$/i, '').replace(/_/g, ' '), license: clean(em.LicenseShortName?.value), artist: clean(em.Artist?.value).slice(0, 120), source: text };
  }
  const name = decodeURIComponent(text.split(/[?#]/)[0].split('/').pop() || 'media').replace(/\.[a-z0-9]+$/i, '');
  return { url: text, kind: VIDEO.test(text) ? 'video' : 'image', title: name, source: text };
}

export const isVideoUrl = d => d.mediaKind === 'video' || (d.mediaKind == null && VIDEO.test(d.url || ''));

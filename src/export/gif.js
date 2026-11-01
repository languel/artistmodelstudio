/**
 * An animated GIF from canvases: a palette made by median cut from all the frames, then LZW. Plain and small; no library.
 * encodeGif(canvases, { fps, loop }) → Blob.
 */
function palette(frames, size = 256) {
  // sample pixels across the frames into 5-bit-per-channel buckets
  const count = new Map();
  for (const d of frames) for (let i = 0; i < d.data.length; i += 4 * 7) {
    const k = ((d.data[i] >> 3) << 10) | ((d.data[i + 1] >> 3) << 5) | (d.data[i + 2] >> 3);
    count.set(k, (count.get(k) || 0) + 1);
  }
  let boxes = [[...count.entries()].map(([k, n]) => ({ r: (k >> 10) << 3, g: ((k >> 5) & 31) << 3, b: (k & 31) << 3, n }))];
  while (boxes.length < size) {
    let bi = -1, best = 0;
    boxes.forEach((bx, i) => { if (bx.length > 1) { const range = ['r', 'g', 'b'].map(c => Math.max(...bx.map(p => p[c])) - Math.min(...bx.map(p => p[c]))); const w = Math.max(...range) * Math.sqrt(bx.length); if (w > best) { best = w; bi = i; } } });
    if (bi < 0) break;
    const bx = boxes[bi], range = ['r', 'g', 'b'].map(c => Math.max(...bx.map(p => p[c])) - Math.min(...bx.map(p => p[c])));
    const ch = ['r', 'g', 'b'][range.indexOf(Math.max(...range))];
    bx.sort((a, b) => a[ch] - b[ch]);
    let half = bx.reduce((s, p) => s + p.n, 0) / 2, at = 0;
    for (; at < bx.length - 1 && half > 0; at++) half -= bx[at].n;
    at = Math.min(bx.length - 1, Math.max(1, at));
    boxes.splice(bi, 1, bx.slice(0, at), bx.slice(at));
  }
  return boxes.map(bx => { const n = bx.reduce((s, p) => s + p.n, 0) || 1; return [Math.round(bx.reduce((s, p) => s + p.r * p.n, 0) / n), Math.round(bx.reduce((s, p) => s + p.g * p.n, 0) / n), Math.round(bx.reduce((s, p) => s + p.b * p.n, 0) / n)]; });
}

function lzw(indices, minCode) {
  const out = []; let bits = 0, nbits = 0;
  const emit = (code, size) => { bits |= code << nbits; nbits += size; while (nbits >= 8) { out.push(bits & 255); bits >>= 8; nbits -= 8; } };
  const clear = 1 << minCode, end = clear + 1;
  let size = minCode + 1, next = end + 1, dict = new Map();
  emit(clear, size);
  let prefix = indices[0];
  for (let i = 1; i < indices.length; i++) {
    const c = indices[i], key = (prefix << 8) | c, hit = dict.get(key);
    if (hit !== undefined) { prefix = hit; continue; }
    emit(prefix, size);
    if (next < 4096) { dict.set(key, next++); if (next > (1 << size) && size < 12) size++; }
    else { emit(clear, size); dict = new Map(); size = minCode + 1; next = end + 1; }
    prefix = c;
  }
  emit(prefix, size); emit(end, size);
  if (nbits) out.push(bits & 255);
  return out;
}

export function encodeGif(canvases, { fps = 10, loop = true } = {}) {
  const W = canvases[0].width, H = canvases[0].height;
  const data = canvases.map(c => { const x = document.createElement('canvas'); x.width = W; x.height = H; const g = x.getContext('2d'); g.drawImage(c, 0, 0, W, H); return g.getImageData(0, 0, W, H); });
  const pal = palette(data);
  while (pal.length < 256) pal.push([0, 0, 0]);
  const nearest = new Int16Array(32768).fill(-1);
  const index = (r, g, b) => {
    const k = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    if (nearest[k] >= 0) return nearest[k];
    let best = 0, bd = 1e9; const rr = (r >> 3) << 3, gg = (g >> 3) << 3, bb = (b >> 3) << 3;
    for (let i = 0; i < 256; i++) { const d = (pal[i][0] - rr) ** 2 + (pal[i][1] - gg) ** 2 + (pal[i][2] - bb) ** 2; if (d < bd) { bd = d; best = i; } }
    return (nearest[k] = best);
  };
  const bytes = [];
  const w16 = n => bytes.push(n & 255, (n >> 8) & 255);
  bytes.push(...[...'GIF89a'].map(c => c.charCodeAt(0)));
  w16(W); w16(H); bytes.push(0xF7, 0, 0);
  for (const p of pal) bytes.push(p[0], p[1], p[2]);
  if (loop) bytes.push(0x21, 0xFF, 11, ...[...'NETSCAPE2.0'].map(c => c.charCodeAt(0)), 3, 1, 0, 0, 0);
  const delay = Math.max(2, Math.round(100 / fps));
  for (const d of data) {
    bytes.push(0x21, 0xF9, 4, 0, delay & 255, (delay >> 8) & 255, 0, 0);
    bytes.push(0x2C); w16(0); w16(0); w16(W); w16(H); bytes.push(0, 8);
    const idx = new Uint8Array(W * H);
    for (let i = 0, j = 0; i < d.data.length; i += 4, j++) idx[j] = index(d.data[i], d.data[i + 1], d.data[i + 2]);
    const packed = lzw(idx, 8);
    for (let i = 0; i < packed.length; i += 255) { const n = Math.min(255, packed.length - i); bytes.push(n); for (let k = 0; k < n; k++) bytes.push(packed[i + k]); }
    bytes.push(0);
  }
  bytes.push(0x3B);
  return new Blob([new Uint8Array(bytes)], { type: 'image/gif' });
}

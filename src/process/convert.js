/**
 * Between the studio's code and p5.js.
 *
 * Studio → p5 is the p5 export of a board's code (see p5code.js): the score kept as written, inside
 * draw(), with the studio's words defined in plain p5 after it. It runs in the p5 editor (with the
 * pictures it loads uploaded beside it) and on a p5 board in the studio (the pictures come from the
 * sources by name).
 *
 * p5 → studio undoes exactly that: the draw() body, with the studio's names back. A sketch written
 * by hand in p5 has no studio code inside it: it can be baked (to an image) but not translated.
 */
const MARK = "// ---- the studio's words it uses, in p5 ----";
const BACK = [['drawPoint', 'point'], ['drawLine', 'line'], ['drawPlane', 'plane'], ['rectPoints', 'rect'], ['circlePoints', 'circle']];

/** Is this p5 code a studio board's code, exported (so it can go back)? */
export const isStudioSketch = code => String(code || '').includes(MARK);

/**
 * p5 → studio code, with the board it drew on: { code, width, height, ground } or null (not a
 * sketch the studio wrote).
 */
export function p5ToStudio(p5) {
  const src = String(p5 || '');
  if (!isStudioSketch(src)) return null;
  const main = src.slice(0, src.indexOf(MARK));
  const m = /function draw\(\)\s*\{\n([\s\S]*?)\n\}\s*$/.exec(main.trim());
  if (!m) return null;
  const canvas = /createCanvas\(\s*(\d+)\s*,\s*(\d+)\s*\)/.exec(main);
  const ground = /^\s*background\('([^']+)'\);/m.exec(m[1])?.[1];
  let code = m[1].split('\n')
    .filter(l => !/^\s*(background\(|randomSeed\(|sources\[[^\]]+\]\.setFrame\(|gifFrame\(|if \(!newFrame\(\)\)|ask\()/.test(l))
    .map(l => l.replace(/^ {2}/, ''))
    .join('\n');
  for (const [p5Name, studio] of BACK) code = code.replace(new RegExp(`(?<![.\\w$])${p5Name}\\s*\\(`, 'g'), `${studio}(`);
  if (/Coordinates are in pixels/.test(main)) code = `units('artboard')\n${code}`;
  return { code: `${code.trim()}\n`, width: canvas ? Number(canvas[1]) : null, height: canvas ? Number(canvas[2]) : null, ground: ground || null };
}

/** The canvas size a p5 sketch asks for (createCanvas(w, h) with numbers), or null. */
export function p5Size(code) {
  const m = /createCanvas\(\s*(\d+)\s*,\s*(\d+)/.exec(String(code || ''));
  return m ? { width: Number(m[1]), height: Number(m[2]) } : null;
}

/** What pasted text is: 'json' (studio), 'svg', 'p5', 'studio' (score), or 'text'. */
export function textKind(text) {
  const t = String(text || '').trim();
  if (/^\{[\s\S]*\}$/.test(t)) { try { const j = JSON.parse(t); if (j && (j.type === 'ams-process' || (Array.isArray(j.stages) && Array.isArray(j.elements)))) return 'json'; } catch { /* not JSON */ } }
  if (/^(<\?xml[^>]*>\s*)?<svg[\s>]/i.test(t)) return 'svg';
  if (/\bfunction\s+(setup|draw)\s*\(/.test(t)) return 'p5';
  if (/(?<![.\w$])(point|line|plane|walk|source|fit|stage|guide|brush)\s*\(/.test(t) && /[;)\n]/.test(t)) return 'studio';
  return 'text';
}

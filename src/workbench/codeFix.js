/**
 * Mechanical repairs for board code a small model has written, for the mistakes that are the same every time and have one right answer.
 * Nothing here guesses at what the program means: each repair is a change the program cannot be right without.
 *
 *   fixCode(code) → { code, fixes: ['…'] }
 *
 *  1. A variable named like a function it then calls or passes on (`const rect = rect(…); plane(rect, …)`): the variable is renamed
 *     (rect_), the calls stay.
 *  2. A `const a = 1,` list that ends in a comma at a line end, then the next statement (`const y = 2`): the comma is dropped.
 */
const BUILTINS = ['point', 'line', 'plane', 'guide', 'gesture', 'note', 'rect', 'circle', 'range', 'random', 'noise', 'source', 'fit', 'walk', 'lerp', 'map', 'seed', 'board', 'stage', 'brush', 'decide', 'print', 'sin', 'cos'];

export function fixCode(code) {
  let out = String(code || ''); const fixes = [];
  // 2. A stray comma where a statement ends.
  const commas = /,([ \t]*(?:\/\/[^\n]*)?)\n([ \t]*)(const|let|var)\s/g;
  if (commas.test(out)) { out = out.replace(commas, ';$1\n$2$3 '); fixes.push('a comma ending a declaration became a semicolon'); }
  // 1. A variable that shadows a studio function.
  for (const name of BUILTINS) {
    const decl = new RegExp(`\\b(const|let|var)\\s+${name}\\b(?=\\s*=)`);
    if (!decl.test(out)) continue;
    // (the declaration, and every use of the name that is not a call: `name(` stays the function)
    out = out.replace(new RegExp(`\\b${name}\\b(?!\\s*\\()(?!\\s*:)(?!['"\`])`, 'g'), `${name}_`);
    fixes.push(`the variable ${name} was renamed ${name}_ (it hid the function ${name}())`);
  }
  return { code: out, fixes };
}

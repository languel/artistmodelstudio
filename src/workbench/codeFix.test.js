import { describe, it, expect } from 'vitest';
import { fixCode } from './codeFix.js';

describe('repairing board code a small model wrote', () => {
  it('renames a variable that hides the function it calls', () => {
    const r = fixCode("const rect = rect(0.1, 0.2, 0.3, 0.3)\nplane(rect, { color: '#f00' })");
    expect(r.code).toBe("const rect_ = rect(0.1, 0.2, 0.3, 0.3)\nplane(rect_, { color: '#f00' })");
    expect(r.fixes).toHaveLength(1);
    const p = fixCode("const plane = rect(0.1, 0.1, 0.2, 0.2)\nplane(plane, { color: '#f00' })");
    expect(p.code).toBe("const plane_ = rect(0.1, 0.1, 0.2, 0.2)\nplane(plane_, { color: '#f00' })");
  });
  it('leaves a property or a string called the same alone', () => {
    const r = fixCode("const line = [[0, 0], [1, 1]]\nline_(0)\nconst o = { line: 1 }\nnote(0.5, 0.5, 'a line')");
    expect(r.code).toContain("{ line: 1 }");
    expect(r.code).toContain("'a line'");
  });
  it('ends a declaration list that stops at a comma', () => {
    const r = fixCode("for (let i = 0; i < 3; i++) {\n  const x = i / 3, // across\n  const y = 0.5, // middle\n  point(x, y)\n}");
    expect(r.code).toContain('const x = i / 3; // across');
    expect(r.fixes.join(' ')).toMatch(/comma/);
  });
  it('does not touch good code', () => {
    const good = "const s = source('seurat')\nconst cols = 6, rows = 4\nfor (const i of range(cols)) {\n  point((i + 0.5) / cols, 0.5, { size: 20, color: s.color(0.5, 0.5) })\n}";
    expect(fixCode(good)).toEqual({ code: good, fixes: [] });
  });
});

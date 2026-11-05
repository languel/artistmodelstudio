import { describe, it, expect } from 'vitest';
import { speakable } from './voiceOut.js';

describe('what is worth saying aloud', () => {
  it('keeps the words and drops code, ids, links and markup', () => {
    expect(speakable('Made **three** circles `ams_add` in a row, see [the docs](https://x.y/z). el_mw3ab12 moved.')).toBe('Made three circles in a row, see the docs. moved.');
    expect(speakable('Here:\n```js\nconst a = 1\n```\nThat is it.')).toBe('Here: That is it.');
  });
  it('says nothing for JSON, or for no words at all', () => {
    expect(speakable('{"say":"hi","actions":[]}')).toBe('');
    expect(speakable('  ```x```  ')).toBe('');
    expect(speakable('✓ ✓ ✓')).toBe('');
  });
  it('stops at a sentence end when it is long', () => {
    const t = `${'This is a sentence. '.repeat(40)}`;
    const s = speakable(t, 200);
    expect(s.length).toBeLessThanOrEqual(200);
    expect(s.endsWith('.')).toBe(true);
  });
});

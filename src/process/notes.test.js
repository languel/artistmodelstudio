import { describe, it, expect } from 'vitest';
import { isRichNote, plainNoteText } from './notes.js';

const rich = text => isRichNote({ text });

describe('notes in Markdown and math', () => {
  it('knows a note written in Markdown or with math', () => {
    for (const t of ['**bold** word', 'x $a^2$ y', '$$E = mc^2$$', '\\(x\\)', '# Title\nbody', '- one\n- two', '1. first', '> quoted', 'see [docs](https://example.com)', 'run `npm test`', 'an *emphasis* here'])
      expect(rich(t), t).toBe(true);
  });

  it('leaves plain writing alone', () => {
    for (const t of ['hello', 'first line\nsecond line', 'price is $5 and $6', 'snake_case_name', '5 * 3 * 2', ''])
      expect(rich(t), t).toBe(false);
  });

  it('reads Markdown as plain text for drawing without HTML', () => {
    expect(plainNoteText('# Title\n**bold** and *soft*\n- a\n- b')).toBe('Title\nbold and soft\n• a\n• b');
    expect(plainNoteText('see [docs](https://example.com), `code`')).toBe('see docs, code');
    expect(plainNoteText('math $x^2$ stays')).toBe('math $x^2$ stays');
  });
});

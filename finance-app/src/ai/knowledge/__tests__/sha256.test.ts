import { createHash } from 'crypto';
import { sha256Hex } from '../sha256';

it('matches the reference SHA-256 for ASCII, accents, emoji and long text', () => {
  for (const text of ['', 'abc', 'Transferência é neutra — R$ 1.234,56', '🐶 caramelo', 'x'.repeat(1000)]) {
    expect(sha256Hex(text)).toBe(createHash('sha256').update(text, 'utf8').digest('hex'));
  }
});

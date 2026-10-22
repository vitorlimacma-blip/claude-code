import { createHash } from 'crypto';
import { Sha256, sha256Hex } from '../sha256';

it('matches the reference SHA-256 for ASCII, accents, emoji and long text', () => {
  for (const text of ['', 'abc', 'Transferência é neutra — R$ 1.234,56', '🐶 caramelo', 'x'.repeat(1000)]) {
    expect(sha256Hex(text)).toBe(createHash('sha256').update(text, 'utf8').digest('hex'));
  }
});

it('hashes in chunks exactly like in one go', () => {
  const bytes = Uint8Array.from({ length: 300_000 }, (_, i) => (i * 31 + 7) & 255);
  const inc = new Sha256();
  for (let i = 0; i < bytes.length; i += 4093) inc.update(bytes.subarray(i, i + 4093));
  expect(inc.digestHex()).toBe(createHash('sha256').update(bytes).digest('hex'));
});

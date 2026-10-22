import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

// Contract §7/§9: oracles and acceptance cases never reach the app, the
// corpus, the production prompt or training. Only tests may import them.
const ROOT = join(__dirname, '../../../..');

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (name === 'node_modules' || name.startsWith('.')) return [];
    return statSync(path).isDirectory() ? files(path) : /\.(ts|tsx|js)$/.test(name) ? [path] : [];
  });
}

it('no app code imports the evaluation material', () => {
  const offenders = [...files(join(ROOT, 'src')), ...files(join(ROOT, 'app'))]
    .filter((f) => !f.includes('__tests__') && !relative(ROOT, f).startsWith(join('src', 'ai', 'eval')))
    .filter((f) => /from ['"][^'"]*ai\/eval|from ['"]\.\.?\/eval|C_oracle|_cases_E\d/.test(readFileSync(f, 'utf8')));
  expect(offenders.map((f) => relative(ROOT, f))).toEqual([]);
});

it('the approved corpus holds no oracle values or case ids', () => {
  const corpus = ['A_corpus.json', 'J3_corpus.json'].map((f) => readFileSync(join(ROOT, 'src/ai/knowledge/seed', f), 'utf8')).join('\n');
  expect(corpus).not.toMatch(/E\d{2}\b|_cents"\s*:|gabarito/);
});

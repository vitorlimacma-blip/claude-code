import { prepareDatabase } from '../../data/setup';
import { createTestContext } from '../../test-utils/testDb';
import { LocalCategorizer } from '../categorizer';

it('the local learner trained on demo data handles known merchants and leaves new ones to the AI', async () => {
  const repos = await prepareDatabase(createTestContext());
  await repos.demo.generate('2026-10-19');
  const [categories, history] = await Promise.all([repos.categories.list(), repos.transactions.list()]);
  const model = LocalCategorizer.train(categories, history.filter((t) => t.categoryId));
  const guess = (d: string) => model.predict({ description: d, kind: 'expense' })?.categoryId ?? null;

  // Known merchants, even written differently, are recognized offline.
  expect(guess('IFD*IFOOD 18/10')).toBe('sys-alimentacao-delivery');
  expect(guess('UBER *TRIP 9981')).toBe('sys-transporte-apps');
  expect(guess('POSTO SHELL BR 040')).toBe('sys-transporte-combustivel');
  expect(guess('Netflix.com')).toBe('sys-assinaturas-streaming');
  // A merchant never seen, with no shared words, needs the AI.
  expect(guess('PETZ PET SHOP')).toBeNull();
});

import { writeFileSync } from 'fs';
import { knowledgeBase } from '../../knowledge/base';
import { sha256Hex } from '../../knowledge/sha256';
import blind from '../retrieval/blind.json';
import collection from '../retrieval/questions.json';

describe('AI contract — knowledge base', () => {
  const kb = knowledgeBase();

  it('imports the 23 approved sheets with hash, rights and chunk offsets', () => {
    expect(kb.sources).toHaveLength(23);
    for (const c of kb.chunks) expect(c.hash).toBe(sha256Hex(c.text));
    expect(kb.sources.every((s) => s.ingestionStatus === 'ready' && s.documentHash.length === 64 && s.rightsEvidence)).toBe(true);
    // Catalog entries are references only: no text, never searchable.
    expect(kb.catalog.length).toBeGreaterThan(80);
    expect(kb.chunks.some((c) => kb.catalog.some((e) => e.id === c.sourceId))).toBe(false);
  });

  it('retrieval: right sheet in the top 3 for at least 90% of the evaluation collection', () => {
    const misses = collection.questions.filter((q) => !kb.search(q.q, 3).some((h) => h.source.id === q.expected));
    const rate = 1 - misses.length / collection.questions.length;
    expect({ rate: rate >= 0.9, misses: misses.map((m) => m.q) }).toEqual({ rate: true, misses: expect.any(Array) });
    // Recorded for the report.
    console.log(`retrieval top-3: ${(rate * 100).toFixed(1)}% de ${collection.questions.length}`);
  });

  it('retrieval on a collection written after the last change to the search (measured, not tuned)', () => {
    const top3 = (qs: { q: string; expected: string }[]) => qs.filter((q) => kb.search(q.q, 3).some((h) => h.source.id === q.expected)).length / qs.length;
    const metrics = {
      method: 'BM25 local sobre as 23 fichas, sinônimos controlados, top-3, um trecho por ficha',
      target: 0.9,
      tuning_collection: { size: collection.questions.length, top3: top3(collection.questions), blind: false },
      blind_collection: { size: blind.questions.length, top3: top3(blind.questions), blind: true },
    };
    // The contract's target (90%) is NOT met on the blind collection; this floor only guards against regressions.
    expect(metrics.blind_collection.top3).toBeGreaterThanOrEqual(0.6);
    if (process.env.AI_EVAL_METRICS) writeFileSync(process.env.AI_EVAL_METRICS, JSON.stringify({ retrieval: metrics }));
  });

  it('E25 FONTE_VERIFICAVEL (parcial): a pergunta sobre transferência recupera FIN02', () => {
    const [top] = kb.search('Como o aplicativo evita contar transferência como despesa?', 3);
    expect(top.source.id).toBe('FIN02');
  });
});

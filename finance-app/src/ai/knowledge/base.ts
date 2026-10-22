import corpusA from './seed/A_corpus.json';
import catalogJson from './seed/catalog.json';
import corpusJ3 from './seed/J3_corpus.json';
import { sha256Hex } from './sha256';

// The approved knowledge base (AI contract §3, §6): the project's own sheets,
// searched on the device with no network. Book and law catalogs are only
// references: they never become text the assistant can quote.

export interface KnowledgeSource {
  id: string;
  title: string;
  kind: string;
  /** Catalog references this sheet draws on (metadata only). */
  sourceIds: string[];
  language: string;
  version: number;
  effectiveAt: string | null;
  expiresAt: string | null;
  documentHash: string;
  rightsEvidence: string;
  allowedUses: string[];
  reviewStatus: string;
  ingestionStatus: 'ready' | 'not_extractable';
  containsMarketRate: boolean;
}

export interface KnowledgeChunk {
  /** "FIN02#0". */
  id: string;
  sourceId: string;
  heading: string;
  /** Character offsets in the source body. */
  start: number;
  end: number;
  text: string;
  hash: string;
}

export interface CatalogEntry {
  id: string;
  title: string;
  author: string | null;
  group: string;
  access: string | null;
  allowed_uses: string[];
}

interface SeedSheet {
  id: string;
  title: string;
  kind: string;
  source_ids: string[];
  body: string;
  language: string;
  version: number;
  valid_from: string;
  review_status: string;
  rights: string;
  auto_ingest: boolean;
  contains_market_rate: boolean;
}

const MAX_CHUNK = 520;

/** Splits a body at sentence ends into chunks of at most ~MAX_CHUNK characters, keeping offsets. */
function chunk(source: KnowledgeSource, body: string): KnowledgeChunk[] {
  const out: KnowledgeChunk[] = [];
  const sentences = [...body.matchAll(/[^.!?]+[.!?]+(\s+|$)|[^.!?]+$/g)].map((m) => ({ start: m.index!, end: m.index! + m[0].length }));
  let start = 0;
  let end = 0;
  for (const s of sentences) {
    if (s.end - start > MAX_CHUNK && end > start) {
      out.push(make(source, body, start, end, out.length));
      start = s.start;
    }
    end = s.end;
  }
  if (end > start) out.push(make(source, body, start, end, out.length));
  return out;
}

function make(source: KnowledgeSource, body: string, start: number, end: number, n: number): KnowledgeChunk {
  const text = body.slice(start, end).trim();
  return { id: `${source.id}#${n}`, sourceId: source.id, heading: source.title, start, end, text, hash: sha256Hex(text) };
}

// ---- Search: BM25 over normalized words, with a small controlled synonym list ----

const STOPWORDS = new Set(
  'a o as os um uma uns umas de do da dos das em no na nos nas por para pelo pela com sem e ou que se nao mais menos como ao aos ser sao ja so ha cada seu sua seus suas meu minha este esta isso isto entre quando qual quais quanto sobre ate tem ter foi pode deve'.split(' ')
);

/** Lowercase, no accents, light Portuguese plural/suffix folding. */
export function normalizeTokens(text: string): string[] {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w))
    .map(stem);
}

function stem(w: string): string {
  if (w.length <= 4) return w;
  if (w.endsWith('coes')) return `${w.slice(0, -4)}cao`;
  if (w.endsWith('oes')) return `${w.slice(0, -3)}ao`;
  if (w.endsWith('ais')) return `${w.slice(0, -3)}al`;
  if (w.endsWith('eis')) return `${w.slice(0, -3)}el`;
  if (w.endsWith('res') || w.endsWith('zes')) return w.slice(0, -2);
  if (w.endsWith('s')) return w.slice(0, -1);
  return w;
}

/** Words that mean the same thing in this product. Kept short and reviewed by hand. */
const SYNONYMS: string[][] = [
  ['gasto', 'despesa', 'consumo', 'gastar'],
  ['transferencia', 'transferir', 'movimento', 'interna', 'mandar', 'mandei', 'enviar', 'enviei'],
  ['estorno', 'reembolso', 'devolucao'],
  ['fatura', 'cartao', 'credito'],
  ['parcela', 'parcelamento', 'parcelado', 'prestacao'],
  ['meta', 'objetivo', 'sonho'],
  ['reserva', 'emergencia', 'guardar', 'poupar', 'poupanca'],
  ['orcamento', 'limite', 'teto'],
  ['projecao', 'previsao', 'prever', 'previsto', 'prevista', 'futuro'],
  ['juro', 'taxa', 'rendimento'],
  ['memoria', 'lembrar', 'preferencia', 'aprendizado', 'correcao', 'corrigir', 'corrigi'],
  ['privacidade', 'privado', 'compartilhar', 'compartilhada', 'esposa', 'marido', 'casal', 'participante'],
  ['documento', 'fonte', 'livro', 'citacao', 'pagina'],
  ['imposto', 'tributario', 'tributo', 'irpf', 'fiscal'],
  ['investimento', 'acao', 'carteira', 'ativo', 'dividendo'],
  ['internet', 'web', 'online', 'pesquisa'],
];
const SYNONYM_OF = new Map<string, string[]>();
for (const group of SYNONYMS) {
  const stems = group.map(stem);
  for (const s of stems) SYNONYM_OF.set(s, stems);
}

export interface SearchHit {
  chunk: KnowledgeChunk;
  source: KnowledgeSource;
  score: number;
}

export class KnowledgeBase {
  readonly sources: KnowledgeSource[];
  readonly chunks: KnowledgeChunk[];
  readonly catalog: CatalogEntry[];
  private readonly docs: { tokens: Map<string, number>; length: number }[];
  private readonly df = new Map<string, number>();
  private readonly avgLength: number;

  constructor(sheets: SeedSheet[], catalog: CatalogEntry[]) {
    // Only sheets approved for automatic ingestion become searchable text.
    const approved = sheets.filter((s) => s.auto_ingest && s.review_status.startsWith('approved'));
    this.sources = approved.map((s) => ({
      id: s.id,
      title: s.title,
      kind: s.kind,
      sourceIds: s.source_ids,
      language: s.language,
      version: s.version,
      effectiveAt: s.valid_from ?? null,
      expiresAt: null,
      documentHash: sha256Hex(s.body),
      rightsEvidence: s.rights,
      allowedUses: ['consulta_no_app'],
      reviewStatus: s.review_status,
      ingestionStatus: s.body.trim() ? 'ready' : 'not_extractable',
      containsMarketRate: s.contains_market_rate,
    }));
    const bodies = new Map(approved.map((s) => [s.id, s.body]));
    this.chunks = this.sources.filter((s) => s.ingestionStatus === 'ready').flatMap((s) => chunk(s, bodies.get(s.id)!));
    this.catalog = catalog;
    this.docs = this.chunks.map((c) => {
      // The heading counts too: titles carry the topic.
      const tokens = new Map<string, number>();
      for (const t of normalizeTokens(`${c.heading} ${c.heading} ${c.text}`)) tokens.set(t, (tokens.get(t) ?? 0) + 1);
      for (const t of tokens.keys()) this.df.set(t, (this.df.get(t) ?? 0) + 1);
      return { tokens, length: [...tokens.values()].reduce((a, b) => a + b, 0) };
    });
    this.avgLength = this.docs.reduce((s, d) => s + d.length, 0) / Math.max(1, this.docs.length);
  }

  source(id: string): KnowledgeSource | undefined {
    return this.sources.find((s) => s.id === id);
  }

  chunkById(id: string): KnowledgeChunk | undefined {
    return this.chunks.find((c) => c.id === id);
  }

  /** Catalog entry for a book, law or study: a reference with no text the app can quote. */
  catalogEntry(query: string): CatalogEntry | undefined {
    const q = normalizeTokens(query).join(' ');
    return this.catalog.find((c) => c.id.toLowerCase() === query.toLowerCase().trim() || (q && normalizeTokens(c.title).join(' ').includes(q)));
  }

  /** BM25 (k1 1.2, b 0.75) with synonyms weighted at half. Hits below `minScore` are dropped. */
  search(query: string, topK = 3, minScore = 1.5): SearchHit[] {
    const terms = new Map<string, number>();
    for (const t of normalizeTokens(query)) {
      terms.set(t, Math.max(terms.get(t) ?? 0, 1));
      for (const syn of SYNONYM_OF.get(t) ?? []) if (syn !== t) terms.set(syn, Math.max(terms.get(syn) ?? 0, 0.5));
    }
    const n = this.docs.length;
    const scored = this.docs.map((d, i) => {
      let score = 0;
      for (const [term, weight] of terms) {
        const tf = d.tokens.get(term);
        if (!tf) continue;
        const df = this.df.get(term) ?? 0;
        const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5));
        score += weight * idf * ((tf * 2.2) / (tf + 1.2 * (0.25 + (0.75 * d.length) / this.avgLength)));
      }
      return { i, score };
    });
    // One hit per source: the best chunk of each sheet.
    const best = new Map<string, { i: number; score: number }>();
    for (const s of scored) {
      const id = this.chunks[s.i].sourceId;
      if (s.score >= minScore && s.score > (best.get(id)?.score ?? -1)) best.set(id, s);
    }
    return [...best.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map(({ i, score }) => ({ chunk: this.chunks[i], source: this.source(this.chunks[i].sourceId)!, score }));
  }
}

let shared: KnowledgeBase | null = null;
/** The bundled approved corpus (anexo A + J.3) and the reference catalog. */
export function knowledgeBase(): KnowledgeBase {
  shared ??= new KnowledgeBase([...(corpusA as SeedSheet[]), ...(corpusJ3 as SeedSheet[])], catalogJson as CatalogEntry[]);
  return shared;
}

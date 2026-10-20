import type { Cents } from '../../domain/types';
import type { Evidence } from './evidence';

// Validation step of the pipeline (briefing §11: intent → authorized query →
// calculation → validation → explanation). The model only explains; every
// amount it writes must be one the tools returned, or a sum or difference of
// two of them (e.g. "aumentou R$ 300" from two periods).

export interface CitedAmount {
  text: string;
  cents: Cents;
  verified: boolean;
}

export interface AnswerCheck {
  amounts: CitedAmount[];
  /** Amounts in the text that no tool result supports. */
  unverified: CitedAmount[];
  /** Evidence references cited in the text, in order of first use. */
  refs: string[];
  /** Cited references that don't exist in this answer. */
  unknownRefs: string[];
}

const BRL = /R\$\s?(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?/g;
const REF = /\[(E\d+)\]/g;
/** Bounds the pairwise sums and differences (n² values). */
const MAX_BASE_AMOUNTS = 400;

/** "R$ 1.234,56" amounts in a text, as positive cents. */
export function parseBRLAmounts(text: string): { text: string; cents: Cents; hasCents: boolean }[] {
  const found = [];
  for (const match of text.matchAll(BRL)) {
    const reais = Number(match[1].replace(/\./g, ''));
    const fraction = match[2] ? Number(match[2].padEnd(2, '0')) : 0;
    found.push({ text: match[0], cents: reais * 100 + fraction, hasCents: match[2] !== undefined });
  }
  return found;
}

export function citedRefs(text: string): string[] {
  return [...new Set([...text.matchAll(REF)].map((m) => m[1]))];
}

export function checkAnswer(text: string, evidences: Evidence[]): AnswerCheck {
  const base = [...new Set(evidences.flatMap((e) => e.amounts).map(Math.abs))].slice(0, MAX_BASE_AMOUNTS);
  const allowed = new Set<number>(base);
  for (let i = 0; i < base.length; i++) {
    for (let j = i + 1; j < base.length; j++) {
      allowed.add(base[i] + base[j]);
      allowed.add(Math.abs(base[i] - base[j]));
    }
  }
  const sorted = [...allowed].sort((a, b) => a - b);
  // "R$ 300" may round any value from R$ 299,50 to R$ 300,49.
  const nearWhole = (cents: number) => {
    let lo = 0;
    let hi = sorted.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sorted[mid] < cents - 50) lo = mid + 1;
      else hi = mid;
    }
    return lo < sorted.length && sorted[lo] < cents + 50;
  };
  const amounts = parseBRLAmounts(text).map(({ text: t, cents, hasCents }) => ({
    text: t,
    cents,
    verified: allowed.has(cents) || (!hasCents && nearWhole(cents)),
  }));
  const refs = citedRefs(text);
  const known = new Set(evidences.map((e) => e.ref));
  return {
    amounts,
    unverified: amounts.filter((a) => !a.verified),
    refs,
    unknownRefs: refs.filter((r) => !known.has(r)),
  };
}

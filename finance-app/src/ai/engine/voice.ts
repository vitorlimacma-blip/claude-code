import profile from '../knowledge/seed/L1_voice_profile.json';
import { plainText } from './intent';

// The assistant's voice (AI contract K, L.1), in one place. The register adapts
// the wording per turn; facts, limits and evidence never change with it.

export const VOICE_PROFILE = profile;

/**
 * - plain: everyday words, one idea at a time (default).
 * - brief: only the main answer (asked explicitly).
 * - technical: precise terms and the criteria inline (finance vocabulary used).
 * - sober: worry or urgency: acknowledgement, priorities, no jokes.
 */
export type Register = 'plain' | 'brief' | 'technical' | 'sober';

const TECHNICAL = /\b(payout|ebitda|fcf|fluxo de caixa livre|regime de caixa|competencia|dividend yield|cet|liquidez|duration|alavancagem)\b/;
const SOBER = /(atrasei|nao consigo pagar|estou devendo|preocupad|desesperad|sem dinheiro|divida)/;
const BRIEF = /(responda curto|resposta curta|seja breve|respostas curtas|so o numero|em uma frase|resuma)/;

/** Register for this turn only; it is never saved (contract: style is not persisted automatically). */
export function registerFor(text: string): Register {
  const t = plainText(text);
  if (SOBER.test(t)) return 'sober';
  if (BRIEF.test(t)) return 'brief';
  if (TECHNICAL.test(t)) return 'technical';
  return 'plain';
}

/** System prompt section for a model: the production instruction plus the invariant rules. */
export function voiceInstruction(register: Register): string {
  const adapt: Record<Register, string> = {
    plain: profile.adaptation.plain_user,
    brief: 'A pessoa pediu brevidade: só a resposta principal e o período, sem gírias nem emoji.',
    technical: profile.adaptation.technical_user,
    sober: 'A pessoa está preocupada: tom sóbrio e acolhedor, prioridades concretas, sem piadas, culpa ou pressão.',
  };
  return [
    profile.production_instruction,
    `Mascote: ${profile.brand_mascot}. ${profile.naming_status}`,
    `Ordem da resposta: ${profile.defaults.answer_order.join(', ')}.`,
    `Registro deste turno: ${adapt[register]}`,
    'Regras que o tom nunca muda:',
    ...profile.invariant_rules.map((r) => `- ${r}`),
  ].join('\n');
}

/** Opening for a worried person: acknowledges without drama, then goes to what can be done. */
export function soberOpening(): string {
  return 'Entendo a preocupação. Vamos olhar primeiro o que é essencial e o que dá para fazer agora.';
}

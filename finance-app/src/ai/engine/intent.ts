import { addMonths, monthRange } from '../../domain/dates';
import type { Category, Cents, DateKey } from '../../domain/types';

// Intent and capability classification done by code, outside any model
// (AI contract K.8 item 3). It decides what a request is and which enabled
// capability would serve it; a model can explain the result but never widen it.

/** Capabilities of the product, set by trusted app configuration (K.4). Never controlled by a model. */
export const CAPABILITIES = {
  financialEducation: true,
  marketDataLookup: false,
  securitiesAnalysis: false,
  personalizedInvestmentAdvice: false,
  orderExecution: false,
} as const;
export type Capability = keyof typeof CAPABILITIES;

export type Intent =
  | 'spending_summary'
  | 'budget_deviation'
  | 'balance'
  | 'forecast'
  | 'purchase_simulation'
  | 'goal_plan'
  | 'trip_plan'
  | 'compare_periods'
  | 'transfer_question'
  | 'interest_simulation'
  | 'knowledge'
  | 'source_citation'
  | 'memory_save'
  | 'memory_forget'
  | 'memory_show'
  | 'current_rate'
  | 'investment_advice'
  | 'securities_analysis'
  | 'order_execution'
  | 'tax_or_legal'
  | 'credential_claim'
  | 'guarantee_request'
  | 'other_person_data'
  | 'distress'
  | 'unknown';

export interface Period {
  from: DateKey;
  to: DateKey;
  /** How the period was understood, for the answer ("outubro até hoje"). */
  label: string;
}

export interface Classification {
  intent: Intent;
  /** Capability the request needs; null for the person's own data. */
  capability: Capability | null;
  /** False when the needed capability is disabled in this product. */
  enabled: boolean;
  period: Period | null;
  amount: Cents | null;
  categoryId: string | null;
  /** The person asked not to save anything (adapt the turn only). */
  noPersistence: boolean;
}

const MONTHS = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

export function plainText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/** "R$ 1.234,56", "R$500", "500 reais" → cents. */
export function parseAmount(text: string): Cents | null {
  const m = /r\$\s?(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?|(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?\s?(?:reais|real)\b/i.exec(text);
  if (!m) return null;
  const whole = (m[1] ?? m[3]).replace(/\./g, '');
  const cents = (m[2] ?? m[4] ?? '').padEnd(2, '0');
  return Number(whole) * 100 + Number(cents || '0');
}

/** The period a question talks about, relative to `today`; null when it doesn't say. */
export function parsePeriod(text: string, today: DateKey): Period | null {
  const t = plainText(text);
  const month = today.slice(0, 7);
  const dates = [...t.matchAll(/(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?/g)];
  if (dates.length >= 2) {
    const key = (m: RegExpMatchArray) => `${m[3] ?? today.slice(0, 4)}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    const [a, b] = [key(dates[0]), key(dates[1])].sort();
    return { from: a, to: b, label: `de ${dates[0][0]} a ${dates[1][0]}` };
  }
  const lastN = /ultimos (\d{1,2}) meses/.exec(t);
  if (lastN) {
    const n = Math.min(24, Number(lastN[1]));
    return { from: `${addMonths(month, -(n - 1))}-01`, to: today, label: `últimos ${n} meses, até hoje` };
  }
  if (/mes passado|mes anterior|ultimo mes/.test(t)) {
    const prev = addMonths(month, -1);
    return { ...monthRange(prev), label: 'mês passado' };
  }
  if (/(este|neste|esse|nesse|deste|desse) mes|mes atual|ate agora|ate hoje/.test(t)) {
    return { from: `${month}-01`, to: today, label: 'este mês, até hoje' };
  }
  if (/\bhoje\b/.test(t) && !/selic|cdi|ipca|cotacao|dolar/.test(t)) return { from: today, to: today, label: 'hoje' };
  for (let i = 0; i < 12; i++) {
    const re = new RegExp(`\\b${MONTHS[i]}\\b(?:\\s+de\\s+(\\d{4}))?`);
    const m = re.exec(t);
    if (!m) continue;
    let year = m[1] ? Number(m[1]) : Number(today.slice(0, 4));
    const key = `${year}-${String(i + 1).padStart(2, '0')}`;
    if (!m[1] && key > month) year -= 1;
    const mk = `${year}-${String(i + 1).padStart(2, '0')}`;
    const range = monthRange(mk);
    if (mk === month) return { from: range.from, to: today, label: `${MONTHS[i] === 'marco' ? 'março' : MONTHS[i]} até hoje` };
    return { ...range, label: `${MONTHS[i] === 'marco' ? 'março' : MONTHS[i]} de ${year}` };
  }
  return null;
}

/** The category named in the text (longest name wins), among active ones. */
export function findCategory(text: string, categories: Category[]): string | null {
  const t = ` ${plainText(text).replace(/[^a-z0-9]+/g, ' ')} `;
  let best: Category | null = null;
  for (const c of categories) {
    if (c.archived || c.deletedAt) continue;
    const name = plainText(c.name).replace(/[^a-z0-9]+/g, ' ').trim();
    if (name.length < 3) continue;
    const singular = name.endsWith('s') ? name.slice(0, -1) : name;
    if ((t.includes(` ${name} `) || t.includes(` ${singular} `)) && (!best || name.length > plainText(best.name).length)) best = c;
  }
  return best?.id ?? null;
}

const has = (t: string, re: RegExp) => re.test(t);

export function classify(text: string, today: DateKey, categories: Category[] = []): Classification {
  const t = plainText(text);
  const base = { period: parsePeriod(text, today), amount: parseAmount(text), categoryId: findCategory(text, categories), noPersistence: has(t, /nao (salve|guarde|grave|lembre)|sem salvar/) };
  const out = (intent: Intent, capability: Capability | null = null): Classification => ({
    ...base,
    intent,
    capability,
    enabled: capability === null ? true : CAPABILITIES[capability],
  });

  // Requests the product must decline or bound, checked first.
  if (has(t, /(apresente|diga que e|finja ser).*(consultor|analista|autorizad|cvm|certificad)|anos de experiencia/)) return out('credential_claim');
  if (has(t, /(garant|prometa|lucro certo|nao vou perder|sem risco|rendera)/) && has(t, /(lucro|retorno|render|ganh|perder|taxa|meta|acao|investiment)/)) return out('guarantee_request');
  if (has(t, /(compre|venda|vender|comprar|transfira|pague|faca um pix|aplique|resgate)\b.*(pra mim|por mim|agora|ja)|execute (a )?ordem/)) return out('order_execution', 'orderExecution');
  if (has(t, /(quais?|que) (acoes|acao|fii|fundos?|ativos?|papel|papeis) (eu )?(devo|tenho que|posso|vale a pena)? ?(comprar|investir)|onde (devo )?investir|monte (uma |minha )?carteira|quanto (colocar|investir) em cada/)) {
    return out('investment_advice', 'personalizedInvestmentAdvice');
  }
  if (has(t, /(melhores?|ranking|top \d+|maior(es)? pagadora|compare (as )?(acoes|empresas))/) && has(t, /(acao|acoes|dividend|empresa|pagadora|fii|bolsa)/)) {
    return out('securities_analysis', 'securitiesAnalysis');
  }
  if (has(t, /(gastos?|dados|extrato|preferencias|lancamentos) (privad|da minha esposa|do meu marido|dela|dele|da pessoa b|de outra pessoa)|pessoa b\b/)) return out('other_person_data');
  if (has(t, /\b(selic|cdi|ipca|cotacao|dolar hoje|taxa atual|juros atuais)\b/)) return out('current_rate', 'marketDataLookup');
  if (has(t, /(imposto|irpf|\bir\b|tributa|deduz|401\(k\)|lei |lgpd|pl \d+|ccpa|regulament)/)) return out('tax_or_legal');
  if (has(t, /(pagina|capitulo|trecho|citacao|cite)/) && has(t, /(livro|autor|obra|pai rico|bogle|lynch)/)) return out('source_citation');

  // Memory.
  if (has(t, /(apague|esqueca|remova|exclua|delete).*(preferencia|memoria|lembr|regra|que eu disse)/)) return out('memory_forget');
  if (has(t, /(lembre|guarde|anote|memorize|salve) (que|isso)|(prefiro|minha preferencia e)/) && !base.noPersistence) return out('memory_save');
  if (has(t, /o que (voce )?(lembra|sabe|guardou) (sobre|de) mim|minhas memorias|quais preferencias/)) return out('memory_show');

  if (has(t, /(atrasei|nao consigo pagar|estou devendo|preocupad|desesperad|sem dinheiro para (comer|comida|aluguel))/)) return out('distress');

  // The person's own data.
  // A trip with an amount is a plan over time, not a purchase today ("cabe uma viagem de R$ 6.000 em março?").
  if (has(t, /(viagem|viajar|ferias)/) && base.amount && has(t, /(cabe|consigo|da para|juntar|quero gastar|pretendo gastar|vai caber|planej)/)) return out('trip_plan');
  if (has(t, /(posso (gastar|comprar)|cabe (no|uma)|se eu (comprar|gastar)|compra de r\$|afetaria (minha )?margem|piso|saldo minimo)/) && base.amount) return out('purchase_simulation');
  if (has(t, /(quanto posso gastar|folga|sem cair abaixo)/)) return out('purchase_simulation');
  if (has(t, /(meta|viagem|objetivo|aportes?)/) && has(t, /(falta|dividir|aporte|quanto guardar|quanto poupar|plano)/)) return out('goal_plan');
  if (has(t, /(saldo previsto|vou ter|fim do mes|previsao|projecao|compromissos)/)) return out('forecast');
  if (has(t, /(o que mudou|diferenca|explica .*(aumento|diferenca)|comparad|em relacao ao mes|setembro e outubro|mes passado e)/)) return out('compare_periods');
  if (has(t, /(orcamento|passou do|estour|limite da categoria|desvio)/)) return out('budget_deviation');
  if (has(t, /(saldo|quanto (eu )?tenho|quanto ha|quanto tem)/)) return out('balance');
  if (has(t, /transferencia/) && has(t, /(gasto|despesa|aumentou)/)) return out('transfer_question');
  if (has(t, /(juros compostos|valor futuro|rende(ria)? a \d)/)) return out('interest_simulation', 'financialEducation');
  if (has(t, /(gastei|gasto|despesa|receita|resultado|ganhei|recebi|renda)/)) return out('spending_summary');
  if (has(t, /(como (o app|o aplicativo|funciona|e calculad|evita|fica)|o que e |por que|posso usar|o que (voce|o assistente) (pode|faz))/)) return out('knowledge', 'financialEducation');
  return out('unknown');
}

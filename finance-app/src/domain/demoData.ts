import { addMonths, daysInMonth, fromDateKey, monthRange, toDateKey } from './dates';
import { defaultNature, inferTransferNature, invoiceFor } from './ledger';
import type { AccountType, Cents, DateKey, MonthKey, PaymentMethod, TransactionNature, TransactionType } from './types';

/**
 * Realistic but fictitious data for trying the app out: a Brazilian household
 * over the last months, with statement-style descriptions, fixed bills,
 * subscriptions, a credit card paid every month, investments, budgets, a few
 * unusual expenses and some uncategorized entries for the AI to classify.
 *
 * Every id starts with `DEMO_PREFIX`, so the data can be removed later without
 * touching anything the user created. The output is deterministic for a given
 * `today` and `seed`.
 */
export const DEMO_PREFIX = 'demo-';

export interface DemoAccount {
  id: string;
  name: string;
  type: AccountType;
  institution: string;
  color: string;
  initialBalance: Cents;
  creditLimit: Cents | null;
  closingDay: number | null;
  dueDay: number | null;
}

export interface DemoTransaction {
  id: string;
  accountId: string;
  categoryId: string | null;
  type: TransactionType;
  nature: TransactionNature;
  amount: Cents;
  date: DateKey;
  description: string;
  paymentMethod: PaymentMethod;
  transferPairId: string | null;
}

export interface DemoBudget {
  id: string;
  categoryId: string;
  amount: Cents;
}

export interface DemoRecurrence {
  id: string;
  kind: 'expense' | 'income';
  description: string;
  amount: Cents;
  accountId: string;
  categoryId: string;
  paymentMethod: PaymentMethod;
  dayOfMonth: number;
  startDate: DateKey;
}

export interface DemoData {
  accounts: DemoAccount[];
  transactions: DemoTransaction[];
  budgets: DemoBudget[];
  /** The salary and fixed bills, as expected items ("Contas previstas"). */
  recurrences: DemoRecurrence[];
}

export const DEMO_ACCOUNTS = {
  itau: 'demo-acc-itau',
  santanderCard: 'demo-acc-santander-cartao',
  xp: 'demo-acc-xp',
  mercadoPago: 'demo-acc-mercadopago',
} as const;

const ACCOUNTS: DemoAccount[] = [
  {
    id: DEMO_ACCOUNTS.itau,
    name: 'Itaú conta corrente',
    type: 'checking',
    institution: 'itau',
    color: '#EC7000',
    initialBalance: 420000,
    creditLimit: null,
    closingDay: null,
    dueDay: null,
  },
  {
    id: DEMO_ACCOUNTS.santanderCard,
    name: 'Cartão Santander',
    type: 'credit_card',
    institution: 'santander',
    color: '#EC0000',
    initialBalance: 0,
    creditLimit: 1200000,
    closingDay: 3,
    dueDay: 10,
  },
  {
    id: DEMO_ACCOUNTS.xp,
    name: 'XP Investimentos',
    type: 'investment',
    institution: 'xp',
    color: '#1A1A1A',
    initialBalance: 2500000,
    creditLimit: null,
    closingDay: null,
    dueDay: null,
  },
  {
    id: DEMO_ACCOUNTS.mercadoPago,
    name: 'Mercado Pago',
    type: 'checking',
    institution: 'mercado_pago',
    color: '#00B1EA',
    initialBalance: 35000,
    creditLimit: null,
    closingDay: null,
    dueDay: null,
  },
];

const BUDGETS: DemoBudget[] = [
  { id: 'demo-budget-alimentacao', categoryId: 'sys-alimentacao', amount: 180000 },
  { id: 'demo-budget-delivery', categoryId: 'sys-alimentacao-delivery', amount: 30000 },
  { id: 'demo-budget-transporte', categoryId: 'sys-transporte', amount: 70000 },
  { id: 'demo-budget-lazer', categoryId: 'sys-lazer', amount: 50000 },
  { id: 'demo-budget-compras', categoryId: 'sys-compras', amount: 60000 },
];

/** Small deterministic PRNG (mulberry32), so the same seed gives the same data. */
function createRandom(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    /** Integer in [min, max]. */
    int: (min: number, max: number) => Math.floor(next() * (max - min + 1)) + min,
    /** Amount in cents between two values in reais, rounded to cents. */
    money: (min: number, max: number) => Math.round((min + next() * (max - min)) * 100),
    pick: <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)],
    chance: (p: number) => next() < p,
  };
}

interface Spend {
  categoryId: string | null;
  descriptions: readonly string[];
  min: number;
  max: number;
  method: PaymentMethod;
  /** Card purchases go on the credit card; everything else leaves the checking account. */
  onCard?: boolean;
}

// Variable spending: how many times per month, and what it looks like on a statement.
const VARIABLE: { perMonth: [number, number]; spend: Spend }[] = [
  {
    perMonth: [4, 6],
    spend: {
      categoryId: 'sys-alimentacao-mercado',
      descriptions: ['SUPERMERCADO BH', 'CARREFOUR HIPER', 'ASSAI ATACADISTA', 'SUPERMERCADOS EPA'],
      min: 90,
      max: 420,
      method: 'debit',
    },
  },
  {
    perMonth: [4, 7],
    spend: {
      categoryId: 'sys-alimentacao-delivery',
      descriptions: ['IFD*IFOOD', 'IFD*IFOOD CLUB', 'RAPPI BRASIL'],
      min: 35,
      max: 95,
      method: 'credit',
      onCard: true,
    },
  },
  {
    perMonth: [2, 4],
    spend: {
      categoryId: 'sys-alimentacao-restaurantes',
      descriptions: ['RESTAURANTE SABOR MINEIRO', 'MADERO STEAK HOUSE', 'OUTBACK STEAKHOUSE', 'COCO BAMBU'],
      min: 60,
      max: 280,
      method: 'credit',
      onCard: true,
    },
  },
  {
    perMonth: [5, 9],
    spend: {
      categoryId: 'sys-alimentacao-padaria',
      descriptions: ['PADARIA PAO QUENTE', 'PADARIA E CONFEITARIA SAO JOSE', 'STARBUCKS'],
      min: 8,
      max: 45,
      method: 'pix',
    },
  },
  {
    perMonth: [2, 3],
    spend: {
      categoryId: 'sys-transporte-combustivel',
      descriptions: ['POSTO SHELL', 'POSTO IPIRANGA', 'AUTO POSTO PETROBRAS'],
      min: 180,
      max: 320,
      method: 'credit',
      onCard: true,
    },
  },
  {
    perMonth: [3, 6],
    spend: {
      categoryId: 'sys-transporte-apps',
      descriptions: ['UBER *TRIP', '99 *POP', 'UBER *TRIP HELP.UBER.COM'],
      min: 12,
      max: 48,
      method: 'credit',
      onCard: true,
    },
  },
  {
    perMonth: [1, 2],
    spend: {
      categoryId: 'sys-transporte-estacionamento',
      descriptions: ['ESTAPAR ESTACIONAMENTOS', 'SEM PARAR'],
      min: 15,
      max: 60,
      method: 'credit',
      onCard: true,
    },
  },
  {
    perMonth: [1, 3],
    spend: {
      categoryId: 'sys-saude-farmacia',
      descriptions: ['DROGASIL', 'DROGARIA ARAUJO', 'DROGA RAIA'],
      min: 25,
      max: 160,
      method: 'debit',
    },
  },
  {
    perMonth: [1, 2],
    spend: {
      categoryId: 'sys-lazer-bares',
      descriptions: ['BAR DO ZE', 'CERVEJARIA ALBANOS', 'BOTECO DA ESQUINA'],
      min: 50,
      max: 180,
      method: 'pix',
    },
  },
  {
    perMonth: [0, 1],
    spend: {
      categoryId: 'sys-lazer-eventos',
      descriptions: ['CINEMARK', 'INGRESSE*SHOW', 'SYMPLA'],
      min: 40,
      max: 220,
      method: 'credit',
      onCard: true,
    },
  },
  {
    perMonth: [0, 2],
    spend: {
      categoryId: 'sys-compras-roupas',
      descriptions: ['LOJAS RENNER', 'C&A MODAS', 'CENTAURO'],
      min: 80,
      max: 350,
      method: 'credit',
      onCard: true,
    },
  },
  {
    perMonth: [0, 2],
    spend: {
      categoryId: 'sys-compras-casa',
      descriptions: ['LEROY MERLIN', 'TOK STOK', 'MP*MERCADOLIVRE'],
      min: 40,
      max: 300,
      method: 'credit',
      onCard: true,
    },
  },
  {
    perMonth: [0, 1],
    spend: {
      categoryId: 'sys-cuidados',
      descriptions: ['BARBEARIA DOM', 'SALAO BELEZA PURA'],
      min: 45,
      max: 120,
      method: 'pix',
    },
  },
];

// Fixed monthly bills: [day, category, description, min, max, method, account].
const FIXED: [number, string, string, number, number, PaymentMethod, 'checking' | 'card'][] = [
  [5, 'sys-moradia-aluguel', 'PIX ENVIADO IMOBILIARIA LAR', 2200, 2200, 'pix', 'checking'],
  [8, 'sys-moradia-condominio', 'PAG BOLETO CONDOMINIO RESIDENCIAL', 640, 640, 'boleto', 'checking'],
  [12, 'sys-moradia-energia', 'CEMIG DISTRIBUICAO', 160, 290, 'boleto', 'checking'],
  [14, 'sys-moradia-agua', 'COPASA', 85, 140, 'boleto', 'checking'],
  [15, 'sys-moradia-internet', 'CLARO NET VIRTUA', 129.9, 129.9, 'debit', 'checking'],
  [15, 'sys-assinaturas-celular', 'VIVO MOVEL', 64.99, 64.99, 'debit', 'checking'],
  [10, 'sys-saude-plano', 'UNIMED BH', 589, 589, 'boleto', 'checking'],
  [6, 'sys-saude-academia', 'SMARTFIT', 119.9, 119.9, 'credit', 'card'],
  [7, 'sys-assinaturas-streaming', 'NETFLIX.COM', 44.9, 44.9, 'credit', 'card'],
  [9, 'sys-assinaturas-streaming', 'SPOTIFY', 21.9, 21.9, 'credit', 'card'],
  [18, 'sys-assinaturas-streaming', 'AMAZON PRIME', 19.9, 19.9, 'credit', 'card'],
  [20, 'sys-assinaturas-apps', 'GOOGLE ONE', 9.99, 9.99, 'credit', 'card'],
];

// Brand-new merchants in the last month, left without category for the AI to classify.
const UNCATEGORIZED: [string, number][] = [
  ['ZE DELIVERY BEBIDAS', 89.9],
  ['PETZ PET SHOP', 214.5],
  ['KALUNGA PAPELARIA', 63.2],
  ['DECATHLON', 279.99],
  ['HORTIFRUTI CENTRAL', 74.35],
  ['LOCALIZA RENT A CAR', 389],
  ['LIVRARIA LEITURA', 118.9],
  ['DENTAL SORRISO', 250],
];

export function generateDemoData(today: DateKey, options: { months?: number; seed?: number } = {}): DemoData {
  const months = options.months ?? 6;
  const random = createRandom(options.seed ?? 20261019);
  const currentMonth = today.slice(0, 7);
  const firstMonth = addMonths(currentMonth, -(months - 1));
  const transactions: DemoTransaction[] = [];
  let seq = 0;
  const id = (kind: string) => `${DEMO_PREFIX}${kind}-${String(++seq).padStart(5, '0')}`;

  const dayOf = (month: MonthKey, day: number): DateKey => {
    const [y, m] = month.split('-').map(Number);
    return `${month}-${String(Math.min(day, daysInMonth(y, m - 1))).padStart(2, '0')}`;
  };

  function add(t: Omit<DemoTransaction, 'id' | 'transferPairId' | 'nature'> & { nature?: TransactionNature }) {
    if (t.date > today) return; // never in the future
    transactions.push({ ...t, id: id('tx'), nature: t.nature ?? defaultNature(t.type), transferPairId: null });
  }

  const accountType = new Map(ACCOUNTS.map((a) => [a.id, a.type]));

  function transfer(from: string, to: string, amount: Cents, date: DateKey, description: string) {
    if (date > today || amount <= 0) return;
    const pairId = id('pair');
    const nature = inferTransferNature(accountType.get(from), accountType.get(to));
    const common = { categoryId: null, nature, amount, date, description, paymentMethod: 'transfer' as const, transferPairId: pairId };
    transactions.push({ ...common, id: id('tx'), accountId: from, type: 'transfer_out' });
    transactions.push({ ...common, id: id('tx'), accountId: to, type: 'transfer_in' });
  }

  // Card purchases per invoice (by its due month), using the card's closing and due days.
  const card = ACCOUNTS.find((a) => a.id === DEMO_ACCOUNTS.santanderCard)!;
  const cardSpendByInvoice = new Map<MonthKey, Cents>();
  const spendOnCard = (date: DateKey, amount: Cents) => {
    const invoice = invoiceFor(date, card.closingDay!, card.dueDay!).month;
    cardSpendByInvoice.set(invoice, (cardSpendByInvoice.get(invoice) ?? 0) + amount);
  };

  for (let i = 0; i < months; i++) {
    const month = addMonths(firstMonth, i);
    const [y, m] = month.split('-').map(Number);
    const lastDay = daysInMonth(y, m - 1);
    const isCurrent = month === currentMonth;

    // Income: salary on the 5th business-ish day, investment yield, some freelance via Mercado Pago.
    add({
      accountId: DEMO_ACCOUNTS.itau,
      categoryId: 'sys-receita-salario',
      type: 'income',
      amount: 980000,
      date: dayOf(month, 5),
      description: 'CREDITO SALARIO',
      paymentMethod: 'transfer',
    });
    add({
      accountId: DEMO_ACCOUNTS.xp,
      categoryId: 'sys-receita-rendimentos',
      type: 'income',
      amount: random.money(230, 290),
      date: dayOf(month, lastDay),
      description: 'RENDIMENTO CDB XP',
      // Appreciation of an investment is not available income (briefing §9).
      nature: 'investment_return',
      paymentMethod: 'transfer',
    });
    if (random.chance(0.6)) {
      add({
        accountId: DEMO_ACCOUNTS.mercadoPago,
        categoryId: 'sys-receita-freelance',
        type: 'income',
        amount: random.money(400, 1500),
        date: dayOf(month, random.int(10, 25)),
        description: 'PIX RECEBIDO CLIENTE CONSULTORIA',
        paymentMethod: 'pix',
      });
    }

    // Fixed bills.
    for (const [day, categoryId, description, min, max, method, where] of FIXED) {
      const date = dayOf(month, day);
      const amount = random.money(min, max);
      add({
        accountId: where === 'card' ? DEMO_ACCOUNTS.santanderCard : DEMO_ACCOUNTS.itau,
        categoryId,
        type: 'expense',
        amount,
        date,
        description,
        paymentMethod: method,
      });
      if (where === 'card' && date <= today) spendOnCard(date, amount);
    }

    // Variable spending. The current month runs hotter on delivery, so the budget alert shows up.
    for (const { perMonth, spend } of VARIABLE) {
      let count = random.int(perMonth[0], perMonth[1]);
      if (isCurrent && spend.categoryId === 'sys-alimentacao-delivery') count += 3;
      for (let k = 0; k < count; k++) {
        const date = dayOf(month, random.int(1, lastDay));
        const amount = random.money(spend.min, spend.max);
        add({
          accountId: spend.onCard ? DEMO_ACCOUNTS.santanderCard : DEMO_ACCOUNTS.itau,
          categoryId: spend.categoryId,
          type: 'expense',
          amount,
          date,
          description: random.pick(spend.descriptions),
          paymentMethod: spend.method,
        });
        if (spend.onCard && date <= today) spendOnCard(date, amount);
      }
    }

    // Small day-to-day Pix from the Mercado Pago account.
    for (let k = random.int(2, 4); k > 0; k--) {
      const [description, categoryId] = random.pick([
        ['PIX QRS LANCHONETE DA PRACA', 'sys-alimentacao-restaurantes'],
        ['PIX ENVIADO FEIRA LIVRE', 'sys-alimentacao-mercado'],
        ['PIX QRS SORVETERIA', 'sys-alimentacao-padaria'],
      ] as const);
      add({
        accountId: DEMO_ACCOUNTS.mercadoPago,
        categoryId,
        type: 'expense',
        amount: random.money(10, 60),
        date: dayOf(month, random.int(1, lastDay)),
        description,
        paymentMethod: 'pix',
      });
    }

    // Saving: monthly transfer to the investment account.
    transfer(DEMO_ACCOUNTS.itau, DEMO_ACCOUNTS.xp, 100000, dayOf(month, 6), 'TED APLICACAO XP');
  }

  // Unusual expenses, for the "gastos fora do normal" features.
  const lastMonth = addMonths(currentMonth, -1);
  add({
    accountId: DEMO_ACCOUNTS.itau,
    categoryId: 'sys-transporte-manutencao',
    type: 'expense',
    amount: 284000,
    date: dayOf(lastMonth, 21),
    description: 'OFICINA MECANICA AUTO CENTER',
    paymentMethod: 'pix',
  });
  add({
    accountId: DEMO_ACCOUNTS.santanderCard,
    categoryId: 'sys-compras-eletronicos',
    type: 'expense',
    amount: 459900,
    date: dayOf(addMonths(currentMonth, -3), 12),
    description: 'MAGAZINE LUIZA',
    paymentMethod: 'credit',
  });
  spendOnCard(dayOf(addMonths(currentMonth, -3), 12), 459900);

  // Credit card: on each due day, pay that invoice in full from the checking account.
  for (let i = 0; i < months; i++) {
    const month = addMonths(firstMonth, i);
    transfer(
      DEMO_ACCOUNTS.itau,
      DEMO_ACCOUNTS.santanderCard,
      cardSpendByInvoice.get(month) ?? 0,
      dayOf(month, card.dueDay!),
      'PAGAMENTO FATURA CARTAO SANTANDER'
    );
  }

  // Recent entries with new merchants and no category, for the AI to suggest.
  const recentFrom = toDateKey(new Date(fromDateKey(today).getTime() - 20 * 86_400_000));
  const start = recentFrom > monthRange(firstMonth).from ? recentFrom : monthRange(firstMonth).from;
  const span = Math.max(0, Math.round((fromDateKey(today).getTime() - fromDateKey(start).getTime()) / 86_400_000));
  for (const [description, value] of UNCATEGORIZED) {
    add({
      accountId: DEMO_ACCOUNTS.itau,
      categoryId: null,
      type: 'expense',
      amount: Math.round(value * 100),
      date: toDateKey(new Date(fromDateKey(start).getTime() + random.int(0, span) * 86_400_000)),
      description,
      paymentMethod: random.pick(['debit', 'pix'] as const),
    });
  }

  transactions.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const startDate = `${firstMonth}-01`;
  const recurrences: DemoRecurrence[] = [
    {
      id: `${DEMO_PREFIX}rec-salario`,
      kind: 'income',
      description: 'CREDITO SALARIO',
      amount: 980000,
      accountId: DEMO_ACCOUNTS.itau,
      categoryId: 'sys-receita-salario',
      paymentMethod: 'transfer',
      dayOfMonth: 5,
      startDate,
    },
    ...FIXED.map(([day, categoryId, description, min, max, method, where], i) => ({
      id: `${DEMO_PREFIX}rec-${String(i + 1).padStart(2, '0')}`,
      kind: 'expense' as const,
      description,
      amount: Math.round(((min + max) / 2) * 100),
      accountId: where === 'card' ? DEMO_ACCOUNTS.santanderCard : DEMO_ACCOUNTS.itau,
      categoryId,
      paymentMethod: method,
      dayOfMonth: day,
      startDate,
    })),
  ];
  return { accounts: ACCOUNTS, transactions, budgets: BUDGETS, recurrences };
}

import { addDaysToDateKey, formatDateBR, monthRange } from './dates';
import { balanceGroup, openInvoices, resultEffect } from './ledger';
import { formatCents } from './money';
import { allOccurrences, reconcile, settledTransactionIds } from './recurrence';
import { daysInclusive, typicalSpending, type TypicalSpending } from './spending';
import type { Account, Cents, DateKey, Recurrence, Reserve, Transaction } from './types';

// Cash projection until the next income (briefing §7 and §10): what is there
// now, what is confirmed to come in and go out, and an estimate of variable
// spending, with every step shown and every gap stated.

export interface ProjectionEvent {
  date: DateKey;
  label: string;
  /** + money in, − money out of the available accounts. */
  amount: Cents;
  source: 'recurrence' | 'scheduled' | 'invoice';
  /** A bill expected before today with no matching transaction (maybe paid without being recorded). */
  overdue?: boolean;
}

export interface CashProjection {
  status: 'ok' | 'limited' | 'unavailable';
  /** Why it is limited or unavailable. */
  reason?: string;
  /** First day considered (today). */
  from: DateKey;
  /** Last day considered: the day before the next income, or the end of the month. */
  to: DateKey;
  /** The next income that ends the period, when there is one. */
  nextIncome: { date: DateKey; label: string; amount: Cents } | null;
  available: Cents;
  /** Accounts counted as available, for the explanation. */
  availableAccounts: string[];
  incomes: ProjectionEvent[];
  outflows: ProjectionEvent[];
  variable: { amount: Cents; daily: Cents; days: number; months: string[] } | null;
  /** available + incomes − outflows − variable (variable only when known). */
  margin: Cents;
  /** Lowest balance day by day in the period, and when. */
  lowest: { amount: Cents; date: DateKey };
  /** Day-by-day available balance from `from` to `to`, for the chart. */
  series: { date: DateKey; balance: Cents }[];
  steps: { label: string; cents: Cents; op: '+' | '−' | '=' }[];
  basis: string;
  limitations: string[];
  typical: TypicalSpending;
}

const MONTHS_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const monthShort = (m: string) => `${MONTHS_SHORT[Number(m.slice(5, 7)) - 1]}/${m.slice(2, 4)}`;

/** Search horizon for the next income. */
const NEXT_INCOME_HORIZON_DAYS = 45;

export function projectCash(input: {
  today: DateKey;
  accounts: Account[];
  /** Balances as of today. */
  balances: Map<string, Cents>;
  /** History (a few months back) plus anything dated in the future. */
  transactions: Transaction[];
  recurrences: Recurrence[];
  /** Money set aside (emergency, goals): part of the balance, not free (AI contract §4, semantics 6). */
  reserves?: Reserve[];
}): CashProjection {
  const { today, accounts, balances, transactions, recurrences } = input;
  const live = transactions.filter((t) => !t.deletedAt);
  const availableAccounts = accounts.filter((a) => balanceGroup(a.type) === 'available' && !a.archived);
  const availableIds = new Set(availableAccounts.map((a) => a.id));
  const reserved = (input.reserves ?? []).filter((r) => !r.deletedAt && availableIds.has(r.accountId)).reduce((s, r) => s + r.amount, 0);
  const available = availableAccounts.reduce((s, a) => s + (balances.get(a.id) ?? 0), 0) - reserved;
  const limitations: string[] = [];
  if (reserved > 0) limitations.push(`${formatCents(reserved)} reservado(s) para emergência ou metas ficaram fora do disponível.`);

  const settled = settledTransactionIds(recurrences, live, addDaysToDateKey(today, -120), today);
  const typical = typicalSpending(live, settled, today);

  // Occurrences from the start of the month (to catch bills not yet recorded) to the horizon.
  const horizon = addDaysToDateKey(today, NEXT_INCOME_HORIZON_DAYS);
  const monthStart = monthRange(today.slice(0, 7)).from;
  const occurrences = allOccurrences(recurrences, monthStart, horizon);
  const matched = reconcile(occurrences, live);
  const pendingOcc = occurrences.filter((o) => !matched.has(o));

  // Next income: the first expected or scheduled income after today.
  const futureIncomes: { date: DateKey; label: string; amount: Cents }[] = [
    ...pendingOcc.filter((o) => o.recurrence.kind === 'income' && o.date > today).map((o) => ({ date: o.date, label: o.recurrence.description, amount: o.recurrence.amount })),
    ...live
      .filter((t) => t.date > today && t.date <= horizon && resultEffect(t) === 'income' && availableIds.has(t.accountId))
      .map((t) => ({ date: t.date, label: t.description || 'Receita agendada', amount: t.amount })),
  ].sort((a, b) => a.date.localeCompare(b.date));
  const nextIncome = futureIncomes[0] ?? null;
  const to = nextIncome ? addDaysToDateKey(nextIncome.date, -1) : monthRange(today.slice(0, 7)).to;
  if (!nextIncome) {
    limitations.push('Nenhuma receita prevista nos próximos 45 dias: o cálculo vai até o fim do mês. Cadastre o salário em Contas previstas para ver a margem até o próximo recebimento.');
  }

  const inPeriod = (date: DateKey) => date >= today && date <= to;
  const incomes: ProjectionEvent[] = [];
  const outflows: ProjectionEvent[] = [];

  for (const o of pendingOcc) {
    const rec = o.recurrence;
    const overdue = o.date < today;
    if (!overdue && !inPeriod(o.date)) continue;
    if (rec.kind === 'income') {
      // Incomes not received by their date are not assumed to arrive: they stay out, stated.
      if (!overdue) incomes.push({ date: o.date, label: rec.description, amount: rec.amount, source: 'recurrence' });
      continue;
    }
    const account = accounts.find((a) => a.id === rec.accountId);
    if (account?.type === 'credit_card') continue; // Paid through the card invoice.
    outflows.push({ date: overdue ? today : o.date, label: rec.description, amount: -rec.amount, source: 'recurrence', overdue });
  }

  const matchedIds = new Set([...matched.values()].map((t) => t.id));
  for (const t of live) {
    if (t.date <= today || !inPeriod(t.date) || !availableIds.has(t.accountId) || matchedIds.has(t.id)) continue;
    const effect = resultEffect(t);
    if (effect === 'income') incomes.push({ date: t.date, label: t.description || 'Receita agendada', amount: t.amount, source: 'scheduled' });
    else if (effect === 'expense') outflows.push({ date: t.date, label: t.description || 'Despesa agendada', amount: -t.amount, source: 'scheduled' });
  }

  for (const card of accounts.filter((a) => a.type === 'credit_card' && !a.archived)) {
    const invoices = openInvoices(card, live);
    if (invoices === null) {
      if ((balances.get(card.id) ?? 0) < 0) {
        limitations.push(`${card.name}: sem dias de fechamento e vencimento cadastrados, a fatura não entrou no cálculo.`);
      }
      continue;
    }
    for (const inv of invoices) {
      if (inv.dueDate < today || !inPeriod(inv.dueDate)) {
        if (inv.dueDate < today) limitations.push(`${card.name}: fatura vencida em ${formatDateBR(inv.dueDate)} sem pagamento registrado (${formatCents(inv.amount)}), fora do cálculo.`);
        continue;
      }
      // Purchases made until it closes still join this invoice; they are part of the variable estimate.
      outflows.push({ date: inv.dueDate, label: `Fatura ${card.name}`, amount: -inv.amount, source: 'invoice' });
    }
  }

  const overdueCount = outflows.filter((e) => e.overdue).length;
  if (overdueCount > 0) {
    limitations.push(`${overdueCount} conta(s) prevista(s) para antes de hoje sem lançamento correspondente: entram como se ainda fossem ser pagas.`);
  }

  incomes.sort((a, b) => a.date.localeCompare(b.date));
  outflows.sort((a, b) => a.date.localeCompare(b.date));
  // Today's spending is already in the balance: the estimate starts tomorrow.
  const days = daysInclusive(addDaysToDateKey(today, 1), to);
  const variable = typical.daily !== null ? { amount: typical.daily * days, daily: typical.daily, days, months: typical.months.map(monthShort) } : null;
  if (!variable) {
    limitations.push('Ainda não há um mês completo de lançamentos para estimar os gastos variáveis; a margem não os inclui.');
  } else if (typical.months.length < 3) {
    limitations.push(`Gastos variáveis estimados com só ${typical.months.length} mês(es) de histórico.`);
  }
  if (typical.oneOffs.length > 0) {
    limitations.push(`${typical.oneOffs.length} gasto(s) pontual(is) grande(s) ficaram fora da média, como ${typical.oneOffs[0].description || 'um gasto'} (${formatCents(typical.oneOffs[0].amount)}).`);
  }

  const totalIn = incomes.reduce((s, e) => s + e.amount, 0);
  const totalOut = outflows.reduce((s, e) => s - e.amount, 0);
  const margin = available + totalIn - totalOut - (variable?.amount ?? 0);

  // Day by day: events on their date, variable spending spread evenly.
  const series: { date: DateKey; balance: Cents }[] = [];
  let balance = available;
  let lowest = { amount: available, date: today };
  const events = [...incomes, ...outflows];
  const periodDays = daysInclusive(today, to);
  for (let i = 0; i < periodDays; i++) {
    const date = addDaysToDateKey(today, i);
    balance += events.filter((e) => e.date === date).reduce((s, e) => s + e.amount, 0);
    if (i > 0) balance -= variable?.daily ?? 0;
    series.push({ date, balance });
    if (balance < lowest.amount) lowest = { amount: balance, date };
  }

  const steps: CashProjection['steps'] = [
    { label: reserved > 0 ? 'Saldo disponível hoje, sem as reservas' : 'Saldo disponível hoje', cents: available, op: '+' },
    ...(totalIn > 0 ? [{ label: `Receitas confirmadas até ${formatDateBR(to)}`, cents: totalIn, op: '+' as const }] : []),
    ...(totalOut > 0 ? [{ label: 'Contas previstas e faturas', cents: totalOut, op: '−' as const }] : []),
    ...(variable ? [{ label: `Gastos variáveis estimados (${variable.days} dias × ${formatCents(variable.daily)})`, cents: variable.amount, op: '−' as const }] : []),
    { label: nextIncome ? 'Margem até o próximo recebimento' : 'Margem até o fim do mês', cents: margin, op: '=' },
  ];
  const basis = [
    `Saldo de ${availableAccounts.map((a) => a.name).join(', ') || 'nenhuma conta'} (investimentos e cartões não entram como disponíveis)`,
    'contas previstas ainda não pagas e faturas que vencem no período',
    variable ? `gasto variável típico de ${variable.months.join(', ')} (mediana, sem contas fixas, parcelas e gastos pontuais grandes)` : null,
  ]
    .filter(Boolean)
    .join('; ') + '.';

  let status: CashProjection['status'] = 'ok';
  let reason: string | undefined;
  if (availableAccounts.length === 0) {
    status = 'unavailable';
    reason = 'Cadastre uma conta corrente, poupança ou carteira para calcular a margem.';
  } else if (!variable || !nextIncome) {
    status = 'limited';
    reason = !variable
      ? 'Falta um mês completo de lançamentos para estimar os gastos variáveis.'
      : 'Falta cadastrar a próxima receita prevista (por exemplo, o salário).';
  }

  return {
    status,
    reason,
    from: today,
    to,
    nextIncome,
    available,
    availableAccounts: availableAccounts.map((a) => a.name),
    incomes,
    outflows,
    variable,
    margin,
    lowest,
    series,
    steps,
    basis,
    limitations,
    typical,
  };
}

/** Upcoming expected items (bills and incomes) not yet settled, for the "Próximos compromissos" list. */
export function upcoming(projection: CashProjection, limit = 5): ProjectionEvent[] {
  return [...projection.outflows, ...projection.incomes].sort((a, b) => a.date.localeCompare(b.date)).slice(0, limit);
}


/**
 * Available balance at the end of each day from `from` to `today`, rebuilt
 * backwards from today's balances (the realized part of the Resumo chart).
 */
export function availableBalanceHistory(
  accounts: Pick<Account, 'id' | 'type' | 'archived'>[],
  balances: Map<string, Cents>,
  transactions: Pick<Transaction, 'accountId' | 'type' | 'amount' | 'date' | 'deletedAt'>[],
  from: DateKey,
  today: DateKey
): { date: DateKey; balance: Cents }[] {
  const ids = new Set(accounts.filter((a) => balanceGroup(a.type) === 'available' && !a.archived).map((a) => a.id));
  let balance = [...ids].reduce((s, id) => s + (balances.get(id) ?? 0), 0);
  const deltaByDay = new Map<DateKey, Cents>();
  for (const t of transactions) {
    if (t.deletedAt || !ids.has(t.accountId) || t.date <= from || t.date > today) continue;
    const delta = t.type === 'income' || t.type === 'transfer_in' ? t.amount : -t.amount;
    deltaByDay.set(t.date, (deltaByDay.get(t.date) ?? 0) + delta);
  }
  const days = daysInclusive(from, today);
  const out: { date: DateKey; balance: Cents }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = addDaysToDateKey(from, i);
    out.push({ date, balance });
    balance -= deltaByDay.get(date) ?? 0;
  }
  return out.reverse();
}

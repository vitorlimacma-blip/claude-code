import { router } from 'expo-router';
import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { formatDateBR, monthRange } from '../src/domain/dates';
import { allOccurrences, reconcile, suggestRecurrences, type RecurrenceSuggestion } from '../src/domain/recurrence';
import type { Recurrence } from '../src/domain/types';
import { logError, userFacingError } from '../src/platform/errors';
import { notify } from '../src/platform/dialogs';
import { useRepositories } from '../src/state/DataProvider';
import { useQuery } from '../src/state/useQuery';
import { useToday } from '../src/state/useToday';
import { Button, Card, FinancialAmount, IconBubble, MutedText, Section } from '../src/ui/components';
import { CONTENT_MAX_WIDTH } from '../src/ui/layout';
import { EmptyState } from '../src/ui/states';
import { useTheme } from '../src/ui/theme';
import { useToast } from '../src/ui/Toast';
import { SCREEN_PADDING } from '../src/ui/tokens';
import { NEUTRAL_ICON_COLOR } from '../src/ui/transactionPresentation';

type MonthState = { kind: 'settled'; date: string } | { kind: 'due'; date: string } | { kind: 'late'; date: string } | { kind: 'none' };

/** Expected bills and incomes, with this month's situation and suggestions from the history. */
export default function RecurrencesScreen() {
  const theme = useTheme();
  const repos = useRepositories();
  const toast = useToast();
  const today = useToday();
  const { from, to } = monthRange(today.slice(0, 7));

  const { data } = useQuery(
    async (r) => {
      const [recurrences, transactions, accounts, categories] = await Promise.all([
        r.recurrences.list(),
        r.transactions.list({ from: `${Number(today.slice(0, 4)) - 1}${today.slice(4, 7)}-01`, to }),
        r.accounts.list({ includeArchived: true }),
        r.categories.list(),
      ]);
      return { recurrences, transactions, accounts, categories };
    },
    ['recurrences', 'transactions', 'accounts', 'categories'],
    [today]
  );

  const states = useMemo(() => {
    const map = new Map<string, MonthState>();
    if (!data) return map;
    const occurrences = allOccurrences(data.recurrences, from, to);
    const matched = reconcile(occurrences, data.transactions);
    for (const rec of data.recurrences) {
      const occ = occurrences.find((o) => o.recurrence.id === rec.id);
      if (!occ) map.set(rec.id, { kind: 'none' });
      else if (matched.has(occ)) map.set(rec.id, { kind: 'settled', date: matched.get(occ)!.date });
      else map.set(rec.id, { kind: occ.date < today ? 'late' : 'due', date: occ.date });
    }
    return map;
  }, [data, from, to, today]);

  const suggestions = useMemo(() => (data ? suggestRecurrences(data.transactions, data.recurrences, today) : []), [data, today]);
  if (!data) return null;
  const accountName = new Map(data.accounts.map((a) => [a.id, a.name]));
  const category = new Map(data.categories.map((c) => [c.id, c]));

  async function addSuggestion(s: RecurrenceSuggestion) {
    try {
      const rec = await repos.recurrences.create({ ...s, frequency: 'monthly', startDate: from });
      toast({ message: `“${rec.description}” adicionada`, tone: 'success', action: { label: 'Desfazer', onPress: () => void repos.recurrences.remove(rec.id) } });
    } catch (err) {
      logError('recurrences.suggest', err);
      notify('Não foi possível adicionar', userFacingError(err, 'Tente de novo.'));
    }
  }

  function stateText(state: MonthState | undefined, rec: Recurrence): { text: string; tone: 'muted' | 'ok' | 'attention' } {
    const verb = rec.kind === 'income' ? 'Recebida' : 'Paga';
    switch (state?.kind) {
      case 'settled':
        return { text: `${verb} em ${formatDateBR(state.date)}`, tone: 'ok' };
      case 'due':
        return { text: `Prevista para ${formatDateBR(state.date)}`, tone: 'muted' };
      case 'late':
        return { text: `Venceu em ${formatDateBR(state.date)}, sem lançamento`, tone: 'attention' };
      default:
        return { text: 'Não vence este mês', tone: 'muted' };
    }
  }

  function Row({ rec }: { rec: Recurrence }) {
    const state = states.get(rec.id);
    const { text, tone } = stateText(state, rec);
    const cat = rec.categoryId ? category.get(rec.categoryId) : undefined;
    const open = state?.kind === 'due' || state?.kind === 'late';
    return (
      <View style={styles.row}>
        <IconBubble icon={cat?.icon ?? (rec.kind === 'income' ? 'briefcase-outline' : 'receipt-outline')} color={cat?.color ?? NEUTRAL_ICON_COLOR} size={40} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[theme.type.bodyStrong, { color: theme.colors.textPrimary }]}>{rec.description}</Text>
          <Text style={[theme.type.label, { color: theme.colors.textSecondary }]}>
            {rec.frequency === 'yearly' ? `Todo ano, dia ${rec.dayOfMonth}/${String(rec.monthOfYear).padStart(2, '0')}` : `Todo dia ${rec.dayOfMonth}`} ·{' '}
            {accountName.get(rec.accountId) ?? 'Conta removida'}
          </Text>
          <Text style={[theme.type.label, { color: tone === 'attention' ? theme.colors.warning : tone === 'ok' ? theme.colors.success : theme.colors.textSecondary }]}>
            {tone === 'ok' ? '✓ ' : ''}
            {text}
          </Text>
          <View style={styles.actions}>
            {open && (
              <Button
                label={rec.kind === 'income' ? 'Registrar recebimento' : 'Registrar pagamento'}
                variant="secondary"
                onPress={() => router.push({ pathname: '/transaction/[id]', params: { id: 'new', recurrence: rec.id, due: state.date } })}
              />
            )}
            <Button label="Editar" variant="ghost" onPress={() => router.push({ pathname: '/recurrence/[id]', params: { id: rec.id } })} />
          </View>
        </View>
        <FinancialAmount cents={rec.amount} tone={rec.kind === 'income' ? 'positive' : 'negative'} />
      </View>
    );
  }

  const incomes = data.recurrences.filter((r) => r.kind === 'income');
  const bills = data.recurrences.filter((r) => r.kind === 'expense');

  return (
    <ScrollView style={{ backgroundColor: theme.colors.background }} contentContainerStyle={styles.content}>
      <MutedText>
        O que você sabe que vai entrar e sair todo mês. O app usa estas contas para calcular a margem até o próximo recebimento e
        reconhece sozinho quando um lançamento já pagou uma delas, para não contar duas vezes.
      </MutedText>
      <Button label="Nova conta ou receita prevista" icon="add" onPress={() => router.push({ pathname: '/recurrence/[id]', params: { id: 'new' } })} />

      {data.recurrences.length === 0 && suggestions.length === 0 && (
        <EmptyState
          icon="calendar-outline"
          title="Nenhuma conta prevista ainda"
          message="Cadastre o salário e as contas fixas (aluguel, energia, internet). Com elas o Resumo mostra quanto sobra até o próximo recebimento."
        />
      )}

      {incomes.length > 0 && (
        <Section title="Receitas previstas">
          <Card style={{ gap: 8 }}>{incomes.map((r) => <Row key={r.id} rec={r} />)}</Card>
        </Section>
      )}
      {bills.length > 0 && (
        <Section title="Contas a pagar">
          <Card style={{ gap: 8 }}>{bills.map((r) => <Row key={r.id} rec={r} />)}</Card>
        </Section>
      )}

      {suggestions.length > 0 && (
        <Section title="Encontradas no seu histórico">
          <MutedText>Aparecem quase todo mês, com valor e dia parecidos. Adicione as que forem mesmo fixas.</MutedText>
          <Card style={{ gap: 8 }}>
            {suggestions.map((s) => (
              <View key={`${s.kind}-${s.description}`} style={styles.row}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[theme.type.bodyStrong, { color: theme.colors.textPrimary }]}>{s.description}</Text>
                  <Text style={[theme.type.label, { color: theme.colors.textSecondary }]}>
                    {s.kind === 'income' ? 'Receita' : 'Conta'} · por volta do dia {s.dayOfMonth} · em {s.months} dos últimos 4 meses
                  </Text>
                  <View style={styles.actions}>
                    <Button label="Adicionar" icon="add" variant="secondary" onPress={() => addSuggestion(s)} />
                  </View>
                </View>
                <FinancialAmount cents={s.amount} tone={s.kind === 'income' ? 'positive' : 'negative'} />
              </View>
            ))}
          </Card>
        </Section>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: SCREEN_PADDING, gap: 14, paddingBottom: 64, width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 8 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
});

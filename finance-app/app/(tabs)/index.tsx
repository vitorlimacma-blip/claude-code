import { Link, router } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { formatMonthBR, startOfYearKey, fromDateKey } from '../../src/domain/dates';
import { ACCOUNT_TYPE_ICONS } from '../../src/domain/labels';
import { findInstitution } from '../../src/domain/institutions';
import { formatCents } from '../../src/domain/money';
import { summarizeBalances } from '../../src/domain/ledger';
import { buildMonthOverview } from '../../src/domain/overview';
import { useQuery } from '../../src/state/useQuery';
import { useToday } from '../../src/state/useToday';
import {
  AlertBadge,
  Button,
  Card,
  IconBubble,
  MutedText,
  Screen,
  SectionTitle,
  SummaryCard,
  Title,
} from '../../src/ui/components';
import { useTheme } from '../../src/ui/theme';

export default function DashboardScreen() {
  const theme = useTheme();
  const today = useToday();
  const month = today.slice(0, 7);

  const { data } = useQuery(
    async (r) => {
      const [categories, budgets, transactions, accounts, balances] = await Promise.all([
        r.categories.list(),
        r.budgets.amountsForMonth(month),
        r.transactions.list({ from: startOfYearKey(fromDateKey(today)), to: today }),
        r.accounts.list(),
        r.accounts.balances(today),
      ]);
      return { categories, budgets, transactions, accounts, balances };
    },
    ['categories', 'budgets', 'transactions', 'accounts'],
    [today, month]
  );

  const overview = useMemo(() => (data ? buildMonthOverview({ ...data, today }) : null), [data, today]);
  if (!data || !overview) return <Screen>{null}</Screen>;

  const threats = overview.alerts.filter((a) => a.level !== 'ok');
  // Same number as before (cards count as debt, limits never count); the split view comes in Fase 4.
  const total = summarizeBalances(data.accounts, data.balances).netWorth;

  return (
    <Screen>
      <Title>Resumo</Title>
      <MutedText>{formatMonthBR(month)}</MutedText>

      <View style={styles.row}>
        <SummaryCard label="Gastos no mês" value={formatCents(overview.spent)} tone="negative" />
        <SummaryCard label="Receitas no mês" value={formatCents(overview.income)} tone="positive" />
      </View>
      <View style={styles.row}>
        <SummaryCard
          label="Resultado do mês"
          value={formatCents(overview.balance)}
          tone={overview.balance >= 0 ? 'positive' : 'negative'}
        />
        <SummaryCard label="Saldo nas contas" value={formatCents(total)} tone={total >= 0 ? 'default' : 'negative'} />
      </View>

      {overview.uncategorizedCount > 0 && (
        <Link href="/transactions">
          <MutedText>
            {overview.uncategorizedCount} lançamento(s) deste mês sem categoria. Toque para revisar.
          </MutedText>
        </Link>
      )}

      <SectionTitle>Contas</SectionTitle>
      <Card style={{ gap: 12 }}>
        {data.accounts.map((account) => {
          const balance = data.balances.get(account.id) ?? 0;
          return (
            <View key={account.id} style={styles.accountRow}>
              <IconBubble
icon={ACCOUNT_TYPE_ICONS[account.type]} color={account.color}
              />
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowTitle, { color: theme.colors.text }]}>{account.name}</Text>
                {findInstitution(account.institution) && (
                  <MutedText>{findInstitution(account.institution)?.name}</MutedText>
                )}
              </View>
              <Text style={[styles.amount, { color: balance < 0 ? theme.colors.negative : theme.colors.text }]}>
                {formatCents(balance)}
              </Text>
            </View>
          );
        })}
      </Card>

      <SectionTitle>Ameaças ao orçamento</SectionTitle>
      {threats.length === 0 && (
        <MutedText>
          {overview.alerts.length === 0
            ? 'Defina orçamentos mensais na aba Categorias para acompanhar aqui.'
            : 'Tudo sob controle por enquanto.'}
        </MutedText>
      )}
      {threats.map((alert) => (
        <Card key={alert.categoryId} style={{ gap: 6 }}>
          <View style={styles.alertHeader}>
            <Text style={[styles.rowTitle, { color: theme.colors.text }]}>{alert.categoryName}</Text>
            <AlertBadge level={alert.level} />
          </View>
          <MutedText>
            Gasto até hoje: {formatCents(alert.spentSoFar)} de {formatCents(alert.budget)}
          </MutedText>
          <MutedText>Projeção para o fim do mês: {formatCents(alert.projectedMonthTotal)}</MutedText>
        </Card>
      ))}

      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Button label="Perguntar à IA" icon="sparkles-outline" variant="secondary" onPress={() => router.push('/assistant')} />
        </View>
        <View style={{ flex: 1 }}>
          <Button label="Ver previsões" icon="trending-up-outline" variant="secondary" onPress={() => router.push('/forecasts')} />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12 },
  accountRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  alertHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  rowTitle: { fontSize: 15, fontWeight: '600' },
  amount: { fontSize: 15, fontWeight: '700' },
});

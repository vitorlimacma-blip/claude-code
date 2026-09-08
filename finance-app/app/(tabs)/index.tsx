import { useMemo } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { AlertBadge } from '../../src/components/AlertBadge';
import { SummaryCard } from '../../src/components/SummaryCard';
import { transactionsInRange, sumCents } from '../../src/domain/forecast';
import { useFinance } from '../../src/state/FinanceContext';
import { formatCents } from '../../src/utils/currency';
import { startOfMonthKey, toDateKey } from '../../src/utils/date';

export default function DashboardScreen() {
  const { loading, transactions, alerts, refresh } = useFinance();

  const now = useMemo(() => new Date(), []);
  const monthKey = startOfMonthKey(now);
  const todayKey = toDateKey(now);

  const monthTransactions = useMemo(
    () => transactionsInRange(transactions, monthKey, todayKey),
    [transactions, monthKey, todayKey]
  );

  const spent = sumCents(monthTransactions.filter((t) => t.type === 'expense'));
  const income = sumCents(monthTransactions.filter((t) => t.type === 'income'));
  const balance = income - spent;

  const threats = alerts.filter((a) => a.level !== 'ok');

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} />}
      data={threats}
      keyExtractor={(item) => item.categoryId}
      ListHeaderComponent={
        <View style={styles.header}>
          <Text style={styles.title}>Resumo do mês</Text>
          <View style={styles.summaryRow}>
            <SummaryCard label="Gasto no mês" value={formatCents(spent)} tone="negative" />
            <SummaryCard label="Receita no mês" value={formatCents(income)} tone="positive" />
          </View>
          <View style={styles.summaryRow}>
            <SummaryCard label="Saldo do mês" value={formatCents(balance)} tone={balance >= 0 ? 'positive' : 'negative'} />
          </View>
          <Text style={styles.sectionTitle}>Ameaças ao orçamento</Text>
          {threats.length === 0 && (
            <Text style={styles.emptyText}>
              Nenhuma categoria em alerta. Configure orçamentos mensais na aba Categorias para acompanhar aqui.
            </Text>
          )}
        </View>
      }
      renderItem={({ item }) => (
        <View style={styles.alertCard}>
          <View style={styles.alertHeader}>
            <Text style={styles.alertCategory}>{item.categoryName}</Text>
            <AlertBadge level={item.level} />
          </View>
          <Text style={styles.alertLine}>
            Gasto até hoje: {formatCents(item.spentSoFar)} de {formatCents(item.budget)}
          </Text>
          <Text style={styles.alertLine}>Projeção para o fim do mês: {formatCents(item.projectedMonthTotal)}</Text>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f3f4f6',
  },
  content: {
    padding: 16,
    gap: 12,
  },
  header: {
    gap: 12,
    marginBottom: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginTop: 8,
  },
  emptyText: {
    color: '#6b7280',
  },
  alertCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    gap: 6,
    marginBottom: 10,
  },
  alertHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  alertCategory: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  alertLine: {
    color: '#374151',
    fontSize: 13,
  },
});

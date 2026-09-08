import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useFinance } from '../../src/state/FinanceContext';
import { formatCents } from '../../src/utils/currency';

export default function ForecastsScreen() {
  const { forecasts, categories } = useFinance();

  const totalProjectedMonth = forecasts.reduce((sum, f) => sum + f.projectedMonthTotal, 0);
  const totalProjectedYear = forecasts.reduce((sum, f) => sum + f.projectedYearTotal, 0);

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={styles.list}
      data={forecasts}
      keyExtractor={(item) => item.categoryId}
      ListHeaderComponent={
        <View style={styles.header}>
          <Text style={styles.title}>Previsões de despesas</Text>
          <Text style={styles.subtitle}>
            Baseadas no ritmo de gastos observado em cada categoria (projeção linear a partir do valor já gasto).
          </Text>
          <View style={styles.totalsRow}>
            <View style={styles.totalCard}>
              <Text style={styles.totalLabel}>Total projetado no mês</Text>
              <Text style={styles.totalValue}>{formatCents(totalProjectedMonth)}</Text>
            </View>
            <View style={styles.totalCard}>
              <Text style={styles.totalLabel}>Total projetado no ano</Text>
              <Text style={styles.totalValue}>{formatCents(totalProjectedYear)}</Text>
            </View>
          </View>
          {categories.length === 0 && (
            <Text style={styles.emptyText}>Cadastre categorias e lançamentos para ver as previsões aqui.</Text>
          )}
        </View>
      }
      renderItem={({ item }) => {
        const category = categories.find((c) => c.id === item.categoryId);
        return (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={[styles.swatch, { backgroundColor: category?.color ?? '#9ca3af' }]} />
              <Text style={styles.cardTitle}>{item.categoryName}</Text>
            </View>
            <View style={styles.metricsRow}>
              <Metric label="Média diária" value={formatCents(item.dailyAverage)} />
              <Metric label="Previsão mensal" value={formatCents(item.projectedMonthTotal)} />
              <Metric label="Previsão anual" value={formatCents(item.projectedYearTotal)} />
            </View>
          </View>
        );
      }}
    />
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  list: { padding: 16, gap: 10 },
  header: { gap: 8, marginBottom: 8 },
  title: { fontSize: 24, fontWeight: '700', color: '#111827' },
  subtitle: { fontSize: 13, color: '#6b7280' },
  totalsRow: { flexDirection: 'row', gap: 12, marginTop: 8 },
  totalCard: {
    flex: 1,
    backgroundColor: '#111827',
    borderRadius: 12,
    padding: 14,
    gap: 4,
  },
  totalLabel: { color: '#d1d5db', fontSize: 12 },
  totalValue: { color: '#fff', fontSize: 18, fontWeight: '700' },
  emptyText: { color: '#6b7280', marginTop: 8 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    gap: 10,
    marginBottom: 10,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  swatch: { width: 10, height: 10, borderRadius: 5 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#111827' },
  metricsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  metric: { gap: 2 },
  metricLabel: { fontSize: 11, color: '#6b7280' },
  metricValue: { fontSize: 14, fontWeight: '700', color: '#111827' },
});

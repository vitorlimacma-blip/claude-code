import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { fromDateKey, startOfYearKey } from '../src/domain/dates';
import { formatCents } from '../src/domain/money';
import { buildMonthOverview } from '../src/domain/overview';
import { useQuery } from '../src/state/useQuery';
import { useToday } from '../src/state/useToday';
import { Card, MutedText, Screen } from '../src/ui/components';
import { useTheme } from '../src/ui/theme';

export default function ForecastsScreen() {
  const theme = useTheme();
  const today = useToday();

  const { data } = useQuery(
    async (r) => {
      const [categories, transactions] = await Promise.all([
        r.categories.list({ kind: 'expense' }),
        r.transactions.list({ from: startOfYearKey(fromDateKey(today)), to: today }),
      ]);
      return { categories, transactions };
    },
    ['categories', 'transactions'],
    [today]
  );

  const forecasts = useMemo(
    () => (data ? buildMonthOverview({ ...data, budgets: new Map(), today }).forecasts : []),
    [data, today]
  );
  const colorById = useMemo(() => new Map(data?.categories.map((c) => [c.id, c.color])), [data]);
  const totalMonth = forecasts.reduce((sum, f) => sum + f.projectedMonthTotal, 0);
  const totalYear = forecasts.reduce((sum, f) => sum + f.projectedYearTotal, 0);

  return (
    <Screen>
      <MutedText>
        Projeção linear: supõe que o ritmo de gastos observado até hoje continua até o fim do período. Na Etapa 6, a IA
        passa a considerar despesas recorrentes e faturas.
      </MutedText>

      <View style={styles.totalsRow}>
        <View style={[styles.totalCard, { backgroundColor: theme.colors.textPrimary }]}>
          <Text style={[styles.totalLabel, { color: theme.colors.background }]}>Projetado no mês</Text>
          <Text style={[styles.totalValue, { color: theme.colors.background }]}>{formatCents(totalMonth)}</Text>
        </View>
        <View style={[styles.totalCard, { backgroundColor: theme.colors.textPrimary }]}>
          <Text style={[styles.totalLabel, { color: theme.colors.background }]}>Projetado no ano</Text>
          <Text style={[styles.totalValue, { color: theme.colors.background }]}>{formatCents(totalYear)}</Text>
        </View>
      </View>

      {data && forecasts.length === 0 && <MutedText>Registre despesas para ver as previsões por categoria.</MutedText>}

      {forecasts.map((f) => (
        <Card key={f.categoryId} style={{ gap: 10 }}>
          <View style={styles.cardHeader}>
            <View style={[styles.swatch, { backgroundColor: colorById.get(f.categoryId) ?? theme.colors.textSecondary }]} />
            <Text style={[styles.cardTitle, { color: theme.colors.textPrimary }]}>{f.categoryName}</Text>
          </View>
          <View style={styles.metricsRow}>
            <Metric label="Média diária" value={formatCents(f.dailyAverage)} />
            <Metric label="Previsão do mês" value={formatCents(f.projectedMonthTotal)} />
            <Metric label="Previsão do ano" value={formatCents(f.projectedYearTotal)} />
          </View>
        </Card>
      ))}
    </Screen>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <View style={{ gap: 2 }}>
      <Text style={{ fontSize: 11, color: theme.colors.textSecondary }}>{label}</Text>
      <Text style={{ fontSize: 14, fontWeight: '700', color: theme.colors.textPrimary }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  totalsRow: { flexDirection: 'row', gap: 12, marginTop: 4 },
  totalCard: { flex: 1, borderRadius: 12, padding: 14, gap: 4 },
  totalLabel: { fontSize: 12, opacity: 0.8 },
  totalValue: { fontSize: 18, fontWeight: '700' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  swatch: { width: 10, height: 10, borderRadius: 5 },
  cardTitle: { fontSize: 15, fontWeight: '700' },
  metricsRow: { flexDirection: 'row', justifyContent: 'space-between' },
});

import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { formatMonthBR } from '../src/domain/dates';
import { formatCents } from '../src/domain/money';
import { useFinancialPicture } from '../src/state/useFinancialPicture';
import { Card, FinancialAmount, IconBubble, MutedText } from '../src/ui/components';
import { CONTENT_MAX_WIDTH } from '../src/ui/layout';
import { EmptyState, SkeletonRows } from '../src/ui/states';
import { useTheme } from '../src/ui/theme';
import { SCREEN_PADDING } from '../src/ui/tokens';

/**
 * Previsões por categoria: what was spent this month, what a typical month
 * costs, and the month projection, by the same rule as the budgets.
 */
export default function ForecastsScreen() {
  const theme = useTheme();
  const picture = useFinancialPicture();
  if (!picture) return <View style={{ padding: SCREEN_PADDING }}><SkeletonRows count={5} /></View>;
  const { categoryMonth, categories, projection } = picture;
  const byId = new Map(categories.map((c) => [c.id, c]));
  const months = projection.typical.months;
  const total = categoryMonth.reduce((s, p) => s + p.projected, 0);
  const noHistory = projection.typical.monthly === null;

  return (
    <ScrollView style={{ backgroundColor: theme.colors.background }} contentContainerStyle={styles.content}>
      <MutedText>
        Previsão de {formatMonthBR(picture.month)} = gasto até hoje + contas previstas que ainda vão vencer + o que um mês típico
        ainda somaria. O mês típico é a mediana de {months.length > 0 ? months.map(formatMonthBR).join(', ') : 'meses completos'}, sem contas
        fixas, parcelas e gastos pontuais grandes. O ritmo dos primeiros dias não é esticado até o fim do mês.
      </MutedText>
      {noHistory && (
        <Card>
          <Text style={[theme.type.body, { color: theme.colors.textPrimary }]}>
            Ainda não há um mês completo de lançamentos: a previsão mostra só o que já foi gasto e as contas previstas, sem estimar o
            resto do mês.
          </Text>
        </Card>
      )}
      {categoryMonth.length === 0 ? (
        <EmptyState icon="trending-up-outline" title="Nada para prever ainda" message="Quando houver gastos registrados, cada categoria aparece aqui com a previsão do mês." />
      ) : (
        <>
          <Card elevated style={{ gap: 4 }}>
            <Text style={[theme.type.label, { color: theme.colors.textSecondary }]}>Previsão de gastos de {formatMonthBR(picture.month)}</Text>
            <FinancialAmount cents={total} size="display" />
          </Card>
          {categoryMonth.map((p) => {
            const c = byId.get(p.categoryId);
            return (
              <Card key={p.categoryId} style={{ gap: 10 }}>
                <View style={styles.header}>
                  <IconBubble icon={c?.icon ?? 'pricetag-outline'} color={c?.color ?? '#64748B'} />
                  <Text style={[theme.type.bodyStrong, { flex: 1, color: theme.colors.textPrimary }]}>{p.categoryName}</Text>
                  <FinancialAmount cents={p.projected} />
                </View>
                <View style={styles.cols}>
                  <Col label="Até hoje" value={formatCents(p.spent)} />
                  <Col label="Contas a vencer" value={formatCents(p.committed)} />
                  <Col label="Mês típico" value={p.typicalMonth === null ? 'sem histórico' : formatCents(p.typicalMonth)} />
                </View>
              </Card>
            );
          })}
        </>
      )}
    </ScrollView>
  );
}

function Col({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <View style={{ flex: 1, minWidth: 96 }}>
      <Text style={[theme.type.label, { color: theme.colors.textSecondary }]}>{label}</Text>
      <Text style={[theme.type.amount, { fontSize: 15, color: theme.colors.textPrimary }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: SCREEN_PADDING, gap: 12, paddingBottom: 64, width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cols: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
});

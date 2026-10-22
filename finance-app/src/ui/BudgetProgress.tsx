import { StyleSheet, Text, View } from 'react-native';
import { formatCents } from '../domain/money';
import type { Cents } from '../domain/types';
import { useTheme } from './theme';

export interface BudgetProgressState {
  /** 0..1 share of the bar filled by what was spent. */
  fill: number;
  /** 0..1 position of the projection marker, or null when there is no projection. */
  marker: number | null;
  over: boolean;
  /** Line under the bar: what is left (or how much over), and the projection. */
  detail: string;
  /** Everything in words, for screen readers. */
  summary: string;
}

/** Pure part of `BudgetProgress`, so the wording and the math are tested without rendering. */
export function budgetProgressState(spent: Cents, budget: Cents, projected?: Cents | null): BudgetProgressState {
  if (budget <= 0) {
    const detail = 'Sem orçamento definido';
    return { fill: 0, marker: null, over: false, detail, summary: `${formatCents(spent)} gastos. ${detail}` };
  }
  const over = spent > budget;
  const remaining = budget - spent;
  const parts = [over ? `${formatCents(-remaining)} acima do orçamento` : `Restam ${formatCents(remaining)}`];
  if (projected != null) parts.push(`projeção ${formatCents(projected)}`);
  const detail = parts.join(' · ');
  return {
    fill: Math.min(1, Math.max(0, spent / budget)),
    marker: projected != null ? Math.min(1, Math.max(0, projected / budget)) : null,
    over,
    detail,
    summary: `${formatCents(spent)} de ${formatCents(budget)}. ${detail}`,
  };
}

/**
 * Spending against a budget, in a neutral tone (§13): the bar says how much
 * was used, the text says it in words; going over is stated, not dramatized.
 */
export function BudgetProgress({
  label,
  spent,
  budget,
  projected,
}: {
  label: string;
  spent: Cents;
  budget: Cents;
  projected?: Cents | null;
}) {
  const theme = useTheme();
  const state = budgetProgressState(spent, budget, projected);
  const fillColor = state.over ? theme.colors.warning : theme.colors.primary;
  return (
    <View
      style={{ gap: 6 }}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: Math.max(budget, 1), now: Math.min(spent, Math.max(budget, 1)), text: state.summary }}
    >
      <View style={styles.header}>
        <Text style={[theme.type.bodyStrong, styles.label, { color: theme.colors.textPrimary }]}>{label}</Text>
        <Text style={[theme.type.amount, { fontSize: 14, color: theme.colors.textPrimary }]}>
          {formatCents(spent)}
          <Text style={{ color: theme.colors.textSecondary }}> de {formatCents(budget)}</Text>
        </Text>
      </View>
      <View style={[styles.track, { backgroundColor: theme.colors.primarySoft }]}>
        <View style={[styles.fill, { width: `${state.fill * 100}%`, backgroundColor: fillColor }]} />
        {state.marker !== null && (
          <View style={[styles.marker, { left: `${state.marker * 100}%`, backgroundColor: theme.colors.textPrimary }]} />
        )}
      </View>
      <Text style={[theme.type.label, { color: state.over ? theme.colors.warning : theme.colors.textSecondary }]}>
        {state.detail}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 },
  label: { flexShrink: 1 },
  track: { height: 10, borderRadius: 999, overflow: 'visible', justifyContent: 'center' },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 999 },
  marker: { position: 'absolute', width: 3, height: 18, borderRadius: 2, marginLeft: -1.5 },
});

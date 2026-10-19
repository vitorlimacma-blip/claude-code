import { Pressable, StyleSheet, Text, View } from 'react-native';
import { spokenAmount } from '../domain/money';
import type { Cents } from '../domain/types';
import { FinancialAmount, IconBubble } from './components';
import { useTheme } from './theme';
import { ROW_MIN_HEIGHT } from './tokens';

export interface TransactionRowProps {
  title: string;
  /** Second line: category, account, payment method... */
  subtitle?: string;
  /** Always positive; `direction` gives the sign. */
  amount: Cents;
  direction: 'in' | 'out';
  /**
   * False for rows that don't count as income or spending (transfers, card
   * payments, investment moves): the amount is shown in the secondary color
   * and the badge says why.
   */
  counts?: boolean;
  /** Short tag such as "Transferência", "Estorno" or "Parcela 2/3". */
  badge?: string;
  pending?: boolean;
  icon: string;
  color: string;
  onPress?: () => void;
}

/** One transaction in a list: at least 64 tall, growing with larger text (§5). */
export function TransactionRow({
  title,
  subtitle,
  amount,
  direction,
  counts = true,
  badge,
  pending,
  icon,
  color,
  onPress,
}: TransactionRowProps) {
  const theme = useTheme();
  const signed = direction === 'in' ? amount : -amount;
  const label = [title, subtitle, badge, spokenAmount(signed), pending ? 'pendente' : null].filter(Boolean).join(', ');
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.row,
        { borderRadius: theme.radius.md, backgroundColor: pressed ? theme.colors.pressed : 'transparent' },
      ]}
    >
      <IconBubble icon={icon} color={color} size={40} />
      <View style={styles.texts}>
        <Text style={[theme.type.bodyStrong, { color: theme.colors.textPrimary }]} numberOfLines={2}>
          {title}
        </Text>
        {(subtitle || badge || pending) && (
          <View style={styles.meta}>
            {badge && (
              <View style={[styles.badge, { backgroundColor: theme.colors.surfaceMuted, borderRadius: theme.radius.sm }]}>
                <Text style={[theme.type.caption, { color: theme.colors.textSecondary, fontSize: 13 }]}>{badge}</Text>
              </View>
            )}
            {pending && (
              <View style={[styles.badge, { backgroundColor: theme.colors.warningSurface, borderRadius: theme.radius.sm }]}>
                <Text style={[theme.type.caption, { color: theme.colors.warning, fontSize: 13 }]}>Pendente</Text>
              </View>
            )}
            {subtitle && <Text style={[theme.type.label, styles.subtitle, { color: theme.colors.textSecondary }]}>{subtitle}</Text>}
          </View>
        )}
      </View>
      <FinancialAmount cents={amount} tone={direction === 'in' ? 'positive' : 'negative'} muted={!counts} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: ROW_MIN_HEIGHT, paddingVertical: 10, paddingHorizontal: 8 },
  texts: { flex: 1, gap: 2 },
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  badge: { paddingHorizontal: 6, paddingVertical: 1 },
  subtitle: { flexShrink: 1 },
});

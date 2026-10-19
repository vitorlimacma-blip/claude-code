import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';
import { formatSignedCents } from '../domain/money';
import type { Cents } from '../domain/types';
import { Card, FinancialAmount } from './components';
import { Icon, type IconName } from './icons';
import { useTheme } from './theme';
import { motion, TOUCH_TARGET } from './tokens';

/**
 * A contextual observation (§11): what was noticed, on what basis, and a way
 * to check it. The icon describes the subject, never a robot.
 */
export function InsightCard({
  title,
  body,
  basis,
  icon = 'bulb-outline',
  tone = 'neutral',
  action,
}: {
  title: string;
  body: string;
  /** Where it comes from, e.g. "Base: 12 lançamentos de outubro". */
  basis?: string;
  icon?: IconName;
  tone?: 'neutral' | 'attention';
  action?: { label: string; onPress: () => void };
}) {
  const theme = useTheme();
  const accent = tone === 'attention' ? theme.colors.warning : theme.colors.primary;
  const soft = tone === 'attention' ? theme.colors.warningSurface : theme.colors.primarySoft;
  return (
    <Card style={{ gap: 10 }}>
      <View style={styles.header}>
        <View style={[styles.iconWell, { backgroundColor: soft }]}>
          <Icon name={icon} size={20} color={accent} />
        </View>
        <Text style={[theme.type.bodyStrong, styles.flex, { color: theme.colors.textPrimary }]}>{title}</Text>
      </View>
      <Text style={[theme.type.body, { color: theme.colors.textPrimary }]}>{body}</Text>
      {basis && <Text style={[theme.type.label, { color: theme.colors.textSecondary }]}>{basis}</Text>}
      {action && (
        <Pressable accessibilityRole="button" onPress={action.onPress} hitSlop={8} style={styles.link}>
          <Text style={[theme.type.bodyStrong, { color: theme.colors.primary }]}>{action.label}</Text>
          <Icon name="chevron-forward" size={18} color={theme.colors.primary} />
        </Pressable>
      )}
    </Card>
  );
}

export interface CalculationStep {
  label: string;
  cents: Cents;
  /** How the step enters the total; `=` marks the result line. */
  op: '+' | '−' | '=';
}

/**
 * A projection with its period, its basis and its calculation ("memória de
 * cálculo", §10). When data is missing, `value` is null and the card says why
 * instead of showing a number. Reanimated animations follow the system's
 * Reduce Motion setting by default.
 */
export function ProjectionCard({
  title,
  period,
  value,
  basis,
  steps = [],
  limitations = [],
  unavailableReason,
}: {
  title: string;
  /** E.g. "1 a 31 de outubro". */
  period: string;
  value: Cents | null;
  basis: string;
  steps?: CalculationStep[];
  limitations?: string[];
  /** Shown when `value` is null. */
  unavailableReason?: string;
}) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const canExplain = value !== null && (steps.length > 0 || limitations.length > 0);
  return (
    <Animated.View layout={LinearTransition.duration(motion.transition)}>
      <Card style={{ gap: 8 }}>
        <Text style={[theme.type.label, { color: theme.colors.textSecondary }]}>
          {title} · {period}
        </Text>
        {value === null ? (
          <View style={{ gap: 4 }}>
            <Text style={[theme.type.sectionTitle, { color: theme.colors.textPrimary }]}>Ainda não dá para estimar</Text>
            {unavailableReason && <Text style={[theme.type.body, { color: theme.colors.textSecondary }]}>{unavailableReason}</Text>}
          </View>
        ) : (
          <FinancialAmount cents={value} size="display" tone="neutral" />
        )}
        <Text style={[theme.type.label, { color: theme.colors.textSecondary }]}>{basis}</Text>
        {canExplain && (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: open }}
            onPress={() => setOpen((v) => !v)}
            style={styles.link}
          >
            <Text style={[theme.type.bodyStrong, { color: theme.colors.primary }]}>
              {open ? 'Ocultar cálculo' : 'Como calculamos'}
            </Text>
            <Icon name={open ? 'chevron-up' : 'chevron-down'} size={18} color={theme.colors.primary} />
          </Pressable>
        )}
        {open && canExplain && (
          <Animated.View entering={FadeIn.duration(motion.transition)} style={{ gap: 6 }}>
            {steps.map((s, i) => (
              <View
                key={i}
                style={[styles.step, s.op === '=' && { borderTopWidth: 1, borderTopColor: theme.colors.border, paddingTop: 6 }]}
              >
                <Text style={[theme.type.label, styles.flex, { color: theme.colors.textPrimary }]}>
                  {s.op === '=' ? '' : `${s.op} `}
                  {s.label}
                </Text>
                <Text style={[theme.type.amount, { fontSize: 14, color: theme.colors.textPrimary }]}>
                  {formatSignedCents(s.cents, 'none')}
                </Text>
              </View>
            ))}
            {limitations.map((l, i) => (
              <Text key={`l${i}`} style={[theme.type.label, { color: theme.colors.textSecondary }]}>
                • {l}
              </Text>
            ))}
          </Animated.View>
        )}
      </Card>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconWell: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: TOUCH_TARGET - 8, alignSelf: 'flex-start' },
  step: { flexDirection: 'row', alignItems: 'baseline', gap: 12 },
});

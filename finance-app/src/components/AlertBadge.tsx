import { StyleSheet, Text, View } from 'react-native';
import type { AlertLevel } from '../domain/types';

const LABELS: Record<AlertLevel, string> = {
  ok: 'Sob controle',
  warning: 'Atenção',
  projected_overrun: 'Ameaça de estouro',
  exceeded: 'Orçamento estourado',
};

const COLORS: Record<AlertLevel, { bg: string; fg: string }> = {
  ok: { bg: '#dcfce7', fg: '#166534' },
  warning: { bg: '#fef9c3', fg: '#854d0e' },
  projected_overrun: { bg: '#ffedd5', fg: '#9a3412' },
  exceeded: { bg: '#fee2e2', fg: '#991b1b' },
};

export function AlertBadge({ level }: { level: AlertLevel }) {
  const { bg, fg } = COLORS[level];
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={[styles.text, { color: fg }]}>{LABELS[level]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: 12,
    fontWeight: '600',
  },
});

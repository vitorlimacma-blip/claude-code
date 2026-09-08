import { StyleSheet, Text, View } from 'react-native';

export function SummaryCard({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'positive' | 'negative' }) {
  return (
    <View style={styles.card}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, tone === 'positive' && styles.positive, tone === 'negative' && styles.negative]}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    gap: 4,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  label: {
    fontSize: 13,
    color: '#6b7280',
  },
  value: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  positive: {
    color: '#166534',
  },
  negative: {
    color: '#991b1b',
  },
});

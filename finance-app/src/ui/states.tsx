import { useEffect } from 'react';
import { StyleSheet, Text, View, type DimensionValue } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { Button } from './components';
import { Icon, type IconName } from './icons';
import { useTheme } from './theme';

/** Two soft waves under the empty-state icon. Purely decorative (hidden from screen readers). */
function Waves({ color }: { color: string }) {
  return (
    <View aria-hidden>
      <Svg width={120} height={24} viewBox="0 0 120 24">
        <Path d="M0 8 C 20 0, 40 16, 60 8 S 100 0, 120 8" stroke={color} strokeWidth={2} fill="none" strokeLinecap="round" opacity={0.6} />
        <Path d="M0 18 C 20 10, 40 26, 60 18 S 100 10, 120 18" stroke={color} strokeWidth={2} fill="none" strokeLinecap="round" opacity={0.3} />
      </Svg>
    </View>
  );
}

/** Nothing to show yet: what will appear here and how to add the first item. */
export function EmptyState({
  icon,
  title,
  message,
  action,
}: {
  icon: IconName;
  title: string;
  message: string;
  action?: { label: string; onPress: () => void; icon?: IconName };
}) {
  const theme = useTheme();
  return (
    <View style={styles.center}>
      <View style={[styles.well, { backgroundColor: theme.colors.primarySoft }]}>
        <Icon name={icon} size={28} color={theme.colors.onPrimarySoft} />
      </View>
      <Waves color={theme.colors.primary} />
      <Text accessibilityRole="header" style={[theme.type.sectionTitle, styles.text, { color: theme.colors.textPrimary }]}>
        {title}
      </Text>
      <Text style={[theme.type.body, styles.text, { color: theme.colors.textSecondary }]}>{message}</Text>
      {action && <Button label={action.label} icon={action.icon} onPress={action.onPress} />}
    </View>
  );
}

/** Something failed: what happened in plain words, that data is safe when it is, and a retry. */
export function ErrorState({
  title,
  message,
  onRetry,
}: {
  title: string;
  message: string;
  onRetry?: () => void;
}) {
  const theme = useTheme();
  return (
    <View style={styles.center} accessibilityRole="alert">
      <View style={[styles.well, { backgroundColor: theme.colors.dangerSurface }]}>
        <Icon name="alert-outline" size={28} color={theme.colors.danger} />
      </View>
      <Text style={[theme.type.sectionTitle, styles.text, { color: theme.colors.textPrimary }]}>{title}</Text>
      <Text style={[theme.type.body, styles.text, { color: theme.colors.textSecondary }]}>{message}</Text>
      {onRetry && <Button label="Tentar de novo" icon="refresh-outline" variant="secondary" onPress={onRetry} />}
    </View>
  );
}

/** Placeholder block while data loads. Pulses gently, or stays still with Reduce Motion. */
export function Skeleton({ width = '100%', height = 16, radius = 8 }: { width?: DimensionValue; height?: number; radius?: number }) {
  const theme = useTheme();
  const reduced = useReducedMotion();
  const opacity = useSharedValue(1);
  useEffect(() => {
    if (!reduced) opacity.set(withRepeat(withTiming(0.45, { duration: 900 }), -1, true));
  }, [opacity, reduced]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  return <Animated.View style={[{ width, height, borderRadius: radius, backgroundColor: theme.colors.surfaceMuted }, style]} />;
}

/** Skeleton of a list of transaction rows, announced once as "Carregando". */
export function SkeletonRows({ count = 4 }: { count?: number }) {
  return (
    <View accessible accessibilityLabel="Carregando" style={{ gap: 16 }}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={styles.skeletonRow}>
          <Skeleton width={40} height={40} radius={20} />
          <View style={{ flex: 1, gap: 6 }}>
            <Skeleton width="70%" height={14} />
            <Skeleton width="45%" height={12} />
          </View>
          <Skeleton width={72} height={14} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', gap: 12, paddingVertical: 32, paddingHorizontal: 16 },
  well: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  text: { textAlign: 'center', maxWidth: 360 },
  skeletonRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});

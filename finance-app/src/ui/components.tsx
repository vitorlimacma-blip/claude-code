import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextStyle,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { AlertLevel } from '../domain/types';
import { CONTENT_MAX_WIDTH } from './layout';
import { useTheme } from './theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];

/**
 * Full-screen container that respects the notch, uses the theme background and,
 * on wide screens, keeps the content in a centered, readable column.
 */
export function Screen({ children, scroll = true }: { children: ReactNode; scroll?: boolean }) {
  const theme = useTheme();
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: theme.colors.background }}>
      {scroll ? (
        <ScrollView contentContainerStyle={[styles.screenContent, styles.column]} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, styles.column]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

export function Title({ children, right }: { children: ReactNode; right?: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={styles.titleRow}>
      <Text style={[styles.title, { color: theme.colors.text }]}>{children}</Text>
      {right}
    </View>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>{children}</Text>;
}

export function MutedText({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  const theme = useTheme();
  return <Text style={[{ color: theme.colors.textMuted, fontSize: 13 }, style]}>{children}</Text>;
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: theme.colors.surface, borderRadius: theme.radius.md }, style]}>
      {children}
    </View>
  );
}

export function SummaryCard({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string;
  tone?: 'default' | 'positive' | 'negative';
}) {
  const theme = useTheme();
  const color =
    tone === 'positive' ? theme.colors.positive : tone === 'negative' ? theme.colors.negative : theme.colors.text;
  return (
    <Card style={{ flex: 1, gap: 4 }}>
      <Text style={{ fontSize: 13, color: theme.colors.textMuted }}>{label}</Text>
      <Text style={{ fontSize: 20, fontWeight: '700', color }} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
    </Card>
  );
}

const ALERT_LABELS: Record<AlertLevel, string> = {
  ok: 'Sob controle',
  warning: 'Atenção',
  projected_overrun: 'Ameaça de estouro',
  exceeded: 'Orçamento estourado',
};

export function AlertBadge({ level }: { level: AlertLevel }) {
  const theme = useTheme();
  const { bg, fg } = theme.alert[level];
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={[styles.badgeText, { color: fg }]}>{ALERT_LABELS[level]}</Text>
    </View>
  );
}

/** Round colored icon used for categories and accounts. */
export function IconBubble({ icon, color, size = 32 }: { icon: string; color: string; size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: `${color}26`,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Ionicons name={icon as IconName} size={size * 0.55} color={color} />
    </View>
  );
}

export function Chip({
  label,
  selected,
  onPress,
  color,
  icon,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  color?: string;
  icon?: string;
}) {
  const theme = useTheme();
  const accent = color ?? theme.colors.primary;
  const onAccent = color ? '#FFFFFF' : theme.colors.onPrimary;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={[
        styles.chip,
        { borderColor: selected ? accent : theme.colors.border, backgroundColor: selected ? accent : 'transparent' },
      ]}
    >
      {icon && <Ionicons name={icon as IconName} size={14} color={selected ? onAccent : accent} />}
      <Text style={{ fontSize: 13, fontWeight: '600', color: selected ? onAccent : theme.colors.text }}>{label}</Text>
    </Pressable>
  );
}

export function ChipRow({ children }: { children: ReactNode }) {
  return <View style={styles.chipRow}>{children}</View>;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string; color?: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.segmented, { borderColor: theme.colors.border, borderRadius: theme.radius.sm }]}>
      {options.map((o) => {
        const selected = o.value === value;
        const accent = o.color ?? theme.colors.primary;
        const onAccent = o.color ? '#FFFFFF' : theme.colors.onPrimary;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            style={[styles.segment, selected && { backgroundColor: accent }]}
          >
            <Text style={{ fontWeight: '600', color: selected ? onAccent : theme.colors.text }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function TextField({ label, ...props }: TextInputProps & { label?: string }) {
  const theme = useTheme();
  return (
    <View style={{ gap: 4 }}>
      {label && <Text style={{ fontSize: 13, color: theme.colors.textMuted }}>{label}</Text>}
      <TextInput
        placeholderTextColor={theme.colors.textMuted}
        {...props}
        style={[
          styles.input,
          {
            borderColor: theme.colors.border,
            color: theme.colors.text,
            backgroundColor: theme.colors.surfaceMuted,
            borderRadius: theme.radius.sm,
          },
          props.style,
        ]}
      />
    </View>
  );
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  disabled,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  icon?: IconName;
  disabled?: boolean;
}) {
  const theme = useTheme();
  const bg =
    variant === 'primary' ? theme.colors.primary : variant === 'danger' ? theme.colors.danger : 'transparent';
  const fg = variant === 'secondary' ? theme.colors.primary : theme.colors.onPrimary;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: bg,
          borderRadius: theme.radius.sm,
          borderColor: variant === 'secondary' ? theme.colors.border : bg,
          opacity: disabled ? 0.5 : pressed ? 0.8 : 1,
        },
      ]}
    >
      {icon && <Ionicons name={icon} size={18} color={fg} />}
      <Text style={{ color: fg, fontWeight: '700', fontSize: 15 }}>{label}</Text>
    </Pressable>
  );
}

/** Round floating "+" button, bottom-right. */
export function Fab({ onPress, accessibilityLabel }: { onPress: () => void; accessibilityLabel: string }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [styles.fab, { backgroundColor: theme.colors.primary, opacity: pressed ? 0.85 : 1 }]}
    >
      <Ionicons name="add" size={30} color={theme.colors.onPrimary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screenContent: { padding: 16, gap: 12, paddingBottom: 96 },
  column: { width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  title: { fontSize: 26, fontWeight: '800' },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginTop: 8 },
  card: {
    padding: 14,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, alignSelf: 'flex-start' },
  badgeText: { fontSize: 12, fontWeight: '600' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1.5,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  segmented: { flexDirection: 'row', borderWidth: 1, overflow: 'hidden' },
  segment: { flex: 1, paddingVertical: 9, alignItems: 'center' },
  input: { borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderWidth: 1,
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
});

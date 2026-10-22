import { useState, type ReactNode } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type PressableProps,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import Animated from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatSignedCents, spokenAmount } from '../domain/money';
import type { AlertLevel, Cents } from '../domain/types';
import { tapFeedback } from '../platform/haptics';
import { categoryTint } from './categoryColor';
import { Icon, type IconName } from './icons';
import { CONTENT_MAX_WIDTH } from './layout';
import { usePressScale } from './motion';
import { useTheme } from './theme';
import { SCREEN_PADDING, SECTION_GAP, TOUCH_TARGET } from './tokens';

export type { IconName } from './icons';

// Like CSS :focus-visible: the ring shows when focus came from the keyboard,
// not after a tap or a mouse click (browsers also focus on click).
let keyboardInput = false;
if (Platform.OS === 'web' && typeof document !== 'undefined') {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Tab' || e.key.startsWith('Arrow')) keyboardInput = true;
  }, true);
  document.addEventListener('pointerdown', () => (keyboardInput = false), true);
}

/** Keyboard focus ring: visible only while focused from the keyboard. */
function useFocusRing() {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  return {
    handlers: { onFocus: () => setFocused(Platform.OS !== 'web' || keyboardInput), onBlur: () => setFocused(false) },
    style: focused ? ({ outlineColor: theme.colors.focus, outlineWidth: 2, outlineStyle: 'solid', outlineOffset: 2 } as ViewStyle) : null,
  };
}

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
      <Text accessibilityRole="header" style={[theme.type.screenTitle, styles.flexText, { color: theme.colors.textPrimary }]}>
        {children}
      </Text>
      {right}
    </View>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return (
    <Text accessibilityRole="header" style={[theme.type.sectionTitle, { color: theme.colors.textPrimary, marginTop: 8 }]}>
      {children}
    </Text>
  );
}

/** A titled block of a screen; sections sit 24 apart (§5). */
export function Section({
  title,
  action,
  children,
  style,
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  return (
    <View style={[{ gap: 12, marginTop: SECTION_GAP - 16 }, style]}>
      {(title || action) && (
        <View style={styles.titleRow}>
          {title && (
            <Text accessibilityRole="header" style={[theme.type.sectionTitle, styles.flexText, { color: theme.colors.textPrimary }]}>
              {title}
            </Text>
          )}
          {action}
        </View>
      )}
      {children}
    </View>
  );
}

export function MutedText({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  const theme = useTheme();
  return <Text style={[theme.type.label, { color: theme.colors.textSecondary, fontSize: 14 }, style]}>{children}</Text>;
}

/**
 * A surface that groups related content. Light theme: white on the mineral
 * background, a shadow only when `elevated`. Dark theme: surface contrast and a border instead of shadows.
 */
export function Card({
  children,
  style,
  elevated = false,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  elevated?: boolean;
}) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.colors.surface, borderRadius: theme.radius.lg },
        theme.dark ? { borderWidth: 1, borderColor: theme.colors.border } : elevated && styles.shadow,
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** Same as `Card`; the name used by the design system (§5). */
export const Surface = Card;

export type AmountTone = 'auto' | 'neutral' | 'positive' | 'negative';

/**
 * A money value: tabular figures, an explicit sign when it carries direction,
 * and a spoken label. It wraps instead of truncating when text is enlarged.
 *
 * - tone `auto`: positive values get "+" and the income color, negative "−" and the neutral color;
 * - `positive` / `negative`: force the direction (e.g. an expense stored as a positive amount);
 * - `neutral`: no sign and neutral color (balances, budgets).
 */
export function FinancialAmount({
  cents,
  tone = 'neutral',
  size = 'amount',
  style,
  muted = false,
}: {
  cents: Cents;
  tone?: AmountTone;
  size?: 'display' | 'amount' | 'label';
  style?: StyleProp<TextStyle>;
  /** For amounts that don't count in totals (transfers): secondary color. */
  muted?: boolean;
}) {
  const theme = useTheme();
  const sign =
    tone === 'neutral'
      ? cents < 0
        ? 'minus'
        : 'none'
      : tone === 'positive'
        ? 'plus'
        : tone === 'negative'
          ? 'minus'
          : 'auto';
  const value = tone === 'positive' || tone === 'negative' ? Math.abs(cents) : cents;
  const direction = sign === 'auto' ? Math.sign(value) : sign === 'plus' ? 1 : sign === 'minus' ? -1 : 0;
  const color = muted
    ? theme.colors.textSecondary
    : tone !== 'neutral' && direction > 0
      ? theme.colors.amountPositive
      : theme.colors.amountNegative;
  const text = formatSignedCents(value, sign);
  const typeStyle =
    size === 'display'
      ? { ...theme.type.amountDisplay, ...displayScale(text.length) }
      : size === 'label'
        ? { ...theme.type.amount, fontSize: 14, lineHeight: 20 }
        : theme.type.amount;
  return (
    <Text style={[typeStyle, { color }, style]} accessibilityLabel={spokenAmount(value, sign)}>
      {text}
    </Text>
  );
}

/**
 * Smaller type for long display amounts, so "R$ 1.234.567.890,12" fits a
 * phone line instead of breaking inside the number. Never truncates.
 */
export function displayScale(length: number): { fontSize: number; lineHeight: number } {
  if (length <= 13) return { fontSize: 36, lineHeight: 42 };
  if (length <= 16) return { fontSize: 30, lineHeight: 36 };
  return { fontSize: 24, lineHeight: 30 };
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
  const color = tone === 'positive' ? theme.colors.amountPositive : theme.colors.amountNegative;
  return (
    <Card style={{ flex: 1, gap: 4, minWidth: 140 }}>
      <Text style={[theme.type.label, { color: theme.colors.textSecondary }]}>{label}</Text>
      <Text style={[theme.type.amount, { fontSize: 20, lineHeight: 26, color }]}>{value}</Text>
    </Card>
  );
}

const ALERT_LABELS: Record<AlertLevel, string> = {
  ok: 'Sob controle',
  warning: 'Atenção',
  projected_overrun: 'Ameaça de estouro',
  exceeded: 'Orçamento estourado',
};

const ALERT_ICONS: Record<AlertLevel, IconName> = {
  ok: 'checkmark',
  warning: 'information-circle-outline',
  projected_overrun: 'trending-up-outline',
  exceeded: 'alert-outline',
};

/** Budget situation: icon + words on a tinted surface, never color alone. */
export function AlertBadge({ level }: { level: AlertLevel }) {
  const theme = useTheme();
  const { bg, fg } = theme.alert[level];
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Icon name={ALERT_ICONS[level]} size={14} color={fg} />
      <Text style={[theme.type.caption, { color: fg, fontSize: 13 }]}>{ALERT_LABELS[level]}</Text>
    </View>
  );
}

/** Round tinted icon for categories, accounts and institutions; the tint is adjusted to stay legible. */
export function IconBubble({ icon, color, size = 36 }: { icon: string; color: string; size?: number }) {
  const theme = useTheme();
  const tint = categoryTint(color, theme.colors.surface);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: tint.bubble,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icon name={icon} size={Math.round(size * 0.55)} color={tint.icon} />
    </View>
  );
}

/**
 * Selectable chip. Selection is shown by fill and a check mark, not color
 * alone; the touch area reaches 48 even though the chip looks smaller.
 */
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
  const focus = useFocusRing();
  const tint = color ? categoryTint(color, theme.colors.surface) : null;
  return (
    <Pressable
      onPress={onPress}
      {...focus.handlers}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.chip,
        {
          borderColor: selected ? theme.colors.primary : theme.colors.border,
          backgroundColor: selected ? theme.colors.primarySoft : pressed ? theme.colors.pressed : theme.colors.surface,
        },
        focus.style,
      ]}
    >
      {selected ? (
        <Icon name="checkmark" size={16} color={theme.colors.onPrimarySoft} />
      ) : (
        icon && <Icon name={icon} size={16} color={tint?.icon ?? theme.colors.primary} />
      )}
      <Text style={[theme.type.label, { color: selected ? theme.colors.onPrimarySoft : theme.colors.textPrimary }]}>{label}</Text>
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
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  const theme = useTheme();
  return (
    <View
      accessibilityRole="radiogroup"
      style={[styles.segmented, { backgroundColor: theme.colors.surfaceMuted, borderRadius: theme.radius.md }]}
    >
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            style={[
              styles.segment,
              { borderRadius: theme.radius.sm },
              selected && { backgroundColor: theme.colors.surface },
              selected && !theme.dark && styles.shadow,
              selected && theme.dark && { borderWidth: 1, borderColor: theme.colors.borderStrong },
            ]}
          >
            <Text style={[theme.type.label, { color: selected ? theme.colors.textPrimary : theme.colors.textSecondary }]}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function TextField({ label, ...props }: TextInputProps & { label?: string }) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      {label && <Text style={[theme.type.label, { color: theme.colors.textSecondary }]}>{label}</Text>}
      <TextInput
        placeholderTextColor={theme.colors.textSecondary}
        accessibilityLabel={label}
        {...props}
        onFocus={(e) => {
          setFocused(true);
          props.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          props.onBlur?.(e);
        }}
        style={[
          styles.input,
          theme.type.body,
          {
            borderColor: focused ? theme.colors.primary : theme.colors.borderStrong,
            borderWidth: focused ? 2 : 1,
            paddingHorizontal: focused ? 13 : 14,
            color: theme.colors.textPrimary,
            backgroundColor: theme.colors.surface,
            borderRadius: theme.radius.md,
          },
          Platform.OS === 'web' && { outlineWidth: 0 },
          props.style,
        ]}
      />
    </View>
  );
}

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  disabled,
  haptic = false,
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  icon?: IconName;
  disabled?: boolean;
  /** Light haptic on press, for important actions (§6). */
  haptic?: boolean;
}) {
  const theme = useTheme();
  const press = usePressScale();
  const focus = useFocusRing();
  const { colors } = theme;
  const bg = variant === 'primary' ? colors.primary : variant === 'danger' ? colors.danger : variant === 'secondary' ? colors.surface : 'transparent';
  const fg = variant === 'primary' || variant === 'danger' ? (theme.dark ? colors.background : colors.onPrimary) : colors.primary;
  return (
    <Pressable
      onPress={() => {
        if (haptic) tapFeedback();
        onPress();
      }}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      {...focus.handlers}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      style={[{ borderRadius: theme.radius.md }, focus.style]}
    >
      {({ pressed }) => (
        <Animated.View
          style={[
            styles.button,
            {
              backgroundColor: bg,
              borderRadius: theme.radius.md,
              borderColor: variant === 'secondary' ? colors.borderStrong : 'transparent',
              opacity: disabled ? 0.45 : 1,
            },
            press.style,
          ]}
        >
          {pressed && <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: colors.pressed, borderRadius: theme.radius.md }]} />}
          {icon && <Icon name={icon} size={20} color={fg} />}
          <Text style={[theme.type.bodyStrong, { color: fg, textAlign: 'center', flexShrink: 1 }]}>{label}</Text>
        </Animated.View>
      )}
    </Pressable>
  );
}

/** Icon-only button with a 48×48 touch area. The label is required: it is what screen readers say. */
export function IconButton({
  icon,
  accessibilityLabel,
  onPress,
  color,
  size = 22,
  disabled,
  ...rest
}: {
  icon: IconName;
  accessibilityLabel: string;
  onPress: () => void;
  color?: string;
  size?: number;
  disabled?: boolean;
} & Pick<PressableProps, 'accessibilityHint' | 'accessibilityState'>) {
  const theme = useTheme();
  const focus = useFocusRing();
  return (
    <Pressable
      onPress={onPress}
      {...focus.handlers}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      {...rest}
      style={({ pressed }) => [
        styles.iconButton,
        { borderRadius: TOUCH_TARGET / 2, backgroundColor: pressed ? theme.colors.pressed : 'transparent', opacity: disabled ? 0.45 : 1 },
        focus.style,
      ]}
    >
      <Icon name={icon} size={size} color={color ?? theme.colors.textPrimary} />
    </Pressable>
  );
}

/** Round floating "+" button, bottom-right. */
export function Fab({ onPress, accessibilityLabel }: { onPress: () => void; accessibilityLabel: string }) {
  const theme = useTheme();
  const press = usePressScale(0.94);
  return (
    <Pressable
      onPress={() => {
        tapFeedback();
        onPress();
      }}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={styles.fabPosition}
    >
      <Animated.View style={[styles.fab, { backgroundColor: theme.colors.primary }, !theme.dark && styles.shadow, press.style]}>
        <Icon name="add" size={28} color={theme.colors.onPrimary} />
      </Animated.View>
    </Pressable>
  );
}

/** Chip for an active filter: shows what is applied and removes it on press. */
export function RemovableChip({
  label,
  onRemove,
  color,
  icon,
}: {
  label: string;
  onRemove: () => void;
  color?: string;
  icon?: string;
}) {
  const theme = useTheme();
  const tint = color ? categoryTint(color, theme.colors.surface) : null;
  return (
    <Pressable
      onPress={onRemove}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={`Remover filtro ${label}`}
      style={({ pressed }) => [
        styles.chip,
        {
          borderColor: theme.colors.primary,
          backgroundColor: pressed ? theme.colors.pressed : theme.colors.primarySoft,
        },
      ]}
    >
      {icon && <Icon name={icon} size={16} color={tint?.icon ?? theme.colors.onPrimarySoft} />}
      <Text style={[theme.type.label, { color: theme.colors.onPrimarySoft }]}>{label}</Text>
      <Icon name="close" size={16} color={theme.colors.onPrimarySoft} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screenContent: { padding: SCREEN_PADDING, gap: 16, paddingBottom: 96 },
  column: { width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  flexText: { flexShrink: 1 },
  card: { padding: 16 },
  shadow: {
    shadowColor: '#132A26',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    minHeight: 36,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  segmented: { flexDirection: 'row', padding: 4, gap: 4 },
  segment: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  input: { minHeight: TOUCH_TARGET, paddingVertical: 10 },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: TOUCH_TARGET,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderWidth: 1,
    overflow: 'hidden',
  },
  iconButton: { width: TOUCH_TARGET, height: TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' },
  fabPosition: { position: 'absolute', right: 20, bottom: 20 },
  fab: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
});

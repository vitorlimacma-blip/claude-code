import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View, type TextStyle } from 'react-native';
import { centsFromDigits, formatCentsPlain, spokenAmount } from '../domain/money';
import type { Cents } from '../domain/types';
import { useTheme } from './theme';
import { TOUCH_TARGET } from './tokens';

/**
 * Money field that fills from the right, like banking apps (typing 1, 2, 3, 4
 * gives R$ 12,34): only the number pad is needed, there is no decimal
 * separator to find, and the value is integer cents from the first keystroke.
 */
export function MoneyInput({
  value,
  onChange,
  label = 'Valor',
  size = 'large',
  autoFocus,
  sign,
}: {
  value: Cents;
  onChange: (cents: Cents) => void;
  label?: string;
  size?: 'large' | 'regular';
  autoFocus?: boolean;
  /** Shown before the amount ("−" for an expense, "+" for an income), so direction is never color only. */
  sign?: '+' | '−';
}) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  const text = formatCentsPlain(value);
  const typeStyle: TextStyle = size === 'large' ? theme.type.amountDisplay : { ...theme.type.amount, fontSize: 20, lineHeight: 28 };
  return (
    <View style={{ gap: 6 }}>
      <Text style={[theme.type.label, { color: theme.colors.textSecondary }]}>{label}</Text>
      <View
        style={[
          styles.box,
          {
            borderRadius: theme.radius.md,
            borderColor: focused ? theme.colors.primary : theme.colors.borderStrong,
            borderWidth: focused ? 2 : 1,
            backgroundColor: theme.colors.surface,
            paddingHorizontal: focused ? 13 : 14,
          },
        ]}
      >
        <Text style={[typeStyle, { color: theme.colors.textSecondary }]} aria-hidden>
          {sign ? `${sign}R$` : 'R$'}
        </Text>
        <TextInput
          value={text}
          onChangeText={(t) => onChange(centsFromDigits(t))}
          keyboardType="number-pad"
          inputMode="numeric"
          autoFocus={autoFocus}
          selection={{ start: text.length, end: text.length }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          accessibilityLabel={label}
          accessibilityValue={{ text: spokenAmount(value, sign === '+' ? 'plus' : sign === '−' ? 'minus' : 'none') }}
          style={[
            typeStyle,
            styles.input,
            { color: theme.colors.textPrimary },
            Platform.OS === 'web' && { outlineWidth: 0 },
          ]}
        />
      </View>
      {value > 0 && (
        <Pressable accessibilityRole="button" onPress={() => onChange(0)} hitSlop={8} style={styles.clear}>
          <Text style={[theme.type.label, { color: theme.colors.primary }]}>Limpar valor</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: TOUCH_TARGET + 8 },
  input: { flex: 1, paddingVertical: 8, minWidth: 0 },
  clear: { alignSelf: 'flex-start', minHeight: 32, justifyContent: 'center' },
});

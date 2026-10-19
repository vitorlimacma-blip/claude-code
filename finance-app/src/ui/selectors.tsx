import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { categoryTint } from './categoryColor';
import { IconBubble } from './components';
import { Icon } from './icons';
import { useTheme } from './theme';
import { TOUCH_TARGET } from './tokens';

export interface AccountOption {
  id: string;
  name: string;
  icon: string;
  color: string;
  /** E.g. "Cartão de crédito · fecha dia 10". */
  detail?: string;
}

/**
 * Picks one account. A horizontal list of cards that works with one hand;
 * the selected one has an outline and a check mark (not color alone).
 */
export function AccountSelector({
  accounts,
  value,
  onChange,
  label = 'Conta',
}: {
  accounts: AccountOption[];
  value: string | null;
  onChange: (id: string) => void;
  label?: string;
}) {
  const theme = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <Text style={[theme.type.label, { color: theme.colors.textSecondary }]}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.list} accessibilityRole="radiogroup">
        {accounts.map((a) => {
          const selected = a.id === value;
          return (
            <Pressable
              key={a.id}
              onPress={() => onChange(a.id)}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              accessibilityLabel={[a.name, a.detail].filter(Boolean).join(', ')}
              style={({ pressed }) => [
                styles.account,
                {
                  borderRadius: theme.radius.md,
                  borderWidth: selected ? 2 : 1,
                  borderColor: selected ? theme.colors.primary : theme.colors.border,
                  backgroundColor: pressed ? theme.colors.pressed : theme.colors.surface,
                },
              ]}
            >
              <IconBubble icon={a.icon} color={a.color} size={32} />
              <View style={{ flexShrink: 1 }}>
                <Text style={[theme.type.label, { color: theme.colors.textPrimary }]}>{a.name}</Text>
                {a.detail && <Text style={[theme.type.caption, { color: theme.colors.textSecondary }]}>{a.detail}</Text>}
              </View>
              {selected && <Icon name="checkmark" size={18} color={theme.colors.primary} />}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

/** A category as a chip: its icon in its own (contrast-checked) color, a check mark when selected. */
export function CategoryChip({
  name,
  icon,
  color,
  selected = false,
  onPress,
}: {
  name: string;
  icon: string;
  color: string;
  selected?: boolean;
  onPress?: () => void;
}) {
  const theme = useTheme();
  const tint = categoryTint(color, theme.colors.surface);
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      hitSlop={6}
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityState={onPress ? { selected } : undefined}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: selected ? theme.colors.primarySoft : pressed ? theme.colors.pressed : tint.bubble,
          borderColor: selected ? theme.colors.primary : 'transparent',
        },
      ]}
    >
      <Icon name={selected ? 'checkmark' : icon} size={16} color={selected ? theme.colors.onPrimarySoft : tint.icon} />
      <Text style={[theme.type.label, { color: selected ? theme.colors.onPrimarySoft : theme.colors.textPrimary }]}>{name}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: { gap: 8, paddingVertical: 2 },
  account: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: TOUCH_TARGET + 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    maxWidth: 260,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    minHeight: 36,
    alignSelf: 'flex-start',
  },
});

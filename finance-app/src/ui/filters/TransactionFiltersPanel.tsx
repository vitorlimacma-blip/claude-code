import { Icon } from '../icons';
import { Pressable, Text, View } from 'react-native';
import { ACCOUNT_TYPE_ICONS, PAYMENT_METHOD_LABELS } from '../../domain/labels';
import {
  activeFilterCount,
  EMPTY_FILTERS,
  toggleValue,
  UNCATEGORIZED,
  type TransactionFilters,
} from '../../domain/transactionFilters';
import type { Account, Category, PaymentMethod } from '../../domain/types';
import { Button, Chip, ChipRow, MutedText, RemovableChip, SectionTitle } from '../components';
import { useTheme } from '../theme';
import { FilterSheet } from './FilterSheet';

/** Most used methods first; the rest stay available for imported or older entries. */
export const FILTER_PAYMENT_METHODS: PaymentMethod[] = ['debit', 'credit', 'pix', 'boleto', 'cash', 'transfer', 'other'];

const UNCATEGORIZED_STYLE = { label: 'Sem categoria', icon: 'help-circle-outline', color: '#6B7280' };

export interface FilterOptions {
  /** All categories; only top-level ones are offered (they include their subcategories). */
  categories: Category[];
  accounts: Account[];
}

/** Funnel button with the number of active filters. */
export function FilterButton({ count, onPress }: { count: number; onPress: () => void }) {
  const theme = useTheme();
  const active = count > 0;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={active ? `Filtros (${count} ativos)` : 'Filtros'}
      hitSlop={8}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          paddingHorizontal: 10,
          paddingVertical: 6,
          borderRadius: 999,
          borderWidth: 1.5,
          borderColor: active ? theme.colors.primary : theme.colors.border,
          backgroundColor: active ? theme.colors.primary : 'transparent',
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <Icon name="filter" size={16} color={active ? theme.colors.onPrimary : theme.colors.primary} />
      <Text style={{ fontSize: 13, fontWeight: '600', color: active ? theme.colors.onPrimary : theme.colors.primary }}>
        {active ? `Filtros · ${count}` : 'Filtros'}
      </Text>
    </Pressable>
  );
}

/** The filter options in a sheet/panel; changes apply immediately so the result count stays live. */
export function TransactionFiltersPanel({
  visible,
  onClose,
  value,
  onChange,
  options,
  resultCount,
}: {
  visible: boolean;
  onClose: () => void;
  value: TransactionFilters;
  onChange: (next: TransactionFilters) => void;
  options: FilterOptions;
  resultCount: number;
}) {
  const roots = options.categories.filter((c) => c.parentId === null);
  const groups = [
    { title: 'Despesas', items: roots.filter((c) => c.kind === 'expense') },
    { title: 'Receitas', items: roots.filter((c) => c.kind === 'income') },
  ];
  const toggle = <K extends keyof TransactionFilters>(key: K, item: TransactionFilters[K][number]) =>
    onChange({ ...value, [key]: toggleValue(value[key] as (typeof item)[], item) });

  return (
    <FilterSheet
      visible={visible}
      title="Filtros"
      onClose={onClose}
      footer={
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Button
              label="Limpar"
              variant="secondary"
              onPress={() => onChange(EMPTY_FILTERS)}
              disabled={activeFilterCount(value) === 0}
            />
          </View>
          <View style={{ flex: 2 }}>
            <Button label={`Ver ${resultCount} lançamento${resultCount === 1 ? '' : 's'}`} onPress={onClose} />
          </View>
        </View>
      }
    >
      <SectionTitle>Categoria</SectionTitle>
      <MutedText style={{ fontSize: 12 }}>Uma categoria principal inclui as subcategorias dela.</MutedText>
      {groups.map(
        (group) =>
          group.items.length > 0 && (
            <View key={group.title} style={{ gap: 6 }}>
              <MutedText style={{ fontSize: 12, fontWeight: '600' }}>{group.title}</MutedText>
              <ChipRow>
                {group.items.map((c) => (
                  <Chip
                    key={c.id}
                    label={c.name}
                    icon={c.icon}
                    color={c.color}
                    selected={value.categoryIds.includes(c.id)}
                    onPress={() => toggle('categoryIds', c.id)}
                  />
                ))}
              </ChipRow>
            </View>
          )
      )}
      <ChipRow>
        <Chip
          label={UNCATEGORIZED_STYLE.label}
          icon={UNCATEGORIZED_STYLE.icon}
          color={UNCATEGORIZED_STYLE.color}
          selected={value.categoryIds.includes(UNCATEGORIZED)}
          onPress={() => toggle('categoryIds', UNCATEGORIZED)}
        />
      </ChipRow>

      <SectionTitle>Forma de pagamento</SectionTitle>
      <ChipRow>
        {FILTER_PAYMENT_METHODS.map((m) => (
          <Chip
            key={m}
            label={PAYMENT_METHOD_LABELS[m]}
            selected={value.paymentMethods.includes(m)}
            onPress={() => toggle('paymentMethods', m)}
          />
        ))}
      </ChipRow>

      <SectionTitle>Conta</SectionTitle>
      {options.accounts.length === 0 ? (
        <MutedText>Nenhuma conta cadastrada.</MutedText>
      ) : (
        <ChipRow>
          {options.accounts.map((a) => (
            <Chip
              key={a.id}
              label={a.name}
              icon={ACCOUNT_TYPE_ICONS[a.type]}
              color={a.color}
              selected={value.accountIds.includes(a.id)}
              onPress={() => toggle('accountIds', a.id)}
            />
          ))}
        </ChipRow>
      )}
    </FilterSheet>
  );
}

/** Active filters as removable chips, plus "Limpar filtros". Renders nothing when no filter is active. */
export function ActiveFilterChips({
  value,
  onChange,
  options,
}: {
  value: TransactionFilters;
  onChange: (next: TransactionFilters) => void;
  options: FilterOptions;
}) {
  const theme = useTheme();
  if (activeFilterCount(value) === 0) return null;
  const categoryById = new Map(options.categories.map((c) => [c.id, c]));
  const accountById = new Map(options.accounts.map((a) => [a.id, a]));
  const remove = <K extends keyof TransactionFilters>(key: K, item: TransactionFilters[K][number]) =>
    onChange({ ...value, [key]: (value[key] as (typeof item)[]).filter((v) => v !== item) });

  return (
    <ChipRow>
      {value.categoryIds.map((id) => {
        const c = id === UNCATEGORIZED ? null : categoryById.get(id);
        return (
          <RemovableChip
            key={`c-${id}`}
            label={c?.name ?? UNCATEGORIZED_STYLE.label}
            icon={c?.icon ?? UNCATEGORIZED_STYLE.icon}
            color={c?.color ?? UNCATEGORIZED_STYLE.color}
            onRemove={() => remove('categoryIds', id)}
          />
        );
      })}
      {value.paymentMethods.map((m) => (
        <RemovableChip key={`m-${m}`} label={PAYMENT_METHOD_LABELS[m]} onRemove={() => remove('paymentMethods', m)} />
      ))}
      {value.accountIds.map((id) => {
        const a = accountById.get(id);
        return (
          <RemovableChip
            key={`a-${id}`}
            label={a?.name ?? 'Conta removida'}
            icon={a ? ACCOUNT_TYPE_ICONS[a.type] : undefined}
            color={a?.color}
            onRemove={() => remove('accountIds', id)}
          />
        );
      })}
      <Pressable onPress={() => onChange(EMPTY_FILTERS)} hitSlop={8} accessibilityRole="button" style={{ justifyContent: 'center', paddingHorizontal: 4 }}>
        <Text style={{ color: theme.colors.primary, fontWeight: '600', fontSize: 13 }}>Limpar filtros</Text>
      </Pressable>
    </ChipRow>
  );
}

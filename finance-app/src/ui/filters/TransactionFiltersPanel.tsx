import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { formatDateBR, parseDateInput } from '../../domain/dates';
import { ACCOUNT_TYPE_ICONS, PAYMENT_METHOD_LABELS } from '../../domain/labels';
import type { ListPeriod } from '../../domain/periods';
import {
  activeFilterCount,
  EMPTY_FILTERS,
  NATURE_GROUP_LABELS,
  NATURE_GROUPS,
  toggleValue,
  UNCATEGORIZED,
  type TransactionFilters,
} from '../../domain/transactionFilters';
import type { Account, Category, DateKey, PaymentMethod } from '../../domain/types';
import { BottomSheet } from '../BottomSheet';
import { Button, Chip, ChipRow, MutedText, RemovableChip, TextField } from '../components';
import { Icon } from '../icons';
import { NEUTRAL_ICON_COLOR } from '../transactionPresentation';
import { useTheme } from '../theme';

/** Most used methods first; the rest stay available for imported or older entries. */
export const FILTER_PAYMENT_METHODS: PaymentMethod[] = ['debit', 'credit', 'pix', 'boleto', 'cash', 'transfer', 'other'];

const UNCATEGORIZED_STYLE = { label: 'Sem categoria', icon: 'help-circle-outline', color: NEUTRAL_ICON_COLOR };

export interface FilterOptions {
  /** All categories; only top-level ones are offered (they include their subcategories). */
  categories: Category[];
  accounts: Account[];
}

/** Button with the number of active filters. */
export function FilterButton({ count, onPress }: { count: number; onPress: () => void }) {
  const theme = useTheme();
  const active = count > 0;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={active ? `Filtros, ${count} ativos` : 'Filtros'}
      hitSlop={6}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        minHeight: 40,
        paddingHorizontal: 14,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: active ? theme.colors.primary : theme.colors.borderStrong,
        backgroundColor: pressed ? theme.colors.pressed : active ? theme.colors.primarySoft : theme.colors.surface,
      })}
    >
      <Icon name="filter" size={18} color={active ? theme.colors.onPrimarySoft : theme.colors.primary} />
      <Text style={[theme.type.label, { color: active ? theme.colors.onPrimarySoft : theme.colors.primary }]}>
        {active ? `Filtros · ${count}` : 'Filtros'}
      </Text>
    </Pressable>
  );
}

function SheetSection({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <View style={{ gap: 8 }}>
      <Text accessibilityRole="header" style={[theme.type.bodyStrong, { color: theme.colors.textPrimary }]}>
        {title}
      </Text>
      {hint && <MutedText style={{ fontSize: 13 }}>{hint}</MutedText>}
      {children}
    </View>
  );
}

/** Period choice: the month being browsed, the last 30 days, the year, or custom dates. */
function PeriodPicker({ value, onChange, today }: { value: ListPeriod; onChange: (p: ListPeriod) => void; today: DateKey }) {
  const [from, setFrom] = useState(value.kind === 'custom' ? formatDateBR(value.from) : '');
  const [to, setTo] = useState(value.kind === 'custom' ? formatDateBR(value.to) : '');
  const [error, setError] = useState<string | null>(null);
  const year = Number(today.slice(0, 4));
  const applyCustom = () => {
    const f = parseDateInput(from);
    const t = parseDateInput(to);
    if (!f || !t) return setError('Use datas no formato dd/mm/aaaa.');
    setError(null);
    onChange({ kind: 'custom', from: f, to: t });
  };
  return (
    <View style={{ gap: 10 }}>
      <ChipRow>
        <Chip label="Por mês" selected={value.kind === 'month'} onPress={() => onChange({ kind: 'month', month: today.slice(0, 7) })} />
        <Chip label="Últimos 30 dias" selected={value.kind === 'last30'} onPress={() => onChange({ kind: 'last30' })} />
        <Chip label={`Ano de ${year}`} selected={value.kind === 'year'} onPress={() => onChange({ kind: 'year', year })} />
      </ChipRow>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
        <View style={{ flex: 1 }}>
          <TextField label="De" placeholder="dd/mm/aaaa" value={from} onChangeText={setFrom} keyboardType="numbers-and-punctuation" />
        </View>
        <View style={{ flex: 1 }}>
          <TextField label="Até" placeholder="dd/mm/aaaa" value={to} onChangeText={setTo} keyboardType="numbers-and-punctuation" />
        </View>
      </View>
      {error && <MutedText>{error}</MutedText>}
      <Button label="Usar estas datas" variant="secondary" onPress={applyCustom} disabled={!from || !to} />
    </View>
  );
}

/** The filters in a sheet; changes apply immediately so the result count stays live. */
export function TransactionFiltersPanel({
  visible,
  onClose,
  value,
  onChange,
  period,
  onPeriodChange,
  today,
  options,
  resultCount,
}: {
  visible: boolean;
  onClose: () => void;
  value: TransactionFilters;
  onChange: (next: TransactionFilters) => void;
  period: ListPeriod;
  onPeriodChange: (next: ListPeriod) => void;
  today: DateKey;
  options: FilterOptions;
  resultCount: number;
}) {
  const roots = options.categories.filter((c) => c.parentId === null && !c.archived);
  const groups = [
    { title: 'Despesas', items: roots.filter((c) => c.kind === 'expense') },
    { title: 'Receitas', items: roots.filter((c) => c.kind === 'income') },
  ];
  const toggle = <K extends 'categoryIds' | 'paymentMethods' | 'accountIds' | 'natureGroups'>(
    key: K,
    item: TransactionFilters[K][number]
  ) => onChange({ ...value, [key]: toggleValue(value[key] as (typeof item)[], item) });

  return (
    <BottomSheet
      visible={visible}
      title="Filtros"
      onClose={onClose}
      footer={
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Button
              label="Limpar"
              variant="secondary"
              onPress={() => onChange({ ...EMPTY_FILTERS, query: value.query })}
              disabled={activeFilterCount(value) === 0}
            />
          </View>
          <View style={{ flex: 2 }}>
            <Button label={`Ver ${resultCount} lançamento${resultCount === 1 ? '' : 's'}`} onPress={onClose} />
          </View>
        </View>
      }
    >
      <SheetSection title="Período">
        <PeriodPicker value={period} onChange={onPeriodChange} today={today} />
      </SheetSection>

      <SheetSection title="Natureza" hint="Transferências, pagamentos de fatura e investimentos não contam como gasto nem receita.">
        <ChipRow>
          {NATURE_GROUPS.map((g) => (
            <Chip key={g} label={NATURE_GROUP_LABELS[g]} selected={value.natureGroups.includes(g)} onPress={() => toggle('natureGroups', g)} />
          ))}
        </ChipRow>
      </SheetSection>

      <SheetSection title="Categoria" hint="Uma categoria principal inclui as subcategorias dela.">
        {groups.map(
          (group) =>
            group.items.length > 0 && (
              <View key={group.title} style={{ gap: 6 }}>
                <MutedText style={{ fontSize: 13 }}>{group.title}</MutedText>
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
      </SheetSection>

      <SheetSection title="Conta">
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
      </SheetSection>

      <SheetSection title="Forma de pagamento">
        <ChipRow>
          {FILTER_PAYMENT_METHODS.map((m) => (
            <Chip key={m} label={PAYMENT_METHOD_LABELS[m]} selected={value.paymentMethods.includes(m)} onPress={() => toggle('paymentMethods', m)} />
          ))}
        </ChipRow>
      </SheetSection>
    </BottomSheet>
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
  const remove = <K extends 'categoryIds' | 'paymentMethods' | 'accountIds' | 'natureGroups'>(key: K, item: TransactionFilters[K][number]) =>
    onChange({ ...value, [key]: (value[key] as (typeof item)[]).filter((v) => v !== item) });

  return (
    <ChipRow>
      {value.natureGroups.map((g) => (
        <RemovableChip key={`n-${g}`} label={NATURE_GROUP_LABELS[g]} onRemove={() => remove('natureGroups', g)} />
      ))}
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
      {value.paymentMethods.map((m) => (
        <RemovableChip key={`m-${m}`} label={PAYMENT_METHOD_LABELS[m]} onRemove={() => remove('paymentMethods', m)} />
      ))}
      <Pressable
        onPress={() => onChange({ ...EMPTY_FILTERS, query: value.query })}
        hitSlop={8}
        accessibilityRole="button"
        style={{ justifyContent: 'center', minHeight: 36, paddingHorizontal: 4 }}
      >
        <Text style={[theme.type.label, { color: theme.colors.primary }]}>Limpar filtros</Text>
      </Pressable>
    </ChipRow>
  );
}

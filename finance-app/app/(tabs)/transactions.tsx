import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { addMonths, formatDateBR, formatMonthBR, monthRange } from '../../src/domain/dates';
import { PAYMENT_METHOD_LABELS } from '../../src/domain/labels';
import { formatCents } from '../../src/domain/money';
import {
  activeFilterCount,
  applyTransactionFilters,
  EMPTY_FILTERS,
  summarizeTransactions,
  type TransactionFilters,
} from '../../src/domain/transactionFilters';
import type { Transaction } from '../../src/domain/types';
import { useQuery } from '../../src/state/useQuery';
import { useToday } from '../../src/state/useToday';
import { Button, Card, Fab, IconBubble, MutedText, Title } from '../../src/ui/components';
import { ActiveFilterChips, FilterButton, TransactionFiltersPanel } from '../../src/ui/filters/TransactionFiltersPanel';
import { CONTENT_MAX_WIDTH } from '../../src/ui/layout';
import { useTheme } from '../../src/ui/theme';

const SIGN: Record<Transaction['type'], string> = { expense: '-', income: '+', transfer_out: '-', transfer_in: '+' };

export default function TransactionsScreen() {
  const theme = useTheme();
  const today = useToday();
  const [month, setMonth] = useState(() => today.slice(0, 7));
  const range = monthRange(month);
  // Kept across month changes on purpose: the same filter applies to whichever month is shown.
  const [filters, setFilters] = useState<TransactionFilters>(EMPTY_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const { data } = useQuery(
    async (r) => {
      const [transactions, categories, accounts] = await Promise.all([
        r.transactions.list(range),
        r.categories.list(),
        r.accounts.list({ includeArchived: true }),
      ]);
      return { transactions, categories, accounts };
    },
    ['transactions', 'categories', 'accounts'],
    [month]
  );

  const categoryById = useMemo(() => new Map(data?.categories.map((c) => [c.id, c])), [data]);
  const accountById = useMemo(() => new Map(data?.accounts.map((a) => [a.id, a])), [data]);
  const filterOptions = useMemo(
    () => ({
      categories: data?.categories ?? [],
      // Archived accounts are offered only if already selected, so an old filter can still be removed.
      accounts: (data?.accounts ?? []).filter((a) => !a.archived || filters.accountIds.includes(a.id)),
    }),
    [data, filters.accountIds]
  );
  const visible = useMemo(
    () => applyTransactionFilters(data?.transactions ?? [], filters, data?.categories ?? []),
    [data, filters]
  );
  const summary = summarizeTransactions(visible);
  const filtering = activeFilterCount(filters) > 0;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <FlatList
        contentContainerStyle={styles.list}
        data={visible}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View style={{ gap: 8, marginBottom: 4 }}>
            <Title>Lançamentos</Title>
            <View style={styles.monthNav}>
              <Pressable onPress={() => setMonth(addMonths(month, -1))} hitSlop={12} accessibilityLabel="Mês anterior">
                <Ionicons name="chevron-back" size={22} color={theme.colors.primary} />
              </Pressable>
              <Text style={[styles.monthLabel, { color: theme.colors.text }]}>{formatMonthBR(month)}</Text>
              <Pressable onPress={() => setMonth(addMonths(month, 1))} hitSlop={12} accessibilityLabel="Próximo mês">
                <Ionicons name="chevron-forward" size={22} color={theme.colors.primary} />
              </Pressable>
              <FilterButton count={activeFilterCount(filters)} onPress={() => setFiltersOpen(true)} />
            </View>
            <ActiveFilterChips value={filters} onChange={setFilters} options={filterOptions} />
            {data && summary.count > 0 && (
              <View style={styles.summary}>
                <MutedText>
                  {summary.count} lançamento{summary.count === 1 ? '' : 's'}
                  {filtering ? ` de ${data.transactions.length} no mês` : ''}
                  {summary.transferCount > 0 ? ' · transferências não entram no total' : ''}
                </MutedText>
                <Text
                  style={[styles.amount, { color: summary.total < 0 ? theme.colors.negative : theme.colors.positive }]}
                >
                  {summary.total < 0 ? '-' : '+'}
                  {formatCents(Math.abs(summary.total))}
                </Text>
              </View>
            )}
          </View>
        }
        ListEmptyComponent={
          !data ? undefined : filtering && data.transactions.length > 0 ? (
            <Card style={{ gap: 10, alignItems: 'center' }}>
              <Ionicons name="filter" size={28} color={theme.colors.textMuted} />
              <Text style={[styles.rowTitle, { color: theme.colors.text }]}>Nenhum lançamento com esses filtros</Text>
              <MutedText>Em {formatMonthBR(month)} há {data.transactions.length} lançamento(s), mas nenhum combina com todos os filtros.</MutedText>
              <Button label="Limpar filtros" variant="secondary" onPress={() => setFilters(EMPTY_FILTERS)} />
            </Card>
          ) : (
            <MutedText>Nenhum lançamento neste mês. Toque em + para adicionar.</MutedText>
          )
        }
        renderItem={({ item }) => {
          const category = item.categoryId ? categoryById.get(item.categoryId) : undefined;
          const account = accountById.get(item.accountId);
          const isTransfer = item.type === 'transfer_in' || item.type === 'transfer_out';
          const positive = item.type === 'income' || item.type === 'transfer_in';
          const title =
            item.description || (isTransfer ? 'Transferência' : (category?.name ?? 'Sem categoria'));
          const subtitle = [
            formatDateBR(item.date),
            isTransfer ? null : (category?.name ?? 'Sem categoria'),
            account?.name,
            item.paymentMethod !== 'other' ? PAYMENT_METHOD_LABELS[item.paymentMethod] : null,
          ]
            .filter(Boolean)
            .join(' · ');
          return (
            <Pressable
              onPress={() => router.push({ pathname: '/transaction/[id]', params: { id: item.id } })}
              style={({ pressed }) => [
                styles.row,
                { backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <IconBubble
                icon={isTransfer ? 'swap-horizontal-outline' : (category?.icon ?? 'help-circle-outline')}
                color={isTransfer ? theme.colors.textMuted : (category?.color ?? theme.colors.textMuted)}
              />
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowTitle, { color: theme.colors.text }]} numberOfLines={1}>
                  {title}
                </Text>
                <MutedText style={{ fontSize: 12 }}>{subtitle}</MutedText>
              </View>
              <Text
                style={[
                  styles.amount,
                  { color: isTransfer ? theme.colors.textMuted : positive ? theme.colors.positive : theme.colors.negative },
                ]}
              >
                {SIGN[item.type]}
                {formatCents(item.amount)}
              </Text>
            </Pressable>
          );
        }}
      />
      <Fab
        accessibilityLabel="Novo lançamento"
        onPress={() => router.push({ pathname: '/transaction/[id]', params: { id: 'new' } })}
      />
      <TransactionFiltersPanel
        visible={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        value={filters}
        onChange={setFilters}
        options={filterOptions}
        resultCount={visible.length}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  list: { padding: 16, gap: 8, paddingBottom: 96, width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
  monthNav: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  monthLabel: { flex: 1, fontSize: 16, fontWeight: '600', textAlign: 'center' },
  summary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 12 },
  rowTitle: { fontSize: 15, fontWeight: '600' },
  amount: { fontSize: 15, fontWeight: '700' },
});

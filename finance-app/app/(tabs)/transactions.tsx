import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, SectionList, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { addMonths } from '../../src/domain/dates';
import { summarizePeriod } from '../../src/domain/ledger';
import { periodRange, type ListPeriod } from '../../src/domain/periods';
import { collapseTransfers, countsInResult, groupByDay } from '../../src/domain/transactionDisplay';
import {
  activeFilterCount,
  applyTransactionFilters,
  EMPTY_FILTERS,
  type TransactionFilters,
} from '../../src/domain/transactionFilters';
import { useQuery } from '../../src/state/useQuery';
import { useToday } from '../../src/state/useToday';
import { Button, Fab, FinancialAmount, IconButton, MutedText, Title } from '../../src/ui/components';
import { ActiveFilterChips, FilterButton, TransactionFiltersPanel } from '../../src/ui/filters/TransactionFiltersPanel';
import { Icon } from '../../src/ui/icons';
import { CONTENT_MAX_WIDTH } from '../../src/ui/layout';
import { EmptyState, SkeletonRows } from '../../src/ui/states';
import { useTheme } from '../../src/ui/theme';
import { SCREEN_PADDING } from '../../src/ui/tokens';
import { presentTransaction } from '../../src/ui/transactionPresentation';
import { TransactionRow } from '../../src/ui/TransactionRow';

export default function TransactionsScreen() {
  const theme = useTheme();
  const today = useToday();
  const [period, setPeriod] = useState<ListPeriod>(() => ({ kind: 'month', month: today.slice(0, 7) }));
  const range = periodRange(period, today);
  // Kept across period changes on purpose: the same filter applies to whichever period is shown.
  const [filters, setFilters] = useState<TransactionFilters>(EMPTY_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  const { data } = useQuery(
    async (r) => {
      const [transactions, categories, accounts] = await Promise.all([
        r.transactions.list({ from: range.from, to: range.to }),
        r.categories.list(),
        r.accounts.list({ includeArchived: true }),
      ]);
      return { transactions, categories, accounts };
    },
    ['transactions', 'categories', 'accounts'],
    [range.from, range.to]
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
    () => applyTransactionFilters(data?.transactions ?? [], filters, data?.categories ?? [], data?.accounts ?? []),
    [data, filters]
  );
  const entries = useMemo(
    () => collapseTransfers(visible, filters.accountIds, data?.transactions ?? []),
    [visible, filters.accountIds, data]
  );
  const sections = useMemo(() => groupByDay(entries, today), [entries, today]);
  const totals = summarizePeriod(entries.map((e) => e.transaction));
  const neutralCount = entries.filter((e) => !countsInResult(e.transaction)).length;
  const filtering = activeFilterCount(filters) > 0 || filters.query.trim() !== '';

  const shiftMonth = (delta: number) => period.kind === 'month' && setPeriod({ kind: 'month', month: addMonths(period.month, delta) });

  const header = (
    <View style={{ gap: 12, marginBottom: 8 }}>
      <Title
        right={
          <IconButton
            icon={searchOpen ? 'close' : 'search-outline'}
            accessibilityLabel={searchOpen ? 'Fechar busca' : 'Buscar lançamentos'}
            onPress={() => {
              if (searchOpen) setFilters((f) => ({ ...f, query: '' }));
              setSearchOpen((v) => !v);
            }}
            color={theme.colors.primary}
          />
        }
      >
        Lançamentos
      </Title>

      {searchOpen && (
        <View style={[styles.search, { borderColor: theme.colors.borderStrong, backgroundColor: theme.colors.surface, borderRadius: theme.radius.md }]}>
          <Icon name="search-outline" size={18} color={theme.colors.textSecondary} />
          <TextInput
            autoFocus
            value={filters.query}
            onChangeText={(query) => setFilters((f) => ({ ...f, query }))}
            placeholder="Descrição, categoria ou conta"
            placeholderTextColor={theme.colors.textSecondary}
            accessibilityLabel="Buscar lançamentos"
            returnKeyType="search"
            style={[theme.type.body, styles.searchInput, { color: theme.colors.textPrimary }]}
          />
        </View>
      )}

      <View style={styles.periodRow}>
        {period.kind === 'month' ? (
          <View style={styles.monthNav}>
            <IconButton icon="chevron-back" accessibilityLabel="Mês anterior" onPress={() => shiftMonth(-1)} color={theme.colors.primary} />
            <Text style={[theme.type.bodyStrong, styles.periodLabel, { color: theme.colors.textPrimary }]}>{range.label}</Text>
            <IconButton icon="chevron-forward" accessibilityLabel="Próximo mês" onPress={() => shiftMonth(1)} color={theme.colors.primary} />
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityHint="Volta para a visão por mês"
            onPress={() => setPeriod({ kind: 'month', month: today.slice(0, 7) })}
            style={styles.monthNav}
          >
            <Icon name="calendar-outline" size={20} color={theme.colors.primary} />
            <Text style={[theme.type.bodyStrong, styles.periodLabel, { color: theme.colors.textPrimary }]}>{range.label}</Text>
            <Icon name="close" size={18} color={theme.colors.textSecondary} />
          </Pressable>
        )}
        <FilterButton count={activeFilterCount(filters)} onPress={() => setFiltersOpen(true)} />
      </View>

      <ActiveFilterChips value={filters} onChange={setFilters} options={filterOptions} />

      {data && entries.length > 0 && (
        <View style={[styles.summary, { backgroundColor: theme.colors.surface, borderRadius: theme.radius.md }]}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[theme.type.label, { color: theme.colors.textSecondary }]}>
              {filtering ? 'Resultado do que está filtrado' : 'Resultado do período'}
            </Text>
            <MutedText style={{ fontSize: 13 }}>
              {entries.length} lançamento{entries.length === 1 ? '' : 's'}
              {neutralCount > 0 ? ` · ${neutralCount} sem efeito no resultado (transferências, faturas, investimentos)` : ''}
            </MutedText>
          </View>
          <FinancialAmount cents={totals.result} tone="auto" />
        </View>
      )}
    </View>
  );

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <SectionList
        contentContainerStyle={styles.list}
        sections={sections}
        keyExtractor={(item) => item.transaction.id}
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={header}
        renderSectionHeader={({ section }) => (
          <View style={styles.dayHeader} accessibilityRole="header">
            <Text style={[theme.type.label, { color: theme.colors.textSecondary, flex: 1 }]}>{section.title}</Text>
            {section.total !== 0 && <FinancialAmount cents={section.total} tone="auto" size="label" style={{ color: theme.colors.textSecondary }} />}
          </View>
        )}
        renderItem={({ item }) => (
          <TransactionRow
            {...presentTransaction(item, categoryById, accountById)}
            onPress={() => router.push({ pathname: '/transaction/[id]', params: { id: item.transaction.id } })}
          />
        )}
        ListEmptyComponent={
          !data ? (
            <SkeletonRows count={6} />
          ) : filtering && data.transactions.length > 0 ? (
            <EmptyState
              icon="filter"
              title="Nada com esses filtros"
              message={`Em ${range.label.toLowerCase()} há ${data.transactions.length} lançamento(s), mas nenhum combina com a busca e os filtros.`}
              action={{ label: 'Limpar filtros e busca', onPress: () => setFilters(EMPTY_FILTERS) }}
            />
          ) : (
            <EmptyState
              icon="receipt-outline"
              title={`Nenhum lançamento em ${range.label.toLowerCase()}`}
              message="Registre um gasto, uma receita ou uma transferência; eles aparecem aqui, agrupados por dia."
              action={{ label: 'Novo lançamento', icon: 'add', onPress: () => router.push({ pathname: '/transaction/[id]', params: { id: 'new' } }) }}
            />
          )
        }
        ListFooterComponent={
          data && filtering && entries.length > 0 ? (
            <View style={{ marginTop: 12 }}>
              <Button label="Limpar filtros e busca" variant="ghost" onPress={() => setFilters(EMPTY_FILTERS)} />
            </View>
          ) : undefined
        }
      />
      <Fab accessibilityLabel="Novo lançamento" onPress={() => router.push({ pathname: '/transaction/[id]', params: { id: 'new' } })} />
      <TransactionFiltersPanel
        visible={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        value={filters}
        onChange={setFilters}
        period={period}
        onPeriodChange={setPeriod}
        today={today}
        options={filterOptions}
        resultCount={entries.length}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  list: { padding: SCREEN_PADDING, paddingBottom: 112, width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, paddingHorizontal: 12, minHeight: 48 },
  searchInput: { flex: 1, paddingVertical: 8, outlineWidth: 0 },
  periodRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  monthNav: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1, minHeight: 48 },
  periodLabel: { textAlign: 'center', flexShrink: 1 },
  summary: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  dayHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 16, paddingBottom: 4, paddingHorizontal: 8 },
});

import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import type { CategoryUsage } from '../src/data/repositories/categories';
import { buildCategoryTree } from '../src/domain/categories';
import { formatCents } from '../src/domain/money';
import type { Category, CategoryKind } from '../src/domain/types';
import { notify } from '../src/platform/dialogs';
import { logError, userFacingError } from '../src/platform/errors';
import { useRepositories } from '../src/state/DataProvider';
import { useQuery } from '../src/state/useQuery';
import { useToday } from '../src/state/useToday';
import { BottomSheet } from '../src/ui/BottomSheet';
import { Button, Card, Chip, ChipRow, IconBubble, IconButton, MutedText, Section, SegmentedControl } from '../src/ui/components';
import { CONTENT_MAX_WIDTH } from '../src/ui/layout';
import { useTheme } from '../src/ui/theme';
import { useToast } from '../src/ui/Toast';
import { SCREEN_PADDING } from '../src/ui/tokens';

function openCategory(params: { id: string; kind?: CategoryKind; parentId?: string }) {
  router.push({ pathname: '/category/[id]', params });
}

/** Categories: create, rename, reorder, archive and merge (briefing §7), every action with a visible button. */
export default function CategoriesScreen() {
  const theme = useTheme();
  const repos = useRepositories();
  const toast = useToast();
  const month = useToday().slice(0, 7);
  const [kind, setKind] = useState<CategoryKind>('expense');
  const [actionsFor, setActionsFor] = useState<Category | null>(null);
  const [mergeFrom, setMergeFrom] = useState<{ category: Category; usage: CategoryUsage } | null>(null);
  const [mergeInto, setMergeInto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Arrows only while reordering, so names keep room on a phone.
  const [reordering, setReordering] = useState(false);

  const { data } = useQuery(
    async (r) => {
      const [categories, budgets] = await Promise.all([r.categories.list({ kind }), r.budgets.amountsForMonth(month)]);
      return { categories, budgets };
    },
    ['categories', 'budgets'],
    [kind, month]
  );
  const active = useMemo(() => buildCategoryTree((data?.categories ?? []).filter((c) => !c.archived)), [data]);
  const archived = useMemo(() => (data?.categories ?? []).filter((c) => c.archived && !(c.parentId && data?.categories.find((p) => p.id === c.parentId)?.archived)), [data]);

  function budgetLabel(category: Category) {
    const budget = data?.budgets.get(category.id);
    return budget !== undefined ? `Orçamento: ${formatCents(budget)}/mês` : undefined;
  }

  async function run(context: string, fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      logError(context, err);
      notify('Não foi possível concluir', userFacingError(err, 'Nada foi alterado. Tente de novo.'));
    } finally {
      setBusy(false);
    }
  }

  const archive = (c: Category) =>
    run('categories.archive', async () => {
      setActionsFor(null);
      await repos.categories.setArchived(c.id, true);
      toast({
        message: `“${c.name}” arquivada`,
        action: { label: 'Desfazer', onPress: () => void repos.categories.setArchived(c.id, false) },
      });
    });

  const startMerge = (c: Category) =>
    run('categories.usage', async () => {
      setActionsFor(null);
      setMergeInto(null);
      setMergeFrom({ category: c, usage: await repos.categories.usage(c.id) });
    });

  const confirmMerge = () =>
    run('categories.merge', async () => {
      if (!mergeFrom || !mergeInto) return;
      // A full backup first: merging can't be undone with one tap.
      await repos.backup.backupNow();
      await repos.categories.consolidate(mergeFrom.category.id, mergeInto);
      const target = data?.categories.find((c) => c.id === mergeInto)?.name ?? 'a categoria escolhida';
      setMergeFrom(null);
      toast({ message: `Juntada com “${target}”. Um backup foi guardado antes (Ajustes › Backup).`, tone: 'success', duration: 6000 });
    });

  const mergeTargets = (data?.categories ?? []).filter(
    (c) => mergeFrom && !c.archived && c.id !== mergeFrom.category.id && c.parentId !== mergeFrom.category.id
  );

  function Row({ category, child, index, siblings }: { category: Category; child?: boolean; index: number; siblings: number }) {
    return (
      <View style={[styles.row, child && styles.child]}>
        {child ? (
          <View style={[styles.dot, { backgroundColor: category.color }]} />
        ) : (
          <IconBubble icon={category.icon} color={category.color} size={36} />
        )}
        <View style={{ flex: 1 }}>
          <Text style={[child ? theme.type.body : theme.type.bodyStrong, { color: theme.colors.textPrimary }]}>{category.name}</Text>
          {budgetLabel(category) && <MutedText style={{ fontSize: 13 }}>{budgetLabel(category)}</MutedText>}
        </View>
        {reordering ? (
          <>
            <IconButton icon="chevron-up" accessibilityLabel={`Subir ${category.name}`} onPress={() => run('categories.move', () => repos.categories.move(category.id, 'up'))} disabled={busy || index === 0} size={20} color={theme.colors.primary} />
            <IconButton icon="chevron-down" accessibilityLabel={`Descer ${category.name}`} onPress={() => run('categories.move', () => repos.categories.move(category.id, 'down'))} disabled={busy || index === siblings - 1} size={20} color={theme.colors.primary} />
          </>
        ) : (
          <IconButton icon="ellipsis-horizontal-circle-outline" accessibilityLabel={`Ações de ${category.name}`} onPress={() => setActionsFor(category)} size={22} color={theme.colors.primary} />
        )}
      </View>
    );
  }

  return (
    <ScrollView style={{ backgroundColor: theme.colors.background }} contentContainerStyle={styles.content}>
      <SegmentedControl
        value={kind}
        onChange={setKind}
        options={[
          { value: 'expense', label: 'Despesas' },
          { value: 'income', label: 'Receitas' },
        ]}
      />
      <MutedText>
        Arquivar tira a categoria das opções de novos lançamentos sem mexer no histórico; juntar move os lançamentos para outra
        categoria. As duas ficam no botão de ações (⋯) de cada categoria.
      </MutedText>
      <Button
        label={reordering ? 'Concluir ordem' : 'Reordenar'}
        icon={reordering ? 'checkmark' : 'list-outline'}
        variant="secondary"
        onPress={() => setReordering((v) => !v)}
      />

      {active.map(({ category, children }, i) => (
        <Card key={category.id} style={{ gap: 4, paddingVertical: 8 }}>
          <Row category={category} index={i} siblings={active.length} />
          {children.map((child, j) => (
            <Row key={child.id} category={child} child index={j} siblings={children.length} />
          ))}
          {!reordering && (
            <View style={styles.child}>
              <Button label="Subcategoria" icon="add" variant="ghost" onPress={() => openCategory({ id: 'new', parentId: category.id })} />
            </View>
          )}
        </Card>
      ))}

      <Button
        label={kind === 'expense' ? 'Nova categoria de despesa' : 'Nova categoria de receita'}
        variant="secondary"
        icon="add"
        onPress={() => openCategory({ id: 'new', kind })}
      />

      {archived.length > 0 && (
        <Section title="Arquivadas">
          <Card style={{ gap: 4, paddingVertical: 8 }}>
            {archived.map((c) => (
              <View key={c.id} style={styles.row}>
                <IconBubble icon={c.icon} color={c.color} size={32} />
                <Text style={[theme.type.body, { flex: 1, color: theme.colors.textSecondary }]}>{c.name}</Text>
                <Button label="Restaurar" variant="ghost" onPress={() => run('categories.unarchive', () => repos.categories.setArchived(c.id, false))} />
              </View>
            ))}
          </Card>
        </Section>
      )}

      <BottomSheet visible={!!actionsFor} onClose={() => setActionsFor(null)} title={actionsFor?.name ?? ''}>
        {actionsFor && (
          <>
            <Button label="Editar nome, cor e orçamento" icon="create-outline" variant="secondary" onPress={() => { setActionsFor(null); openCategory({ id: actionsFor.id }); }} />
            <Button label="Juntar com outra categoria" icon="swap-horizontal-outline" variant="secondary" onPress={() => startMerge(actionsFor)} />
            <Button label="Arquivar" icon="download-outline" variant="secondary" onPress={() => archive(actionsFor)} />
          </>
        )}
      </BottomSheet>

      <BottomSheet
        visible={!!mergeFrom}
        onClose={() => setMergeFrom(null)}
        title={`Juntar “${mergeFrom?.category.name ?? ''}” com…`}
        footer={<Button label="Juntar" onPress={confirmMerge} disabled={!mergeInto || busy} />}
      >
        {mergeFrom && (
          <MutedText>
            {mergeFrom.usage.transactions} lançamento(s) passam para a categoria escolhida.
            {mergeFrom.usage.subcategories > 0 ? ` As ${mergeFrom.usage.subcategories} subcategorias também são juntadas.` : ''}
            {mergeFrom.usage.budgets > 0 ? ` ${mergeFrom.usage.budgets} orçamento(s) desta categoria deixam de existir.` : ''} Os totais
            não mudam. Antes, o app guarda um backup completo.
          </MutedText>
        )}
        <ChipRow>
          {mergeTargets.map((c) => (
            <Chip key={c.id} label={c.parentId ? `↳ ${c.name}` : c.name} icon={c.parentId ? undefined : c.icon} color={c.color} selected={mergeInto === c.id} onPress={() => setMergeInto(c.id)} />
          ))}
        </ChipRow>
      </BottomSheet>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: SCREEN_PADDING, gap: 14, paddingBottom: 64, width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 52 },
  child: { paddingLeft: 44 },
  dot: { width: 10, height: 10, borderRadius: 5, marginHorizontal: 13 },
});

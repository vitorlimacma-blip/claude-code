import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { AssistantAction, Evidence } from '../ai/assistant';
import { formatDateBR } from '../domain/dates';
import { formatCents } from '../domain/money';
import { useRepositories } from '../state/DataProvider';
import { useQuery } from '../state/useQuery';
import { BottomSheet } from './BottomSheet';
import { Button, Card, MutedText } from './components';
import { Icon } from './icons';
import { SkeletonRows } from './states';
import { useTheme } from './theme';
import { useToast } from './Toast';
import { presentTransaction } from './transactionPresentation';
import { TransactionRow } from './TransactionRow';
import { logError, userFacingError } from '../platform/errors';

// Pieces of the Assistente that make an answer checkable (briefing §11):
// the evidence behind each number and the changes the assistant proposes.

const KIND_TEXT: Record<Evidence['kind'], { label: string; detail: string }> = {
  fato: { label: 'Fato', detail: 'Calculado a partir dos lançamentos registrados.' },
  estimativa: { label: 'Estimativa', detail: 'Depende de premissas, como contas previstas e o gasto de um mês típico.' },
};

/** "Fato" or "Estimativa", told apart by text and color. */
export function KindBadge({ kind }: { kind: Evidence['kind'] }) {
  const theme = useTheme();
  const estimate = kind === 'estimativa';
  return (
    <View style={[styles.badge, { backgroundColor: estimate ? theme.colors.infoSurface : theme.colors.primarySoft, borderRadius: theme.radius.sm }]}>
      <Text style={[theme.type.caption, { color: estimate ? theme.colors.info : theme.colors.onPrimarySoft, fontWeight: '700' }]}>
        {KIND_TEXT[kind].label}
      </Text>
    </View>
  );
}

/** One evidence under an answer: its reference, kind and title; opens the sheet. */
export function EvidenceChip({ evidence, onPress }: { evidence: Evidence; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Base do cálculo ${evidence.ref}: ${evidence.title}`}
      style={({ pressed }) => [
        styles.chip,
        { borderColor: theme.colors.border, borderRadius: theme.radius.md, backgroundColor: pressed ? theme.colors.pressed : theme.colors.surface },
      ]}
    >
      <Text style={[theme.type.caption, { color: theme.colors.primary, fontWeight: '700' }]}>{evidence.ref}</Text>
      <KindBadge kind={evidence.kind} />
      <Text style={[theme.type.caption, { color: theme.colors.textPrimary, flexShrink: 1 }]} numberOfLines={1}>
        {evidence.title}
      </Text>
      <Icon name="chevron-forward" size={14} color={theme.colors.textSecondary} />
    </Pressable>
  );
}

const MAX_LISTED = 100;

/** Period, criteria and transactions behind one number of an answer. */
export function EvidenceSheet({ evidence, onClose }: { evidence: Evidence | null; onClose: () => void }) {
  const theme = useTheme();
  const { data } = useQuery(
    async (r) => {
      if (!evidence || evidence.transactionIds.length === 0) return null;
      const ids = new Set(evidence.transactionIds);
      const [rows, categories, accounts] = await Promise.all([
        evidence.period
          ? r.transactions.list({ from: evidence.period.from, to: evidence.period.to })
          : Promise.all(evidence.transactionIds.slice(0, MAX_LISTED).map((id) => r.transactions.get(id))),
        r.categories.list(),
        r.accounts.list({ includeArchived: true }),
      ]);
      return {
        rows: rows.filter((t): t is NonNullable<typeof t> => !!t && ids.has(t.id)),
        categoryById: new Map(categories.map((c) => [c.id, c])),
        accountById: new Map(accounts.map((a) => [a.id, a])),
      };
    },
    ['transactions', 'categories', 'accounts'],
    [evidence?.ref, evidence?.title]
  );
  if (!evidence) return null;
  const total = evidence.transactionIds.length;
  return (
    <BottomSheet visible onClose={onClose} title={evidence.title}>
      <View style={{ gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <KindBadge kind={evidence.kind} />
          <MutedText style={{ flex: 1 }}>{KIND_TEXT[evidence.kind].detail}</MutedText>
        </View>
        {evidence.period && (
          <Text style={[theme.type.body, { color: theme.colors.textPrimary }]}>
            Período: {formatDateBR(evidence.period.from)} a {formatDateBR(evidence.period.to)}
          </Text>
        )}
        {evidence.criteria.length > 0 && (
          <View style={{ gap: 4 }}>
            <Text style={[theme.type.bodyStrong, { color: theme.colors.textPrimary }]}>Critérios</Text>
            {evidence.criteria.map((c, i) => (
              <Text key={i} style={[theme.type.label, { color: theme.colors.textSecondary }]}>
                • {c}
              </Text>
            ))}
          </View>
        )}
        <Text style={[theme.type.bodyStrong, { color: theme.colors.textPrimary }]}>
          {total === 0 ? 'Não é uma soma de lançamentos' : `${total} lançamento(s)`}
        </Text>
        {total > 0 &&
          (!data ? (
            <SkeletonRows count={3} />
          ) : (
            <View>
              {data.rows.slice(0, MAX_LISTED).map((t) => (
                <TransactionRow
                  key={t.id}
                  {...presentTransaction({ transaction: t }, data.categoryById, data.accountById)}
                  onPress={() => {
                    onClose();
                    router.push({ pathname: '/transaction/[id]', params: { id: t.id } });
                  }}
                />
              ))}
              {total > MAX_LISTED && <MutedText>Mostrando {MAX_LISTED} de {total}.</MutedText>}
            </View>
          ))}
      </View>
    </BottomSheet>
  );
}

export type ActionState = 'pending' | 'applied' | 'discarded';

/**
 * A change proposed by the assistant. Nothing is written until the user
 * confirms; a confirmed recategorization can be undone from the toast.
 */
export function ActionCard({
  action,
  state,
  onStateChange,
  onShowItems,
}: {
  action: AssistantAction;
  state: ActionState;
  onStateChange: (state: ActionState) => void;
  /** Opens the transactions the proposal would change. */
  onShowItems?: () => void;
}) {
  const theme = useTheme();
  const repos = useRepositories();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  if (action.kind === 'draft') {
    const d = action.draft;
    return (
      <Card style={{ gap: 8 }}>
        <View style={styles.cardHeader}>
          <Icon name="create-outline" size={18} color={theme.colors.primary} />
          <Text style={[theme.type.bodyStrong, { color: theme.colors.textPrimary, flex: 1 }]}>Rascunho de lançamento</Text>
        </View>
        <Text style={[theme.type.body, { color: theme.colors.textPrimary }]}>
          {d.type === 'income' ? 'Receita' : 'Despesa'} de {formatCents(d.amount)} · {d.description || 'sem descrição'} · {formatDateBR(d.date)}
        </Text>
        <MutedText>Nada foi gravado. Confira a conta e a categoria no formulário e salve.</MutedText>
        <Button
          label="Abrir rascunho"
          variant="secondary"
          icon="create-outline"
          onPress={() => router.push({ pathname: '/transaction/[id]', params: { id: 'new', draft: JSON.stringify(d) } })}
        />
      </Card>
    );
  }

  const count = action.items.length;
  async function apply() {
    if (action.kind !== 'recategorize') return;
    setBusy(true);
    try {
      const changed = await repos.transactions.setCategories(
        action.items.map((i) => ({ id: i.transactionId, categoryId: action.toCategoryId, categorySource: 'manual' }))
      );
      onStateChange('applied');
      toast({
        message: `${changed} lançamento(s) movido(s) para ${action.toLabel}.`,
        tone: 'success',
        action: {
          label: 'Desfazer',
          onPress: async () => {
            try {
              await repos.transactions.setCategories(
                action.items.map((i) => ({ id: i.transactionId, categoryId: i.previousCategoryId, categorySource: i.previousCategorySource }))
              );
              onStateChange('pending');
              toast({ message: 'Categorias restauradas.' });
            } catch (error) {
              logError('assistant.undoRecategorize', error);
              toast({ message: userFacingError(error, 'Não foi possível alterar as categorias.'), tone: 'error' });
            }
          },
        },
      });
    } catch (error) {
      logError('assistant.recategorize', error);
      toast({ message: userFacingError(error, 'Não foi possível alterar as categorias.'), tone: 'error' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card style={{ gap: 8 }}>
      <View style={styles.cardHeader}>
        <Icon name="pricetag-outline" size={18} color={theme.colors.primary} />
        <Text style={[theme.type.bodyStrong, { color: theme.colors.textPrimary, flex: 1 }]}>Proposta de recategorização</Text>
      </View>
      <Text style={[theme.type.body, { color: theme.colors.textPrimary }]}>
        Mover {count} lançamento(s), somando {formatCents(action.total)}, para {action.toLabel}.
      </Text>
      {state === 'pending' && <MutedText>Nada foi alterado ainda. Confira os lançamentos antes de confirmar.</MutedText>}
      {state === 'applied' && <MutedText>Aplicada. Para voltar, use Desfazer no aviso ou recategorize os lançamentos.</MutedText>}
      {state === 'discarded' && <MutedText>Descartada. Nada foi alterado.</MutedText>}
      {onShowItems && <Button label="Ver os lançamentos" variant="ghost" icon="list-outline" onPress={onShowItems} />}
      {state === 'pending' && (
        <View style={styles.buttons}>
          <View style={{ flex: 1 }}>
            <Button label="Descartar" variant="secondary" onPress={() => onStateChange('discarded')} disabled={busy} />
          </View>
          <View style={{ flex: 1 }}>
            <Button label="Confirmar" onPress={apply} disabled={busy} haptic />
          </View>
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  badge: { paddingHorizontal: 6, paddingVertical: 2 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, paddingHorizontal: 10, minHeight: 36, alignSelf: 'flex-start', maxWidth: '100%' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  buttons: { flexDirection: 'row', gap: 8 },
});

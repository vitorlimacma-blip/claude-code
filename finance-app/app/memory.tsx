import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { categoryPath } from '../src/ai/categorizer';
import { LOCAL_USER_SCOPE } from '../src/ai/session';
import type { Category, MemoryItem } from '../src/domain/types';
import { confirm } from '../src/platform/dialogs';
import { logError, userFacingError } from '../src/platform/errors';
import { useRepositories } from '../src/state/DataProvider';
import { useCategorizer } from '../src/state/useCategorizer';
import { useQuery } from '../src/state/useQuery';
import { BottomSheet } from '../src/ui/BottomSheet';
import { Button, Card, MutedText, SectionTitle, TextField } from '../src/ui/components';
import { CONTENT_MAX_WIDTH } from '../src/ui/layout';
import { useTheme } from '../src/ui/theme';
import { useToast } from '../src/ui/Toast';

const TYPE_LABELS: Record<MemoryItem['type'], string> = {
  preference: 'Preferência',
  goal: 'Objetivo',
  correction: 'Correção',
  rule_proposal: 'Regra de categoria',
};

/**
 * Ajustes › Memória do assistente (AI contract §5): review, edit and delete
 * what the assistant keeps, and correct or forget what the categorizer learned.
 * Nothing proposed counts until confirmed here or in the conversation.
 */
export default function MemoryScreen() {
  const theme = useTheme();
  const repos = useRepositories();
  const toast = useToast();
  const { learnedRules } = useCategorizer();
  const { data } = useQuery(
    async (r) => {
      const [items, categories] = await Promise.all([r.memory.list(LOCAL_USER_SCOPE), r.categories.list()]);
      return { items, categories };
    },
    ['memory_items', 'categories']
  );
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [correcting, setCorrecting] = useState<string | null>(null);

  const byId = useMemo(() => new Map((data?.categories ?? []).map((c) => [c.id, c])), [data]);
  const label = (id: string | null) => (id && byId.get(id) ? categoryPath(byId.get(id)!, byId) : 'sem sugestão automática');
  const rules = (data?.items ?? []).filter((m) => m.type === 'rule_proposal' && m.value.kind === 'rule');
  const ruleFor = new Map(rules.map((m) => [(m.value as { merchant: string }).merchant, m]));
  const proposals = (data?.items ?? []).filter((m) => m.reviewStatus === 'proposed' && m.type !== 'rule_proposal');
  const confirmed = (data?.items ?? []).filter((m) => m.reviewStatus === 'confirmed' && m.type !== 'rule_proposal');

  async function run(action: () => Promise<void>, done: string) {
    try {
      await action();
      toast({ message: done });
    } catch (error) {
      logError('memory', error);
      toast({ message: userFacingError(error, 'Não foi possível salvar.'), tone: 'error' });
    }
  }

  /** A confirmed rule for a merchant: a category, or null to stop suggesting. Replaces any previous one. */
  async function setRule(merchant: string, categoryId: string | null) {
    const previous = ruleFor.get(merchant);
    if (previous) await repos.memory.remove(LOCAL_USER_SCOPE, previous.id);
    const item = await repos.memory.propose(LOCAL_USER_SCOPE, {
      type: 'rule_proposal',
      value: { kind: 'rule', merchant, categoryId },
      scope: 'categorization',
      evidenceRef: 'ajustes',
    });
    await repos.memory.confirm(LOCAL_USER_SCOPE, item.id);
  }

  async function removeAll() {
    const ok = await confirm('Apagar toda a memória', 'Apaga preferências, objetivos, correções e regras guardadas. Seus lançamentos não mudam.', {
      confirmLabel: 'Apagar',
      destructive: true,
    });
    if (ok) await run(() => repos.memory.removeAll(LOCAL_USER_SCOPE), 'Memória apagada.');
  }

  return (
    <ScrollView style={{ backgroundColor: theme.colors.background }} contentContainerStyle={styles.content}>
      <MutedText>
        O que o assistente guarda sobre você fica só neste aparelho, com origem e data. Nada proposto vale antes da sua
        confirmação, e apagar remove de vez: a memória deixa de influenciar respostas e sugestões. Guardar uma memória não
        treina nenhum modelo.
      </MutedText>

      {proposals.length > 0 && (
        <>
          <SectionTitle>Aguardando sua confirmação</SectionTitle>
          {proposals.map((m) => (
            <Card key={m.id} style={{ gap: 8 }}>
              <MemoryText item={m} />
              <View style={styles.buttons}>
                <View style={{ flex: 1 }}>
                  <Button label="Descartar" variant="secondary" onPress={() => run(() => repos.memory.remove(LOCAL_USER_SCOPE, m.id), 'Descartada.')} />
                </View>
                <View style={{ flex: 1 }}>
                  <Button label="Guardar" onPress={() => run(() => repos.memory.confirm(LOCAL_USER_SCOPE, m.id), 'Guardada.')} />
                </View>
              </View>
            </Card>
          ))}
        </>
      )}

      <SectionTitle>Guardado</SectionTitle>
      {confirmed.length === 0 ? (
        <MutedText>Nada guardado. Peça ao assistente, por exemplo: &quot;lembre que prefiro preservar minha reserva&quot;.</MutedText>
      ) : (
        confirmed.map((m) => (
          <Card key={m.id} style={{ gap: 8 }}>
            {editing?.id === m.id ? (
              <>
                <TextField value={editing.text} onChangeText={(text) => setEditing({ id: m.id, text })} accessibilityLabel="Editar memória" multiline />
                <View style={styles.buttons}>
                  <View style={{ flex: 1 }}>
                    <Button label="Cancelar" variant="secondary" onPress={() => setEditing(null)} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Button
                      label="Salvar"
                      onPress={() =>
                        run(async () => {
                          await repos.memory.edit(LOCAL_USER_SCOPE, m.id, { kind: 'text', text: editing.text });
                          setEditing(null);
                        }, 'Memória atualizada.')
                      }
                    />
                  </View>
                </View>
              </>
            ) : (
              <>
                <MemoryText item={m} />
                <View style={styles.buttons}>
                  {m.value.kind === 'text' && (
                    <View style={{ flex: 1 }}>
                      <Button label="Editar" variant="secondary" onPress={() => setEditing({ id: m.id, text: (m.value as { text: string }).text })} />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Button label="Apagar" variant="secondary" onPress={() => run(() => repos.memory.remove(LOCAL_USER_SCOPE, m.id), 'Memória apagada.')} />
                  </View>
                </View>
              </>
            )}
          </Card>
        ))
      )}

      <SectionTitle>O que o app aprendeu sobre categorias</SectionTitle>
      <MutedText>
        A partir das suas escolhas, o app sugere a categoria de cada estabelecimento. Corrija uma sugestão ou peça para ele
        esquecer; uma regra confirmada vale para os próximos lançamentos e não muda o histórico.
      </MutedText>
      {rules.length > 0 && (
        <Card style={{ gap: 4, paddingVertical: 8 }}>
          {rules.map((m) => {
            const v = m.value as { merchant: string; categoryId: string | null };
            return (
              <View key={m.id} style={styles.ruleRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[theme.type.bodyStrong, { color: theme.colors.textPrimary }]}>{v.merchant}</Text>
                  <Text style={[theme.type.label, { color: theme.colors.textSecondary }]}>Regra sua: {label(v.categoryId)}</Text>
                </View>
                <Pressable accessibilityRole="button" hitSlop={8} onPress={() => run(() => repos.memory.remove(LOCAL_USER_SCOPE, m.id), 'Regra desfeita.')}>
                  <Text style={[theme.type.label, { color: theme.colors.primary }]}>Desfazer</Text>
                </Pressable>
              </View>
            );
          })}
        </Card>
      )}
      {learnedRules.filter((r) => !ruleFor.has(r.merchant)).length === 0 ? (
        <MutedText>Ainda não há estabelecimentos aprendidos.</MutedText>
      ) : (
        <Card style={{ gap: 4, paddingVertical: 8 }}>
          {learnedRules
            .filter((r) => !ruleFor.has(r.merchant))
            .slice(0, 50)
            .map((r) => (
              <View key={r.merchant} style={styles.ruleRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[theme.type.bodyStrong, { color: theme.colors.textPrimary }]}>{r.merchant}</Text>
                  <Text style={[theme.type.label, { color: theme.colors.textSecondary }]}>
                    {label(r.categoryId)} · {r.agreeing} de {r.total} lançamento(s)
                  </Text>
                </View>
                <Pressable accessibilityRole="button" hitSlop={8} onPress={() => setCorrecting(r.merchant)}>
                  <Text style={[theme.type.label, { color: theme.colors.primary }]}>Corrigir</Text>
                </Pressable>
                <Pressable accessibilityRole="button" hitSlop={8} onPress={() => run(() => setRule(r.merchant, null), 'O app não vai mais sugerir para este estabelecimento.')}>
                  <Text style={[theme.type.label, { color: theme.colors.primary }]}>Esquecer</Text>
                </Pressable>
              </View>
            ))}
        </Card>
      )}

      <Button label="Apagar toda a memória" variant="ghost" icon="trash-outline" onPress={removeAll} />

      <CategoryPicker
        visible={correcting !== null}
        merchant={correcting ?? ''}
        categories={data?.categories ?? []}
        onClose={() => setCorrecting(null)}
        onPick={(categoryId) => {
          const merchant = correcting!;
          setCorrecting(null);
          void run(() => setRule(merchant, categoryId), 'Regra salva para os próximos lançamentos.');
        }}
      />
    </ScrollView>
  );
}

function MemoryText({ item }: { item: MemoryItem }) {
  const theme = useTheme();
  const text = item.value.kind === 'text' ? item.value.text : item.value.kind === 'correction' ? item.value.note : '';
  return (
    <View style={{ gap: 2 }}>
      <Text style={[theme.type.body, { color: theme.colors.textPrimary }]}>{text}</Text>
      <Text style={[theme.type.caption, { color: theme.colors.textSecondary }]}>
        {TYPE_LABELS[item.type]} · origem: {item.evidenceRef ?? '—'} · {new Date(item.createdAt).toLocaleDateString('pt-BR')}
        {item.version > 1 ? ` · editada ${item.version - 1}x` : ''}
      </Text>
    </View>
  );
}

function CategoryPicker({
  visible,
  merchant,
  categories,
  onClose,
  onPick,
}: {
  visible: boolean;
  merchant: string;
  categories: Category[];
  onClose: () => void;
  onPick: (categoryId: string) => void;
}) {
  const theme = useTheme();
  const byId = new Map(categories.map((c) => [c.id, c]));
  const options = categories.filter((c) => !c.archived && !c.deletedAt).sort((a, b) => categoryPath(a, byId).localeCompare(categoryPath(b, byId), 'pt-BR'));
  return (
    <BottomSheet visible={visible} onClose={onClose} title={`Categoria de ${merchant}`}>
      <View>
        {options.map((c) => (
          <Pressable key={c.id} onPress={() => onPick(c.id)} accessibilityRole="button" style={styles.pick}>
            <Text style={[theme.type.body, { color: theme.colors.textPrimary }]}>{categoryPath(c, byId)}</Text>
          </Pressable>
        ))}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, paddingBottom: 48, width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
  buttons: { flexDirection: 'row', gap: 8 },
  ruleRow: { flexDirection: 'row', alignItems: 'center', gap: 16, minHeight: 56, paddingHorizontal: 8 },
  pick: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 4 },
});

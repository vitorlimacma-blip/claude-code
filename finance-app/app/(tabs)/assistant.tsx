import { router } from 'expo-router';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { askAssistant, TOOL_LABELS, type AssistantAction, type AssistantAnswer, type Evidence } from '../../src/ai/assistant';
import { answerLocally, LOCAL_QUESTIONS, type LocalQuestionId } from '../../src/ai/assistant/localAnswers';
import { PROVIDER_LABELS } from '../../src/ai/config';
import { describeAIError } from '../../src/ai/types';
import { logError } from '../../src/platform/errors';
import { useAI } from '../../src/state/AIContext';
import { useRepositories } from '../../src/state/DataProvider';
import { ActionCard, EvidenceChip, EvidenceSheet, type ActionState } from '../../src/ui/assistant';
import { Button, Card, Chip, ChipRow, MutedText, Screen, Title } from '../../src/ui/components';
import { Icon } from '../../src/ui/icons';
import { RichText } from '../../src/ui/RichText';
import { useTheme } from '../../src/ui/theme';
import { useToastOffset } from '../../src/ui/Toast';

interface Turn {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  answer?: AssistantAnswer;
  error?: boolean;
}

/** Questions sent to the AI; the purchase one is put in the box so the amount can be edited first. */
const SUGGESTIONS: { label: string; prefill?: string }[] = [
  { label: 'O que mudou neste mês?' },
  { label: 'Quais gastos estão pesando?' },
  { label: 'Como esta compra afetaria minha margem?', prefill: 'Como uma compra de R$ 500,00 à vista afetaria minha margem?' },
  { label: 'Como estão meus orçamentos este mês?' },
  { label: 'Quais foram meus 5 maiores gastos deste mês?' },
];

let nextId = 0;

export default function AssistantScreen() {
  const theme = useTheme();
  const repos = useRepositories();
  const { provider, settings, loaded } = useAI();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [evidence, setEvidence] = useState<Evidence | null>(null);
  const [actionStates, setActionStates] = useState<Record<string, ActionState>>({});
  const listRef = useRef<FlatList<Turn>>(null);
  const aiOff = loaded && !provider;
  // Keeps "Desfazer" toasts above the message box.
  useToastOffset(aiOff ? 0 : 64);

  function finish() {
    setBusy(false);
    setProgress(null);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
  }

  async function send(text: string) {
    const question = text.trim();
    if (!question || busy || !provider) return;
    const userTurn: Turn = { id: String(nextId++), role: 'user', text: question };
    const conversation = [...turns.filter((t) => !t.error), userTurn];
    setTurns((prev) => [...prev, userTurn]);
    setInput('');
    setBusy(true);
    setProgress('Entendendo a pergunta');
    try {
      const answer = await askAssistant({
        provider,
        repos,
        history: conversation.map((t) => ({ role: t.role, text: t.text })),
        webSearch: settings.webSearch,
        onToolCall: (name) => setProgress(TOOL_LABELS[name] ?? 'Consultando seus dados'),
      });
      setTurns((prev) => [...prev, { id: String(nextId++), role: 'assistant', text: answer.text || '(sem resposta)', answer }]);
    } catch (error) {
      setTurns((prev) => [...prev, { id: String(nextId++), role: 'assistant', text: describeAIError(error), error: true }]);
    } finally {
      finish();
    }
  }

  async function askLocal(id: LocalQuestionId, label: string) {
    if (busy) return;
    setTurns((prev) => [...prev, { id: String(nextId++), role: 'user', text: label }]);
    setBusy(true);
    setProgress('Calculando no aparelho');
    try {
      const answer = await answerLocally(id, repos);
      setTurns((prev) => [...prev, { id: String(nextId++), role: 'assistant', text: answer.text, answer }]);
    } catch (error) {
      logError('assistant.local', error);
      setTurns((prev) => [...prev, { id: String(nextId++), role: 'assistant', text: 'Não foi possível calcular agora. Tente de novo.', error: true }]);
    } finally {
      finish();
    }
  }

  const showActionItems = (action: AssistantAction) => {
    if (action.kind !== 'recategorize') return;
    setEvidence({
      ref: action.id,
      title: `Lançamentos da proposta (${action.items.length})`,
      kind: 'fato',
      period: null,
      criteria: [`Iriam para ${action.toLabel}.`],
      transactionIds: action.items.map((i) => i.transactionId),
      amounts: [],
    });
  };

  return (
    <Screen scroll={false}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <FlatList
          ref={listRef}
          data={turns}
          keyExtractor={(t) => t.id}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          ListHeaderComponent={
            <View style={{ gap: 10 }}>
              <Title
                right={
                  turns.length > 0 ? (
                    <Pressable onPress={() => setTurns([])} hitSlop={8} accessibilityRole="button" accessibilityLabel="Nova conversa">
                      <Icon name="create-outline" size={22} color={theme.colors.primary} />
                    </Pressable>
                  ) : undefined
                }
              >
                Assistente
              </Title>
              {provider && (
                <MutedText>
                  {PROVIDER_LABELS[provider.id]}
                  {settings.webSearch ? ' · com busca na internet' : ''} · os números vêm dos seus lançamentos, calculados no aparelho
                </MutedText>
              )}
              {aiOff && (
                <Card style={{ gap: 10 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Icon name="shield-checkmark-outline" size={20} color={theme.colors.primary} />
                    <Text style={[theme.type.bodyStrong, { color: theme.colors.textPrimary, flex: 1 }]}>IA desligada</Text>
                  </View>
                  <MutedText>
                    As respostas abaixo são calculadas no aparelho, sem enviar dados a ninguém. Para perguntas livres, como
                    &quot;quanto gastei com mercado este ano?&quot;, ative um provedor (Claude ou ChatGPT) com a sua chave.
                  </MutedText>
                  <Button label="Configurar a IA" variant="secondary" icon="key-outline" onPress={() => router.push('/ai-settings')} />
                </Card>
              )}
              {aiOff ? (
                <ChipRow>
                  {LOCAL_QUESTIONS.map((q) => (
                    <Chip key={q.id} label={q.label} selected={false} onPress={() => askLocal(q.id, q.label)} />
                  ))}
                </ChipRow>
              ) : (
                turns.length === 0 && (
                  <View style={{ gap: 10, marginTop: 4 }}>
                    <MutedText>Experimente perguntar:</MutedText>
                    <ChipRow>
                      {[...SUGGESTIONS, ...(settings.webSearch ? [{ label: 'Quanto está a Selic hoje?' }] : [])].map((s) => (
                        <Chip key={s.label} label={s.label} selected={false} onPress={() => (s.prefill ? setInput(s.prefill) : send(s.label))} />
                      ))}
                    </ChipRow>
                  </View>
                )
              )}
            </View>
          }
          renderItem={({ item }) => (
            <TurnView
              turn={item}
              onEvidence={setEvidence}
              actionStates={actionStates}
              onActionState={(id, state) => setActionStates((prev) => ({ ...prev, [`${item.id}:${id}`]: state }))}
              onShowActionItems={showActionItems}
            />
          )}
          ListFooterComponent={
            busy ? (
              <View style={styles.progress} accessibilityLiveRegion="polite">
                <ActivityIndicator size="small" color={theme.colors.primary} />
                <MutedText>{progress}…</MutedText>
              </View>
            ) : undefined
          }
        />
        {!aiOff && (
          <View style={[styles.inputBar, { borderTopColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
            <TextInput
              style={[styles.input, { color: theme.colors.textPrimary, backgroundColor: theme.colors.surfaceMuted }]}
              placeholder="Pergunte sobre suas finanças…"
              placeholderTextColor={theme.colors.textSecondary}
              accessibilityLabel="Pergunta para o assistente"
              value={input}
              onChangeText={setInput}
              multiline
              editable={!busy}
              onKeyPress={(e) => {
                // On the computer, Enter sends and Shift+Enter breaks the line.
                const native = e.nativeEvent as { key: string; shiftKey?: boolean };
                if (Platform.OS === 'web' && native.key === 'Enter' && !native.shiftKey) {
                  (e as unknown as { preventDefault?: () => void }).preventDefault?.();
                  send(input);
                }
              }}
            />
            <Pressable
              onPress={() => send(input)}
              disabled={busy || !input.trim()}
              accessibilityRole="button"
              accessibilityLabel="Enviar"
              style={[styles.send, { backgroundColor: theme.colors.primary, opacity: busy || !input.trim() ? 0.4 : 1 }]}
            >
              <Icon name="arrow-up" size={20} color={theme.colors.onPrimary} />
            </Pressable>
          </View>
        )}
      </KeyboardAvoidingView>
      <EvidenceSheet evidence={evidence} onClose={() => setEvidence(null)} />
    </Screen>
  );
}

/** The short answer comes first; the rest (after the first blank line) opens on request. */
function splitAnswer(text: string): { short: string; details: string } {
  const at = text.search(/\n\s*\n/);
  return at < 0 ? { short: text, details: '' } : { short: text.slice(0, at).trim(), details: text.slice(at).trim() };
}

function TurnView({
  turn,
  onEvidence,
  actionStates,
  onActionState,
  onShowActionItems,
}: {
  turn: Turn;
  onEvidence: (evidence: Evidence) => void;
  actionStates: Record<string, ActionState>;
  onActionState: (actionId: string, state: ActionState) => void;
  onShowActionItems: (action: AssistantAction) => void;
}) {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(false);
  if (turn.role === 'user') {
    return (
      <View style={[styles.bubbleRow, { justifyContent: 'flex-end' }]}>
        <View style={[styles.bubble, { backgroundColor: theme.colors.primary }]}>
          <Text style={{ color: theme.colors.onPrimary, fontSize: 15 }}>{turn.text}</Text>
        </View>
      </View>
    );
  }

  const answer = turn.answer;
  const { short, details } = splitAnswer(turn.text);
  const byRef = new Map((answer?.evidences ?? []).map((e) => [e.ref, e]));
  const openRef = (ref: string) => {
    const e = byRef.get(ref);
    if (e) onEvidence(e);
  };
  // Cited evidence first; when the text cites none, every result consulted.
  const cited = (answer?.check.refs ?? []).map((r) => byRef.get(r)).filter((e): e is Evidence => !!e);
  const chips = cited.length > 0 ? cited : (answer?.evidences ?? []);
  const unverified = answer?.check.unverified ?? [];

  return (
    <View style={{ gap: 8 }}>
      <View style={styles.bubbleRow}>
        <View
          style={[
            styles.bubble,
            { backgroundColor: theme.colors.surface, borderColor: turn.error ? theme.colors.danger : theme.colors.border },
          ]}
        >
          <RichText text={expanded || !details ? turn.text : short} color={turn.error ? theme.colors.danger : undefined} onRef={answer ? openRef : undefined} />
          {!!details && (
            <Pressable onPress={() => setExpanded((v) => !v)} accessibilityRole="button" hitSlop={8} style={styles.more}>
              <Text style={[theme.type.label, { color: theme.colors.primary }]}>{expanded ? 'Mostrar menos' : 'Ver detalhes'}</Text>
              <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={theme.colors.primary} />
            </Pressable>
          )}
          {unverified.length > 0 && (
            <View style={[styles.warning, { backgroundColor: theme.colors.warningSurface, borderRadius: theme.radius.md }]}>
              <Icon name="alert-outline" size={18} color={theme.colors.warning} />
              <Text style={[theme.type.label, { color: theme.colors.warning, flex: 1 }]}>
                Não conferido: {unverified.map((a) => a.text).join(', ')} não corresponde aos cálculos do app. Confira na base
                do cálculo antes de usar.
              </Text>
            </View>
          )}
          {chips.length > 0 && (
            <View style={{ gap: 6, marginTop: 8 }}>
              <Text style={[theme.type.caption, { color: theme.colors.textSecondary }]}>Base do cálculo:</Text>
              {chips.slice(0, 6).map((e) => (
                <EvidenceChip key={e.ref} evidence={e} onPress={() => onEvidence(e)} />
              ))}
            </View>
          )}
          {answer?.local && (
            <Text style={[theme.type.caption, { color: theme.colors.textSecondary, marginTop: 6 }]}>Calculado no aparelho, sem IA.</Text>
          )}
          {!!answer?.sources.length && (
            <View style={{ marginTop: 6, gap: 2 }}>
              <MutedText style={{ fontSize: 11 }}>Fontes da internet:</MutedText>
              {answer.sources.slice(0, 5).map((s) => (
                <Text
                  key={s.url}
                  onPress={() => Linking.openURL(s.url)}
                  accessibilityRole="link"
                  style={{ color: theme.colors.primary, fontSize: 12 }}
                  numberOfLines={1}
                >
                  {s.title || s.url}
                </Text>
              ))}
            </View>
          )}
        </View>
      </View>
      {answer?.actions.map((action) => (
        <ActionCard
          key={action.id}
          action={action}
          state={actionStates[`${turn.id}:${action.id}`] ?? 'pending'}
          onStateChange={(state) => onActionState(action.id, state)}
          onShowItems={action.kind === 'recategorize' ? () => onShowActionItems(action) : undefined}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { padding: 16, gap: 12, paddingBottom: 24 },
  progress: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  bubbleRow: { flexDirection: 'row' },
  bubble: { maxWidth: '92%', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: 'transparent' },
  more: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6, alignSelf: 'flex-start', minHeight: 32 },
  warning: { flexDirection: 'row', gap: 8, padding: 10, marginTop: 8 },
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 10, borderTopWidth: 1 },
  input: { flex: 1, maxHeight: 120, borderRadius: 20, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10, fontSize: 15 },
  send: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});

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
import type { AssistantAction, AssistantAnswer, Evidence } from '../../src/ai/assistant';
import { PROVIDER_LABELS, webSearchAllowed } from '../../src/ai/config';
import { answerQuestion } from '../../src/ai/engine/answer';
import { LOCAL_USER_SCOPE } from '../../src/ai/session';
import { describeAIError } from '../../src/ai/types';
import { logError, userFacingError } from '../../src/platform/errors';
import { useAI } from '../../src/state/AIContext';
import { useRepositories } from '../../src/state/DataProvider';
import { ActionCard, EvidenceChip, EvidenceSheet, type ActionState } from '../../src/ui/assistant';
import { Button, Card, Chip, ChipRow, MutedText, Screen, TextField, Title } from '../../src/ui/components';
import { Icon } from '../../src/ui/icons';
import { RichText } from '../../src/ui/RichText';
import { useTheme } from '../../src/ui/theme';
import { useToast, useToastOffset } from '../../src/ui/Toast';

interface Turn {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  answer?: AssistantAnswer;
  error?: boolean;
}

/** Questions the rules answer on the device; the purchase one goes to the box so the amount can be edited first. */
const SUGGESTIONS: { label: string; prefill?: string }[] = [
  { label: 'O que mudou neste mês?' },
  { label: 'Quanto gastei este mês?' },
  { label: 'Como estão meus orçamentos?' },
  { label: 'Quanto vou ter no fim do mês?' },
  {
    label: 'Posso gastar R$ 200 agora?',
    prefill: 'Posso gastar R$ 200,00 agora?',
  },
  { label: 'Quanto falta para minhas metas?' },
];

const MODE_TEXT = {
  deterministic: 'Calculado por regras no aparelho, sem IA.',
  local_model: Platform.OS === 'web' ? 'Escrito pelo modelo local deste computador; valores conferidos pelo app.' : 'Escrito pelo modelo local do aparelho; valores conferidos pelo app.',
  external_opt_in: 'Provedor externo, com a sua permissão.',
} as const;

const FEEDBACK_KEY = 'assistant.feedback';
const MAX_FEEDBACK = 200;

let nextId = 0;

export default function AssistantScreen() {
  const theme = useTheme();
  const repos = useRepositories();
  const { provider, settings, loaded, localEngine } = useAI();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [evidence, setEvidence] = useState<Evidence | null>(null);
  const [actionStates, setActionStates] = useState<Record<string, ActionState>>({});
  const listRef = useRef<FlatList<Turn>>(null);
  /** Increments on every request and on cancel: a late answer to an old request is dropped. */
  const requestId = useRef(0);
  // Keeps "Desfazer" toasts above the message box.
  useToastOffset(64);

  function finish() {
    setBusy(false);
    setProgress(null);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
  }

  async function send(text: string) {
    const question = text.trim();
    if (!question || busy || !loaded) return;
    const userTurn: Turn = {
      id: String(nextId++),
      role: 'user',
      text: question,
    };
    const conversation = [...turns.filter((t) => !t.error), userTurn];
    setTurns((prev) => [...prev, userTurn]);
    setInput('');
    setBusy(true);
    setProgress('Calculando no aparelho');
    const mine = ++requestId.current;
    try {
      const answer = await answerQuestion({
        question,
        history: conversation.map((t) => ({ role: t.role, text: t.text })),
        repos,
        provider,
        webSearch: webSearchAllowed(settings),
        onProgress: setProgress,
        localEngine,
        // The model's text is shown only after the app checks it, so streaming just updates the progress line.
        onToken: () => setProgress('Escrevendo com o modelo local'),
      });
      if (mine !== requestId.current) return;
      setTurns((prev) => [
        ...prev,
        {
          id: String(nextId++),
          role: 'assistant',
          text: answer.text || '(sem resposta)',
          answer,
        },
      ]);
    } catch (error) {
      if (mine !== requestId.current) return;
      if (!provider) logError('assistant.answer', error);
      setTurns((prev) => [
        ...prev,
        {
          id: String(nextId++),
          role: 'assistant',
          text: provider ? describeAIError(error) : 'Não foi possível calcular agora. Tente de novo.',
          error: true,
        },
      ]);
    } finally {
      if (mine === requestId.current) finish();
    }
  }

  /** Stops waiting for the current answer; a new question can be asked right away. */
  function cancel() {
    requestId.current++;
    localEngine?.cancel();
    setTurns((prev) => [
      ...prev,
      {
        id: String(nextId++),
        role: 'assistant',
        text: 'Resposta cancelada.',
        error: false,
      },
    ]);
    finish();
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
              <MutedText>
                Os números vêm dos seus lançamentos, calculados no aparelho.
                {provider
                  ? ` Perguntas que as regras não cobrem vão para ${PROVIDER_LABELS[provider.id]}, com a sua permissão.`
                  : ' Nada é enviado para fora.'}
              </MutedText>
              {loaded && !provider && turns.length === 0 && (
                <Card style={{ gap: 10 }}>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    <Icon name="shield-checkmark-outline" size={20} color={theme.colors.primary} />
                    <Text style={[theme.type.bodyStrong, { color: theme.colors.textPrimary, flex: 1 }]}>Funciona sem internet</Text>
                  </View>
                  <MutedText>
                    Sem modelo de IA instalado, respondo por regras: gastos de um período, orçamento, saldos, previsão do mês, compras,
                    metas e como o app calcula. Para perguntas abertas, você pode autorizar um provedor externo.
                  </MutedText>
                  <Button
                    label="Inteligência artificial"
                    variant="secondary"
                    icon="key-outline"
                    onPress={() => router.push('/ai-settings')}
                  />
                </Card>
              )}
              {turns.length === 0 && (
                <View style={{ gap: 10, marginTop: 4 }}>
                  <MutedText>Experimente perguntar:</MutedText>
                  <ChipRow>
                    {SUGGESTIONS.map((s) => (
                      <Chip
                        key={s.label}
                        label={s.label}
                        selected={false}
                        onPress={() => (s.prefill ? setInput(s.prefill) : send(s.label))}
                      />
                    ))}
                  </ChipRow>
                </View>
              )}
            </View>
          }
          renderItem={({ item }) => (
            <TurnView
              turn={item}
              onEvidence={setEvidence}
              actionStates={actionStates}
              onActionState={(id, state) =>
                setActionStates((prev) => ({
                  ...prev,
                  [`${item.id}:${id}`]: state,
                }))
              }
              onShowActionItems={showActionItems}
            />
          )}
          ListFooterComponent={
            busy ? (
              <View style={styles.progress} accessibilityLiveRegion="polite">
                <ActivityIndicator size="small" color={theme.colors.primary} />
                <MutedText style={{ flex: 1 }}>{progress}…</MutedText>
                <Pressable onPress={cancel} accessibilityRole="button" hitSlop={8} style={styles.cancel}>
                  <Text style={[theme.type.label, { color: theme.colors.primary }]}>Cancelar</Text>
                </Pressable>
              </View>
            ) : undefined
          }
        />
        <View
          style={[
            styles.inputBar,
            {
              borderTopColor: theme.colors.border,
              backgroundColor: theme.colors.surface,
            },
          ]}
        >
          <TextInput
            style={[
              styles.input,
              {
                color: theme.colors.textPrimary,
                backgroundColor: theme.colors.surfaceMuted,
              },
            ]}
            placeholder="Pergunte sobre suas finanças…"
            placeholderTextColor={theme.colors.textSecondary}
            accessibilityLabel="Pergunta para o assistente"
            value={input}
            onChangeText={setInput}
            multiline
            editable={!busy}
            onKeyPress={(e) => {
              // On the computer, Enter sends and Shift+Enter breaks the line.
              const native = e.nativeEvent as {
                key: string;
                shiftKey?: boolean;
              };
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
            style={[
              styles.send,
              {
                backgroundColor: theme.colors.primary,
                opacity: busy || !input.trim() ? 0.4 : 1,
              },
            ]}
          >
            <Icon name="arrow-up" size={20} color={theme.colors.onPrimary} />
          </Pressable>
        </View>
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
            {
              backgroundColor: theme.colors.surface,
              borderColor: turn.error ? theme.colors.danger : theme.colors.border,
            },
          ]}
        >
          <RichText
            text={expanded || !details ? turn.text : short}
            color={turn.error ? theme.colors.danger : undefined}
            onRef={answer ? openRef : undefined}
          />
          {!!details && (
            <Pressable onPress={() => setExpanded((v) => !v)} accessibilityRole="button" hitSlop={8} style={styles.more}>
              <Text style={[theme.type.label, { color: theme.colors.primary }]}>{expanded ? 'Mostrar menos' : 'Ver detalhes'}</Text>
              <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={theme.colors.primary} />
            </Pressable>
          )}
          {unverified.length > 0 && (
            <View
              style={[
                styles.warning,
                {
                  backgroundColor: theme.colors.warningSurface,
                  borderRadius: theme.radius.md,
                },
              ]}
            >
              <Icon name="alert-outline" size={18} color={theme.colors.warning} />
              <Text style={[theme.type.label, { color: theme.colors.warning, flex: 1 }]}>
                Não conferido: {unverified.map((a) => a.text).join(', ')} não corresponde aos cálculos do app. Confira na base do cálculo
                antes de usar.
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
          {answer && (
            <Text style={[theme.type.caption, { color: theme.colors.textSecondary, marginTop: 6 }]}>
              {MODE_TEXT[answer.mode ?? (answer.local ? 'deterministic' : 'external_opt_in')]}
              {answer.notice ? ` ${answer.notice}` : ''}
            </Text>
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
      {answer?.memoryProposalId && <MemoryProposalCard id={answer.memoryProposalId} />}
      {answer?.forgetCandidates?.map((c) => (
        <ForgetCard key={c.id} id={c.id} text={c.text} />
      ))}
      {answer && !turn.error && <FeedbackRow answer={answer} />}
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

/** A memory the assistant proposed: nothing is kept until the person confirms. */
function MemoryProposalCard({ id }: { id: string }) {
  const theme = useTheme();
  const repos = useRepositories();
  const [state, setState] = useState<'pending' | 'kept' | 'discarded'>('pending');
  return (
    <Card style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Icon name="bulb-outline" size={18} color={theme.colors.primary} />
        <Text style={[theme.type.bodyStrong, { color: theme.colors.textPrimary, flex: 1 }]}>Guardar na memória?</Text>
      </View>
      {state === 'pending' ? (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Button
              label="Descartar"
              variant="secondary"
              onPress={async () => {
                await repos.memory.remove(LOCAL_USER_SCOPE, id);
                setState('discarded');
              }}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              label="Guardar"
              onPress={async () => {
                await repos.memory.confirm(LOCAL_USER_SCOPE, id);
                setState('kept');
              }}
            />
          </View>
        </View>
      ) : (
        <MutedText>
          {state === 'kept' ? 'Guardado. Você revisa ou apaga em Ajustes › Memória do assistente.' : 'Descartado. Nada foi guardado.'}
        </MutedText>
      )}
    </Card>
  );
}

/** A memory matching a "forget" request: deleted for good only on confirmation. */
function ForgetCard({ id, text }: { id: string; text: string }) {
  const theme = useTheme();
  const repos = useRepositories();
  const toast = useToast();
  const [gone, setGone] = useState(false);
  return (
    <Card style={{ gap: 8 }}>
      <Text style={[theme.type.body, { color: theme.colors.textPrimary }]}>“{text}”</Text>
      {gone ? (
        <MutedText>Apagada. Ela não influencia mais as respostas.</MutedText>
      ) : (
        <Button
          label="Apagar esta memória"
          variant="danger"
          onPress={async () => {
            try {
              await repos.memory.remove(LOCAL_USER_SCOPE, id);
              setGone(true);
              toast({ message: 'Memória apagada.' });
            } catch (error) {
              toast({
                message: userFacingError(error, 'Não foi possível apagar.'),
                tone: 'error',
              });
            }
          }}
        />
      )}
    </Card>
  );
}

/** "Útil" / "Incorreto" with an optional correction, kept on this device to improve the rules (never sent). */
function FeedbackRow({ answer }: { answer: AssistantAnswer }) {
  const theme = useTheme();
  const repos = useRepositories();
  const [sent, setSent] = useState<'useful' | 'wrong' | null>(null);
  const [writing, setWriting] = useState(false);
  const [note, setNote] = useState('');
  async function save(useful: boolean, correction = '') {
    const list = await repos.settings.get<unknown[]>(FEEDBACK_KEY, []);
    const entry = {
      at: new Date().toISOString(),
      useful,
      mode: answer.mode ?? null,
      evidenceStatus: answer.evidenceStatus ?? null,
      correction: correction.slice(0, 300),
    };
    await repos.settings.set(FEEDBACK_KEY, [...list, entry].slice(-MAX_FEEDBACK));
    setSent(useful ? 'useful' : 'wrong');
    setWriting(false);
  }
  if (sent)
    return (
      <MutedText style={{ fontSize: 12 }}>
        {sent === 'useful' ? 'Obrigado pelo retorno.' : 'Obrigado. A correção fica guardada só neste aparelho.'}
      </MutedText>
    );
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', gap: 16 }}>
        <Pressable onPress={() => save(true)} accessibilityRole="button" hitSlop={8} style={styles.feedback}>
          <Text style={[theme.type.label, { color: theme.colors.primary }]}>Útil</Text>
        </Pressable>
        <Pressable onPress={() => setWriting(true)} accessibilityRole="button" hitSlop={8} style={styles.feedback}>
          <Text style={[theme.type.label, { color: theme.colors.primary }]}>Incorreto</Text>
        </Pressable>
      </View>
      {writing && (
        <View style={{ gap: 6 }}>
          <TextField placeholder="O que está errado? (opcional)" value={note} onChangeText={setNote} accessibilityLabel="Correção" />
          <Button label="Enviar correção" variant="secondary" onPress={() => save(false, note)} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  cancel: { minHeight: 32, justifyContent: 'center', paddingHorizontal: 6 },
  feedback: { minHeight: 32, justifyContent: 'center' },
  list: { padding: 16, gap: 12, paddingBottom: 24 },
  progress: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  bubbleRow: { flexDirection: 'row' },
  bubble: {
    maxWidth: '92%',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  more: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
    alignSelf: 'flex-start',
    minHeight: 32,
  },
  warning: { flexDirection: 'row', gap: 8, padding: 10, marginTop: 8 },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    padding: 10,
    borderTopWidth: 1,
  },
  input: {
    flex: 1,
    maxHeight: 120,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: 15,
  },
  send: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

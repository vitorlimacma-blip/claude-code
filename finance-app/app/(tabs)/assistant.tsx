import { Ionicons } from '@expo/vector-icons';
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
import { askAssistant, TOOL_LABELS } from '../../src/ai/assistant';
import { PROVIDER_LABELS } from '../../src/ai/config';
import { describeAIError, type AgentResult } from '../../src/ai/types';
import { useAI } from '../../src/state/AIContext';
import { useRepositories } from '../../src/state/DataProvider';
import { Button, Card, Chip, ChipRow, MutedText, Screen, Title } from '../../src/ui/components';
import { RichText } from '../../src/ui/RichText';
import { useTheme } from '../../src/ui/theme';

interface Turn {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  toolCalls?: string[];
  sources?: AgentResult['sources'];
  error?: boolean;
}

const SUGGESTIONS = [
  'Quanto gastei com alimentação nos últimos 3 meses?',
  'Quais foram meus 5 maiores gastos deste mês?',
  'Como estão meus orçamentos este mês?',
  'Qual é o meu saldo total hoje?',
  'Em que categoria eu mais gasto? Onde posso economizar?',
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
  const listRef = useRef<FlatList<Turn>>(null);

  async function send(text: string) {
    const question = text.trim();
    if (!question || busy || !provider) return;
    const userTurn: Turn = { id: String(nextId++), role: 'user', text: question };
    const conversation = [...turns.filter((t) => !t.error), userTurn];
    setTurns((prev) => [...prev, userTurn]);
    setInput('');
    setBusy(true);
    setProgress('Pensando');
    try {
      const result = await askAssistant({
        provider,
        repos,
        history: conversation.map((t) => ({ role: t.role, text: t.text })),
        webSearch: settings.webSearch,
        onToolCall: (name) => setProgress(TOOL_LABELS[name] ?? 'Consultando seus dados'),
      });
      setTurns((prev) => [
        ...prev,
        {
          id: String(nextId++),
          role: 'assistant',
          text: result.text || '(sem resposta)',
          toolCalls: [...new Set(result.toolCalls.map((c) => TOOL_LABELS[c.name] ?? c.name))],
          sources: result.sources,
        },
      ]);
    } catch (error) {
      setTurns((prev) => [...prev, { id: String(nextId++), role: 'assistant', text: describeAIError(error), error: true }]);
    } finally {
      setBusy(false);
      setProgress(null);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
    }
  }

  if (loaded && !provider) {
    return (
      <Screen>
        <Title>Assistente</Title>
        <Card style={{ gap: 10 }}>
          <Text style={[styles.cardTitle, { color: theme.colors.text }]}>Converse com suas finanças</Text>
          <MutedText>
            Pergunte em linguagem natural — &quot;quanto gastei com mercado este ano?&quot;, &quot;estou gastando mais
            que no mês passado?&quot; — e a IA responde consultando os seus lançamentos, que continuam no aparelho.
          </MutedText>
          <MutedText>Para ativar, escolha um provedor (Claude ou ChatGPT) e informe a sua chave de API.</MutedText>
          <Button label="Configurar a IA" icon="key-outline" onPress={() => router.push('/ai-settings')} />
        </Card>
      </Screen>
    );
  }

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
            <View style={{ gap: 8 }}>
              <Title
                right={
                  turns.length > 0 ? (
                    <Pressable onPress={() => setTurns([])} hitSlop={8} accessibilityLabel="Nova conversa">
                      <Ionicons name="create-outline" size={22} color={theme.colors.primary} />
                    </Pressable>
                  ) : undefined
                }
              >
                Assistente
              </Title>
              {provider && (
                <MutedText>
                  {PROVIDER_LABELS[provider.id]}
                  {settings.webSearch ? ' · com busca na internet' : ''}
                </MutedText>
              )}
              {turns.length === 0 && (
                <View style={{ gap: 10, marginTop: 8 }}>
                  <MutedText>Experimente perguntar:</MutedText>
                  <ChipRow>
                    {[...SUGGESTIONS, ...(settings.webSearch ? ['Quanto está a Selic hoje?'] : [])].map((s) => (
                      <Chip key={s} label={s} selected={false} onPress={() => send(s)} />
                    ))}
                  </ChipRow>
                </View>
              )}
            </View>
          }
          renderItem={({ item }) => <Bubble turn={item} />}
          ListFooterComponent={
            busy ? (
              <View style={styles.progress}>
                <ActivityIndicator size="small" color={theme.colors.primary} />
                <MutedText>{progress}…</MutedText>
              </View>
            ) : undefined
          }
        />
        <View style={[styles.inputBar, { borderTopColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
          <TextInput
            style={[styles.input, { color: theme.colors.text, backgroundColor: theme.colors.surfaceMuted }]}
            placeholder="Pergunte sobre suas finanças…"
            placeholderTextColor={theme.colors.textMuted}
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
            accessibilityLabel="Enviar"
            style={[styles.send, { backgroundColor: theme.colors.primary, opacity: busy || !input.trim() ? 0.4 : 1 }]}
          >
            <Ionicons name="arrow-up" size={20} color={theme.colors.onPrimary} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function Bubble({ turn }: { turn: Turn }) {
  const theme = useTheme();
  const isUser = turn.role === 'user';
  return (
    <View style={[styles.bubbleRow, { justifyContent: isUser ? 'flex-end' : 'flex-start' }]}>
      <View
        style={[
          styles.bubble,
          isUser
            ? { backgroundColor: theme.colors.primary }
            : { backgroundColor: theme.colors.surface, borderColor: turn.error ? theme.colors.danger : theme.colors.border },
        ]}
      >
        {isUser ? (
          <Text style={{ color: theme.colors.onPrimary, fontSize: 15 }}>{turn.text}</Text>
        ) : (
          <RichText text={turn.text} color={turn.error ? theme.colors.danger : undefined} />
        )}
        {!!turn.toolCalls?.length && (
          <MutedText style={{ fontSize: 11, marginTop: 6 }}>Consultou: {turn.toolCalls.join(', ').toLowerCase()}</MutedText>
        )}
        {!!turn.sources?.length && (
          <View style={{ marginTop: 6, gap: 2 }}>
            <MutedText style={{ fontSize: 11 }}>Fontes:</MutedText>
            {turn.sources.slice(0, 5).map((s) => (
              <Text
                key={s.url}
                onPress={() => Linking.openURL(s.url)}
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
  );
}

const styles = StyleSheet.create({
  list: { padding: 16, gap: 10, paddingBottom: 24 },
  cardTitle: { fontSize: 16, fontWeight: '700' },
  progress: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  bubbleRow: { flexDirection: 'row' },
  bubble: { maxWidth: '88%', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: 'transparent' },
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 10, borderTopWidth: 1 },
  input: { flex: 1, maxHeight: 120, borderRadius: 20, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10, fontSize: 15 },
  send: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});

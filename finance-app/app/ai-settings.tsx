import { useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { MODEL_OPTIONS, PROVIDER_KEY_HINTS, PROVIDER_LABELS, type AISettings } from '../src/ai/config';
import { describeAIError, type ModelTier, type ProviderId } from '../src/ai/types';
import { secrets } from '../src/platform/secrets';
import { useAI } from '../src/state/AIContext';
import { useCategorizer } from '../src/state/useCategorizer';
import { Button, Card, Chip, ChipRow, MutedText, SectionTitle, SegmentedControl, TextField } from '../src/ui/components';
import { CONTENT_MAX_WIDTH } from '../src/ui/layout';
import { useTheme } from '../src/ui/theme';

const TIER_LABELS: Record<ModelTier, { title: string; help: string }> = {
  fast: { title: 'Modelo para categorizar', help: 'Usado com frequência, em pedidos curtos.' },
  smart: { title: 'Modelo do assistente', help: 'Usado nas perguntas e análises.' },
};

export default function AISettingsScreen() {
  const theme = useTheme();
  const { settings, saveSettings, saveKey, hasKey, provider } = useAI();
  const { ruleCount } = useCategorizer();
  const [keyInput, setKeyInput] = useState('');
  const [test, setTest] = useState<{ ok: boolean; message: string } | null>(null);
  const [testing, setTesting] = useState(false);

  const update = (patch: Partial<AISettings>) => {
    setTest(null);
    return saveSettings({ ...settings, ...patch });
  };
  const active = settings.provider === 'none' ? null : settings.provider;

  async function storeKey(id: ProviderId) {
    if (!keyInput.trim()) return;
    await saveKey(id, keyInput);
    setKeyInput('');
    setTest(null);
  }

  async function runTest() {
    if (!provider) return;
    setTesting(true);
    setTest(null);
    try {
      const answer = await provider.generateJson<{ resposta: string }>({
        tier: 'fast',
        system: 'Responda de forma curta.',
        prompt: 'Diga "ok" no campo resposta.',
        schemaName: 'teste',
        schema: {
          type: 'object',
          properties: { resposta: { type: 'string' } },
          required: ['resposta'],
          additionalProperties: false,
        },
      });
      setTest({ ok: true, message: `Conexão funcionando (resposta: "${answer.resposta}").` });
    } catch (error) {
      setTest({ ok: false, message: describeAIError(error) });
    } finally {
      setTesting(false);
    }
  }

  return (
    <ScrollView style={{ backgroundColor: theme.colors.background }} contentContainerStyle={styles.content}>
      <MutedText>
        A IA do app funciona em duas camadas: uma inteligência local, que aprende com as suas correções e funciona
        offline e sem custo, e um provedor de IA na nuvem para o assistente e os casos mais difíceis, com a sua
        própria chave.
      </MutedText>
      <Card style={{ gap: 6 }}>
        <Text style={[styles.strong, { color: theme.colors.textPrimary }]}>Inteligência local</Text>
        <MutedText>
          {ruleCount > 0
            ? `Já aprendeu a categoria de ${ruleCount} estabelecimento(s) com as suas escolhas.`
            : 'Ainda aprendendo: cada lançamento que você categoriza ensina o app.'}
        </MutedText>
      </Card>

      <SectionTitle>Provedor de IA</SectionTitle>
      <SegmentedControl
        value={settings.provider}
        onChange={(value) => update({ provider: value })}
        options={[
          { value: 'none', label: 'Desligado' },
          { value: 'claude', label: 'Claude' },
          { value: 'openai', label: 'ChatGPT' },
        ]}
      />

      {active && (
        <>
          <Card style={{ gap: 10 }}>
            <Text style={[styles.strong, { color: theme.colors.textPrimary }]}>Chave de API — {PROVIDER_LABELS[active]}</Text>
            <MutedText>{PROVIDER_KEY_HINTS[active]}</MutedText>
            {hasKey[active] ? (
              <View style={{ gap: 10 }}>
                <Text style={{ color: theme.colors.success, fontWeight: '600' }}>Chave salva ✓</Text>
                <View style={styles.buttons}>
                  <View style={{ flex: 1 }}>
                    <Button label={testing ? 'Testando…' : 'Testar conexão'} variant="secondary" onPress={runTest} disabled={testing} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Button label="Remover chave" variant="secondary" onPress={() => saveKey(active, null)} />
                  </View>
                </View>
              </View>
            ) : (
              <View style={{ gap: 10 }}>
                <TextField
                  placeholder="Cole a chave aqui"
                  value={keyInput}
                  onChangeText={setKeyInput}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <Button label="Salvar chave" icon="key-outline" onPress={() => storeKey(active)} disabled={!keyInput.trim()} />
              </View>
            )}
            {test && <Text style={{ color: test.ok ? theme.colors.success : theme.colors.danger }}>{test.message}</Text>}
            <MutedText style={{ fontSize: 12 }}>
              {secrets.isSecure
                ? 'A chave fica no cofre seguro do aparelho (Keychain), fora do banco de dados e dos backups.'
                : 'Neste navegador a chave fica salva só neste computador. Não use em computadores compartilhados.'}{' '}
              O uso é cobrado pelo provedor na sua conta.
            </MutedText>
          </Card>

          {(['smart', 'fast'] as const).map((tier) => (
            <View key={tier} style={{ gap: 8 }}>
              <SectionTitle>{TIER_LABELS[tier].title}</SectionTitle>
              <MutedText>{TIER_LABELS[tier].help}</MutedText>
              <ChipRow>
                {MODEL_OPTIONS[active].map((m) => (
                  <Chip
                    key={m.id}
                    label={m.label}
                    selected={settings.models[active][tier] === m.id}
                    onPress={() =>
                      update({ models: { ...settings.models, [active]: { ...settings.models[active], [tier]: m.id } } })
                    }
                  />
                ))}
              </ChipRow>
            </View>
          ))}
        </>
      )}

      <SectionTitle>Recursos</SectionTitle>
      <Card style={{ gap: 14 }}>
        <ToggleRow
          title="Categorização com IA"
          subtitle="Quando a inteligência local não tiver certeza, pede uma sugestão à IA."
          value={settings.aiCategorization}
          onChange={(v) => update({ aiCategorization: v })}
        />
        <ToggleRow
          title="Busca na internet"
          subtitle="O assistente pode pesquisar Selic, CDI, IPCA, cotações e notícias. Só os termos da busca saem do app, nunca os seus lançamentos."
          value={settings.webSearch}
          onChange={(v) => update({ webSearch: v })}
        />
      </Card>
    </ScrollView>
  );
}

function ToggleRow({ title, subtitle, value, onChange }: { title: string; subtitle: string; value: boolean; onChange: (v: boolean) => void }) {
  const theme = useTheme();
  return (
    <View style={styles.toggle}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[styles.strong, { color: theme.colors.textPrimary }]}>{title}</Text>
        <MutedText style={{ fontSize: 12 }}>{subtitle}</MutedText>
      </View>
      <Switch value={value} onValueChange={onChange} accessibilityLabel={title} />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, paddingBottom: 48, width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
  strong: { fontSize: 15, fontWeight: '700' },
  buttons: { flexDirection: 'row', gap: 10 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});

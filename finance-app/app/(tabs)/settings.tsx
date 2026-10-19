import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { PROVIDER_LABELS } from '../../src/ai/config';
import { todayKey } from '../../src/domain/dates';
import { confirm, notify } from '../../src/platform/dialogs';
import { useAI } from '../../src/state/AIContext';
import { useRepositories } from '../../src/state/DataProvider';
import { useQuery } from '../../src/state/useQuery';
import { Button, Card, IconBubble, MutedText, Screen, SectionTitle, Title } from '../../src/ui/components';
import { useTheme } from '../../src/ui/theme';

function Row({ icon, color, title, subtitle, href }: { icon: string; color: string; title: string; subtitle: string; href: Href }) {
  const theme = useTheme();
  return (
    <Pressable onPress={() => router.push(href)} style={({ pressed }) => [styles.row, { opacity: pressed ? 0.6 : 1 }]}>
      <IconBubble icon={icon} color={color} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowTitle, { color: theme.colors.text }]}>{title}</Text>
        <MutedText style={{ fontSize: 12 }}>{subtitle}</MutedText>
      </View>
      <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
    </Pressable>
  );
}

export default function SettingsScreen() {
  const { settings, provider } = useAI();
  const repos = useRepositories();
  const { data: accounts } = useQuery((r) => r.accounts.list(), ['accounts']);
  const { data: hasDemo } = useQuery((r) => r.demo.exists(), ['accounts']);
  const [busy, setBusy] = useState(false);

  async function generateDemo() {
    const ok = await confirm(
      'Gerar dados de teste',
      'Cria 4 contas fictícias (Itaú, Santander, XP e Mercado Pago), cerca de 6 meses de lançamentos e orçamentos. ' +
        'Seus dados não são alterados, e tudo pode ser apagado depois.',
      { confirmLabel: 'Gerar' }
    );
    if (!ok) return;
    setBusy(true);
    try {
      const result = await repos.demo.generate(todayKey());
      notify('Dados de teste criados', `${result.transactions} lançamentos em ${result.accounts} contas.`);
    } finally {
      setBusy(false);
    }
  }

  async function clearDemo() {
    const ok = await confirm(
      'Apagar dados de teste',
      'Remove as contas fictícias, os lançamentos delas (inclusive os que você tiver adicionado nessas contas) e os orçamentos de exemplo.',
      { confirmLabel: 'Apagar', destructive: true }
    );
    if (!ok) return;
    setBusy(true);
    try {
      await repos.demo.clear();
    } finally {
      setBusy(false);
    }
  }

  const aiStatus =
    settings.provider === 'none'
      ? 'Desligada — usando só a inteligência local'
      : provider
        ? `${PROVIDER_LABELS[settings.provider]} · ativa`
        : `${PROVIDER_LABELS[settings.provider]} · falta a chave de API`;

  return (
    <Screen>
      <Title>Ajustes</Title>
      <Card style={{ gap: 14 }}>
        <Row icon="sparkles-outline" color="#7C3AED" title="Inteligência artificial" subtitle={aiStatus} href="/ai-settings" />
        <Row
          icon="wallet-outline"
          color="#16A34A"
          title="Contas e cartões"
          subtitle={accounts ? `${accounts.length} conta(s) ativa(s)` : ' '}
          href="/accounts"
        />
        <Row icon="trending-up-outline" color="#0891B2" title="Previsões" subtitle="Projeção de gastos do mês e do ano" href="/forecasts" />
        <Row
          icon="shield-checkmark-outline"
          color="#2563EB"
          title="Backup e restauração"
          subtitle="Exportar, restaurar e backups automáticos"
          href="/backup"
        />
      </Card>

      <SectionTitle>Dados de teste</SectionTitle>
      <Card style={{ gap: 10 }}>
        <MutedText>
          Preenche o app com uma rotina financeira fictícia — salário, contas fixas, assinaturas, cartão de crédito,
          investimentos, gastos fora do padrão e lançamentos sem categoria — para experimentar o assistente, a
          categorização com IA, os orçamentos e as previsões.
        </MutedText>
        <Button
          label={busy ? 'Aguarde…' : hasDemo ? 'Gerar de novo (substitui os de teste)' : 'Gerar dados de teste'}
          icon="flask-outline"
          variant="secondary"
          onPress={generateDemo}
          disabled={busy}
        />
        {hasDemo && <Button label="Apagar dados de teste" icon="trash-outline" variant="secondary" onPress={clearDemo} disabled={busy} />}
      </Card>

      <SectionTitle>Seus dados</SectionTitle>
      <MutedText>
        Tudo fica guardado só {Platform.OS === 'web' ? 'neste navegador, neste computador' : 'neste aparelho'}, sem
        servidor. Quando a IA está ativa, apenas o necessário para cada pergunta é enviado ao provedor escolhido.
      </MutedText>
      {Platform.OS === 'web' && (
        <MutedText>
          Atenção: limpar os dados de navegação deste site apaga os seus lançamentos e os backups automáticos.
          Exporte seus dados em Backup e restauração e guarde o arquivo fora do navegador.
        </MutedText>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowTitle: { fontSize: 15, fontWeight: '600' },
});

import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { PROVIDER_LABELS } from '../../src/ai/config';
import { useAI } from '../../src/state/AIContext';
import { useQuery } from '../../src/state/useQuery';
import { Card, IconBubble, MutedText, Screen, SectionTitle, Title } from '../../src/ui/components';
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
  const { data: accounts } = useQuery((r) => r.accounts.list(), ['accounts']);

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
      </Card>

      <SectionTitle>Seus dados</SectionTitle>
      <MutedText>
        Tudo fica guardado só {Platform.OS === 'web' ? 'neste navegador, neste computador' : 'neste aparelho'}, sem
        servidor. Quando a IA está ativa, apenas o necessário para cada pergunta é enviado ao provedor escolhido.
      </MutedText>
      {Platform.OS === 'web' && (
        <MutedText>
          Atenção: limpar os dados de navegação deste site apaga os seus lançamentos. O backup chega na próxima etapa.
        </MutedText>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowTitle: { fontSize: 15, fontWeight: '600' },
});

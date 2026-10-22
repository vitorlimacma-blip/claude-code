import { router, type Href } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { PROVIDER_LABELS, withDefaults } from '../../src/ai/config';
import { todayKey } from '../../src/domain/dates';
import { confirm, notify } from '../../src/platform/dialogs';
import { useAI } from '../../src/state/AIContext';
import { useRepositories } from '../../src/state/DataProvider';
import { useQuery } from '../../src/state/useQuery';
import { useThemePreference } from '../../src/state/useThemePreference';
import { Button, Card, IconBubble, MutedText, Screen, Section, SegmentedControl, Title } from '../../src/ui/components';
import { Icon } from '../../src/ui/icons';
import { useTheme, type ThemePreference } from '../../src/ui/theme';

function Row({ icon, color, title, subtitle, href }: { icon: string; color: string; title: string; subtitle: string; href: Href }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={() => router.push(href)}
      accessibilityRole="button"
      accessibilityHint={subtitle}
      style={({ pressed }) => [styles.row, { backgroundColor: pressed ? theme.colors.pressed : 'transparent', borderRadius: theme.radius.md }]}
    >
      <IconBubble icon={icon} color={color} />
      <View style={{ flex: 1 }}>
        <Text style={[theme.type.bodyStrong, { color: theme.colors.textPrimary }]}>{title}</Text>
        <Text style={[theme.type.label, { color: theme.colors.textSecondary }]}>{subtitle}</Text>
      </View>
      <Icon name="chevron-forward" size={20} color={theme.colors.textSecondary} />
    </Pressable>
  );
}

function SwitchRow({ title, subtitle, value, onChange }: { title: string; subtitle: string; value: boolean; onChange: (v: boolean) => void }) {
  const theme = useTheme();
  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={[theme.type.bodyStrong, { color: theme.colors.textPrimary }]}>{title}</Text>
        <Text style={[theme.type.label, { color: theme.colors.textSecondary }]}>{subtitle}</Text>
      </View>
      <Switch value={value} onValueChange={onChange} accessibilityLabel={title} />
    </View>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Section title={title}>
      <Card style={{ gap: 4, paddingVertical: 8 }}>{children}</Card>
    </Section>
  );
}

/** Ajustes, by the sections of briefing §7. */
export default function SettingsScreen() {
  const { settings, provider, saveSettings, saveKey } = useAI();
  const repos = useRepositories();
  const { data } = useQuery(
    async (r) => {
      const [accounts, categories, hasDemo, backups] = await Promise.all([
        r.accounts.list(),
        r.categories.list(),
        r.demo.exists(),
        r.backup.listBackups(),
      ]);
      return { accounts, categories, hasDemo, backups };
    },
    ['accounts', 'categories', 'settings']
  );
  const [busy, setBusy] = useState(false);
  const [themePreference, setThemePreference] = useThemePreference();

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

  async function eraseEverything() {
    const ok = await confirm(
      'Apagar todos os meus dados',
      'Apaga contas, lançamentos, orçamentos, metas, a memória do assistente, os backups automáticos e as chaves de API deste ' +
        `${Platform.OS === 'web' ? 'navegador' : 'aparelho'}. Não dá para desfazer: exporte antes em Backup e restauração se quiser guardar uma cópia. ` +
        'Cópias que você exportou ou enviou para outros lugares não são alcançadas pelo app.',
      { confirmLabel: 'Apagar tudo', destructive: true }
    );
    if (!ok || !repos.eraseAll) return;
    setBusy(true);
    try {
      await repos.eraseAll();
      await saveKey('claude', null);
      await saveKey('openai', null);
      await saveSettings(withDefaults(null));
      notify('Dados apagados', 'O app voltou ao estado inicial.');
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
      ? 'Respostas por regras, no aparelho; nenhum provedor externo'
      : provider
        ? `${PROVIDER_LABELS[settings.provider]} · permitido`
        : settings.permissions.externalInference
          ? `${PROVIDER_LABELS[settings.provider]} · falta a chave de API`
          : `${PROVIDER_LABELS[settings.provider]} · permissão desligada`;
  const activeCategories = data?.categories.filter((c) => !c.archived && !c.parentId).length;
  const lastBackup = data?.backups[0];

  return (
    <Screen>
      <Title>Ajustes</Title>

      <Group title="Contas e categorias">
        <Row icon="wallet-outline" color="#176B5B" title="Contas e cartões" subtitle={data ? `${data.accounts.length} conta(s) ativa(s)` : ' '} href="/accounts" />
        <Row icon="pricetags-outline" color="#365BB5" title="Categorias" subtitle={activeCategories !== undefined ? `${activeCategories} principais · reordenar, arquivar, juntar` : ' '} href="/categories" />
        <Row icon="calendar-outline" color="#8A5200" title="Contas previstas" subtitle="Salário e contas fixas, usados na margem do Resumo" href="/recurrences" />
        <Row icon="trending-up-outline" color="#0891B2" title="Previsões por categoria" subtitle="Gasto do mês, mês típico e previsão" href="/forecasts" />
        <Row icon="star-outline" color="#B45309" title="Metas, reservas e saldo mínimo" subtitle="Dinheiro separado não conta como livre" href="/goals" />
      </Group>

      <Section title="Aparência e acessibilidade">
        <SegmentedControl<ThemePreference>
          value={themePreference}
          onChange={setThemePreference}
          options={[
            { value: 'system', label: 'Sistema' },
            { value: 'light', label: 'Claro' },
            { value: 'dark', label: 'Escuro' },
          ]}
        />
        <MutedText>
          O tamanho do texto e a redução de movimento seguem os ajustes de acessibilidade do aparelho. Valores e totais nunca
          dependem só da cor: sempre levam sinal ou texto.
        </MutedText>
      </Section>

      <Group title="Privacidade e inteligência artificial">
        <Row icon="sparkles-outline" color="#7C3AED" title="Inteligência artificial" subtitle={aiStatus} href="/ai-settings" />
        <Row icon="bulb-outline" color="#0F766E" title="Memória do assistente" subtitle="O que ele guarda e o que o app aprendeu: revisar, corrigir, apagar" href="/memory" />
        <SwitchRow
          title="Aprender com minhas correções"
          subtitle="Quando você escolhe ou corrige uma categoria, as próximas sugestões passam a seguir essa escolha. Desligado, valem só as regras do app."
          value={settings.learnFromCorrections}
          onChange={(learnFromCorrections) => void saveSettings({ ...settings, learnFromCorrections })}
        />
        <View style={styles.note}>
          <MutedText style={{ fontSize: 13 }}>
            Seus dados ficam só {Platform.OS === 'web' ? 'neste navegador' : 'neste aparelho'}. Só com a permissão de provedor externo
            ligada, perguntas que as regras não cobrem vão a ele com os números necessários; a chave de API fica guardada à parte.
          </MutedText>
        </View>
      </Group>

      <Group title="Seus dados">
        <Row
          icon="shield-checkmark-outline"
          color="#2563EB"
          title="Backup e restauração"
          subtitle={lastBackup ? `Último backup: ${new Date(lastBackup.createdAt).toLocaleDateString('pt-BR')}` : 'Exportar, restaurar e backups automáticos'}
          href="/backup"
        />
        <View style={[styles.note, { gap: 8 }]}>
          <Button label="Apagar todos os meus dados" icon="trash-outline" variant="ghost" onPress={eraseEverything} disabled={busy} />
        </View>
        {Platform.OS === 'web' && (
          <View style={styles.note}>
            <MutedText style={{ fontSize: 13 }}>
              Atenção: limpar os dados de navegação deste site apaga os seus lançamentos e os backups automáticos. Exporte seus dados
              em Backup e restauração e guarde o arquivo fora do navegador.
            </MutedText>
          </View>
        )}
      </Group>

      <Group title="Notificações">
        <View style={styles.note}>
          <MutedText>
            O app ainda não envia notificações. Quando houver avisos de vencimento e de risco de caixa, eles serão opcionais e o
            app só vai pedir permissão no momento em que forem úteis.
          </MutedText>
        </View>
      </Group>

      <Group title="Dados de teste">
        <View style={[styles.note, { gap: 10 }]}>
          <MutedText>
            Preenche o app com uma rotina financeira fictícia, identificada como teste, para experimentar o assistente, a
            categorização, os orçamentos e as previsões. Seus dados não são alterados.
          </MutedText>
          <Button
            label={busy ? 'Aguarde…' : data?.hasDemo ? 'Gerar de novo (substitui os de teste)' : 'Gerar dados de teste'}
            icon="flask-outline"
            variant="secondary"
            onPress={generateDemo}
            disabled={busy}
          />
          {data?.hasDemo && <Button label="Apagar dados de teste" icon="trash-outline" variant="ghost" onPress={clearDemo} disabled={busy} />}
        </View>
      </Group>

      <Group title="Sobre o app">
        <Row icon="color-palette-outline" color="#176B5B" title="Catálogo de componentes" subtitle="Tela interna para revisar o visual nos dois temas" href="/catalogo" />
      </Group>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingHorizontal: 8, paddingVertical: 8 },
  note: { paddingHorizontal: 8, paddingVertical: 8 },
});

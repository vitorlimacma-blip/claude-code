import { useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import type { AlertKind, AlertPreferences } from '../src/domain/alerts';
import { notificationsSupported, requestNotificationPermission } from '../src/platform/notifications';
import { useAlerts, useAlertSettings } from '../src/state/useAlerts';
import { Button, Card, Chip, ChipRow, MutedText, SectionTitle } from '../src/ui/components';
import { CONTENT_MAX_WIDTH } from '../src/ui/layout';
import { useTheme } from '../src/ui/theme';

const KINDS: { kind: AlertKind; title: string; subtitle: string }[] = [
  { kind: 'cash_risk', title: 'Risco de caixa', subtitle: 'Quando a previsão mostra o saldo abaixo do mínimo (ou negativo) antes do próximo recebimento.' },
  { kind: 'overdue', title: 'Conta sem lançamento', subtitle: 'Conta prevista cuja data passou sem um lançamento correspondente.' },
  { kind: 'due', title: 'Contas a vencer', subtitle: 'Contas previstas e faturas que vencem nos próximos dias.' },
  { kind: 'budget', title: 'Orçamento', subtitle: 'Categoria que passou ou deve passar do orçamento do mês.' },
];

const HOURS = [8, 9, 12, 19];

/**
 * Ajustes › Avisos e notificações (briefing §13): what is worth an alert, how
 * far ahead, and the optional daily summary on the phone, with nothing
 * financial on the lock screen unless the person allows it.
 */
export default function NotificationsScreen() {
  const theme = useTheme();
  const { settings, savePrefs } = useAlertSettings();
  const { all, visible, restoreAll } = useAlerts();
  const [permissionNote, setPermissionNote] = useState<string | null>(null);
  if (!settings) return <View style={{ flex: 1, backgroundColor: theme.colors.background }} />;
  const prefs = settings.prefs;
  const update = (patch: Partial<AlertPreferences>) => savePrefs({ ...prefs, ...patch });
  const dismissedNow = all.filter((a) => prefs.kinds[a.kind] && settings.dismissed[a.key]).length;

  async function toggleNotifications(enabled: boolean) {
    setPermissionNote(null);
    if (enabled && !(await requestNotificationPermission())) {
      setPermissionNote('O celular não deu permissão. Para receber o resumo, permita as notificações deste app nos ajustes do aparelho.');
      return;
    }
    await update({ notifications: { ...prefs.notifications, enabled } });
  }

  return (
    <ScrollView style={{ backgroundColor: theme.colors.background }} contentContainerStyle={styles.content}>
      <MutedText>
        Os avisos aparecem no Resumo, cada um com o motivo e o que dá para fazer. Dispensar esconde aquele aviso até a situação
        mudar (a conta do mês que vem é um aviso novo).
      </MutedText>

      <SectionTitle>O que avisar</SectionTitle>
      <Card style={{ gap: 14 }}>
        {KINDS.map((k) => (
          <ToggleRow
            key={k.kind}
            title={k.title}
            subtitle={k.subtitle}
            value={prefs.kinds[k.kind]}
            onChange={(v) => update({ kinds: { ...prefs.kinds, [k.kind]: v } })}
          />
        ))}
      </Card>

      <SectionTitle>Contas a vencer: com quanta antecedência</SectionTitle>
      <ChipRow>
        {([1, 3, 7] as const).map((d) => (
          <Chip key={d} label={d === 1 ? 'Na véspera' : `${d} dias`} selected={prefs.dueWithinDays === d} onPress={() => update({ dueWithinDays: d })} />
        ))}
      </ChipRow>

      <SectionTitle>No celular</SectionTitle>
      {notificationsSupported ? (
        <Card style={{ gap: 14 }}>
          <ToggleRow
            title="Resumo diário de avisos"
            subtitle="No máximo uma notificação por dia, só quando houver aviso. A permissão do celular é pedida quando você liga."
            value={prefs.notifications.enabled}
            onChange={toggleNotifications}
          />
          {permissionNote && <Text style={{ color: theme.colors.warning }}>{permissionNote}</Text>}
          {prefs.notifications.enabled && (
            <>
              <View style={{ gap: 8 }}>
                <Text style={[styles.strong, { color: theme.colors.textPrimary }]}>Horário</Text>
                <ChipRow>
                  {HOURS.map((h) => (
                    <Chip key={h} label={`${h}h`} selected={prefs.notifications.hour === h} onPress={() => update({ notifications: { ...prefs.notifications, hour: h } })} />
                  ))}
                </ChipRow>
              </View>
              <ToggleRow
                title="Esconder valores e nomes na tela bloqueada"
                subtitle={
                  prefs.notifications.privateLockScreen
                    ? 'A notificação diz só "Há 2 avisos para olhar no app".'
                    : 'A notificação mostra nomes e valores, por exemplo "Aluguel vence amanhã (R$ 1.800,00)". Qualquer pessoa que veja a tela bloqueada lê.'
                }
                value={prefs.notifications.privateLockScreen}
                onChange={(v) => update({ notifications: { ...prefs.notifications, privateLockScreen: v } })}
              />
            </>
          )}
        </Card>
      ) : (
        <MutedText>No computador, os avisos aparecem só no Resumo. O resumo diário por notificação é do app no celular.</MutedText>
      )}

      <SectionTitle>Dispensados</SectionTitle>
      <Card style={{ gap: 10 }}>
        <MutedText>
          {dismissedNow > 0
            ? `${dismissedNow} aviso(s) dispensado(s) que ainda valem hoje. ${visible.length} visível(is) no Resumo.`
            : `Nenhum aviso dispensado que ainda valha hoje. ${visible.length} visível(is) no Resumo.`}
        </MutedText>
        {dismissedNow > 0 && <Button label="Mostrar de novo" variant="secondary" onPress={restoreAll} />}
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
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});

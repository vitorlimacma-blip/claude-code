import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';
import { formatDateBR, formatMonthBR } from '../../src/domain/dates';
import { BUDGET_LEVEL_LABELS } from '../../src/domain/budgets';
import { findInstitution } from '../../src/domain/institutions';
import { ACCOUNT_TYPE_ICONS } from '../../src/domain/labels';
import { formatCents, formatSignedCents } from '../../src/domain/money';
import { useAlerts } from '../../src/state/useAlerts';
import { useFinancialPicture, type FinancialPicture } from '../../src/state/useFinancialPicture';
import { BudgetProgress } from '../../src/ui/BudgetProgress';
import { InsightCard } from '../../src/ui/cards';
import { Button, Card, Fab, FinancialAmount, IconBubble, MutedText, Screen, Section, Title } from '../../src/ui/components';
import { Icon, type IconName } from '../../src/ui/icons';
import { EmptyState, SkeletonRows } from '../../src/ui/states';
import { useTheme } from '../../src/ui/theme';
import { TideLine } from '../../src/ui/TideLine';
import { useToast } from '../../src/ui/Toast';
import { motion } from '../../src/ui/tokens';

/**
 * Resumo (briefing §7): one main piece of information, the margin until the
 * next income, with its calculation one tap away; then what tells saldo,
 * resultado, compromissos and projeção apart; then the few things worth attention.
 */
export default function DashboardScreen() {
  const picture = useFinancialPicture();
  if (!picture) {
    return (
      <Screen>
        <Title>Resumo</Title>
        <SkeletonRows count={5} />
      </Screen>
    );
  }
  return <Dashboard picture={picture} />;
}

function Dashboard({ picture }: { picture: FinancialPicture }) {
  const theme = useTheme();
  const { projection, today } = picture;
  const attention = picture.budgets.filter((b) => b.level !== 'ok').slice(0, 3);
  const commitments = projection.outflows.reduce((s, e) => s - e.amount, 0);
  const owed = picture.invoices.reduce((s, i) => s + i.amount, 0);

  return (
    <View style={{ flex: 1 }}>
      <Screen>
        <View style={{ gap: 2 }}>
          <Title>Resumo</Title>
          <MutedText>
            Hoje, {formatDateBR(today)}
            {picture.lastTransactionDate ? ` · último lançamento em ${formatDateBR(picture.lastTransactionDate)}` : ''}
          </MutedText>
        </View>

        <MarginHero picture={picture} />

        <AlertsSection />

        <Card style={{ gap: 4, paddingVertical: 8 }}>
          <Fact
            icon="list-outline"
            label={`Resultado de ${formatMonthBR(picture.month)} até hoje`}
            hint="Receitas menos despesas; transferências e faturas não entram."
            value={<FinancialAmount cents={picture.monthTotals.result} tone="auto" />}
          />
          <Fact
            icon="calendar-outline"
            label={`Compromissos até ${formatDateBR(projection.to)}`}
            hint={`${projection.outflows.length} conta(s) e fatura(s) ainda não pagas.`}
            value={<FinancialAmount cents={commitments} tone={commitments > 0 ? 'negative' : 'neutral'} />}
            onPress={() => router.push('/recurrences')}
          />
          {owed > 0 && (
            <Fact icon="card-outline" label="Faturas em aberto" hint="Compras no cartão ainda não pagas. O limite não é saldo." value={<FinancialAmount cents={owed} tone="negative" />} />
          )}
          {picture.balanceSummary.investments !== 0 && (
            <Fact icon="trending-up-outline" label="Investimentos" hint="Não entram como dinheiro disponível." value={<FinancialAmount cents={picture.balanceSummary.investments} />} />
          )}
        </Card>

        {projection.outflows.length + projection.incomes.length > 0 && (
          <Section title="Próximos compromissos" action={<Button label="Ver todos" variant="ghost" onPress={() => router.push('/recurrences')} />}>
            <Card style={{ gap: 2, paddingVertical: 8 }}>
              {[...projection.outflows, ...projection.incomes]
                .sort((a, b) => a.date.localeCompare(b.date))
                .slice(0, 5)
                .map((e) => (
                  <View key={`${e.label}-${e.date}`} style={styles.eventRow}>
                    <View style={[styles.dateBadge, { backgroundColor: e.overdue ? theme.colors.warningSurface : theme.colors.surfaceMuted, borderRadius: theme.radius.sm }]}>
                      <Text style={[theme.type.label, { color: e.overdue ? theme.colors.warning : theme.colors.textPrimary }]}>{formatDateBR(e.date).slice(0, 5)}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[theme.type.body, { color: theme.colors.textPrimary }]}>{e.label}</Text>
                      {e.overdue && <Text style={[theme.type.label, { color: theme.colors.warning }]}>Venceu e não há lançamento</Text>}
                      {e.source === 'invoice' && <Text style={[theme.type.label, { color: theme.colors.textSecondary }]}>Fatura do cartão</Text>}
                    </View>
                    <FinancialAmount cents={Math.abs(e.amount)} tone={e.amount > 0 ? 'positive' : 'negative'} />
                  </View>
                ))}
            </Card>
          </Section>
        )}

        <Section title="Orçamentos">
          {picture.budgets.length === 0 ? (
            <MutedText>Nenhum orçamento definido. Defina em Ajustes › Categorias, se quiser acompanhar algum gasto.</MutedText>
          ) : attention.length === 0 ? (
            <MutedText>
              Os {picture.budgets.length} orçamentos estão dentro do previsto para {formatMonthBR(picture.month)}.
            </MutedText>
          ) : (
            <Card style={{ gap: 18 }}>
              {attention.map((b) => (
                <View key={b.categoryId} style={{ gap: 4 }}>
                  <Text style={[theme.type.label, { color: b.level === 'ok' ? theme.colors.textSecondary : theme.colors.warning }]}>{BUDGET_LEVEL_LABELS[b.level]}</Text>
                  <BudgetProgress label={b.categoryName} spent={b.spent} budget={b.budget} projected={b.projected} />
                </View>
              ))}
              {picture.budgets.length > attention.length && (
                <MutedText style={{ fontSize: 13 }}>Os outros {picture.budgets.length - attention.length} estão dentro do previsto.</MutedText>
              )}
            </Card>
          )}
        </Section>

        {picture.insights.length > 0 && (
          <Section title="Para olhar">
            {picture.insights.map((i) => (
              <InsightCard
                key={i.id}
                title={i.title}
                body={i.body}
                basis={i.basis}
                icon={i.icon as IconName}
                tone={i.tone}
                action={
                  i.action && {
                    label: i.action.label,
                    onPress: () => router.push(i.action!.target === 'recurrences' ? '/recurrences' : i.action!.target === 'categories' ? '/categories' : '/transactions'),
                  }
                }
              />
            ))}
          </Section>
        )}

        <Section title="Contas" action={<Button label="Gerenciar" variant="ghost" onPress={() => router.push('/accounts')} />}>
          <Card style={{ gap: 10 }}>
            {picture.accounts.map((account) => {
              const balance = picture.balances.get(account.id) ?? 0;
              const institution = findInstitution(account.institution);
              return (
                <View key={account.id} style={styles.accountRow}>
                  <IconBubble icon={ACCOUNT_TYPE_ICONS[account.type]} color={account.color} />
                  <View style={{ flex: 1 }}>
                    <Text style={[theme.type.body, { color: theme.colors.textPrimary }]}>{account.name}</Text>
                    {institution && <Text style={[theme.type.label, { color: theme.colors.textSecondary }]}>{institution.name}</Text>}
                  </View>
                  <FinancialAmount cents={balance} />
                </View>
              );
            })}
          </Card>
        </Section>

        <Button label="Perguntar ao assistente" icon="sparkles-outline" variant="secondary" onPress={() => router.push('/assistant')} />
      </Screen>
      <Fab accessibilityLabel="Novo lançamento" onPress={() => router.push({ pathname: '/transaction/[id]', params: { id: 'new' } })} />
    </View>
  );
}

/** The one main number: margin until the next income, its chart and its calculation. */
function MarginHero({ picture }: { picture: FinancialPicture }) {
  const theme = useTheme();
  const { projection } = picture;
  const [open, setOpen] = useState(false);
  const [width, setWidth] = useState(0);

  if (projection.status === 'unavailable') {
    return (
      <Card>
        <EmptyState
          icon="wallet-outline"
          title="Falta uma conta para calcular"
          message={projection.reason ?? ''}
          action={{ label: 'Cadastrar conta', icon: 'add', onPress: () => router.push('/accounts') }}
        />
      </Card>
    );
  }

  const values = [...picture.realized.map((p) => p.balance), ...projection.series.slice(1).map((p) => p.balance)];
  const splitIndex = picture.realized.length - 1;
  const title = projection.nextIncome
    ? `Margem até o próximo recebimento (${formatDateBR(projection.nextIncome.date).slice(0, 5)})`
    : `Margem até o fim de ${formatMonthBR(picture.month).split(' de ')[0]}`;
  const lowestNegative = projection.lowest.amount < 0;
  const chartLabel =
    `Saldo disponível: ${formatCents(picture.realized[0]?.balance ?? projection.available)} no dia 1, ` +
    `${formatCents(projection.available)} hoje; previsão de ${formatCents(projection.series.at(-1)?.balance ?? projection.available)} em ${formatDateBR(projection.to)}, ` +
    `com o menor saldo de ${formatCents(projection.lowest.amount)} em ${formatDateBR(projection.lowest.date)}.`;

  return (
    <Animated.View layout={LinearTransition.duration(motion.transition)}>
      <Card elevated style={{ gap: 10 }}>
        <Text style={[theme.type.label, { color: theme.colors.textSecondary }]}>
          {projection.variable ? title : `${title}, antes dos gastos variáveis`}
        </Text>
        <FinancialAmount cents={projection.margin} size="display" />
        {projection.nextIncome && (
          <Text style={[theme.type.label, { color: theme.colors.textSecondary, marginTop: -6 }]}>
            Próxima receita: {projection.nextIncome.label}, {formatCents(projection.nextIncome.amount)}
          </Text>
        )}
        <Text style={[theme.type.label, { color: theme.colors.textSecondary }]}>
          Disponível hoje {formatCents(projection.available)}
          {' · '}
          <Text style={{ color: lowestNegative ? theme.colors.warning : theme.colors.textSecondary }}>
            menor saldo previsto {formatSignedCents(projection.lowest.amount, projection.lowest.amount < 0 ? 'minus' : 'none')} em {formatDateBR(projection.lowest.date).slice(0, 5)}
          </Text>
        </Text>

        <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ marginTop: 4 }}>
          {width > 0 && values.length > 1 && <TideLine values={values} width={width} height={72} splitIndex={splitIndex} accessibilityLabel={chartLabel} />}
        </View>
        <Text style={[theme.type.caption, { color: theme.colors.textSecondary }]}>
          Saldo disponível no mês: linha cheia até hoje, tracejada para a previsão.
        </Text>

        {projection.status === 'limited' && projection.reason && (
          <View style={[styles.notice, { backgroundColor: theme.colors.infoSurface, borderRadius: theme.radius.md }]}>
            <Icon name="information-circle-outline" size={18} color={theme.colors.info} />
            <View style={{ flex: 1, gap: 6 }}>
              <Text style={[theme.type.label, { color: theme.colors.textPrimary }]}>{projection.reason}</Text>
              {!projection.nextIncome && <Button label="Cadastrar receita prevista" variant="secondary" onPress={() => router.push({ pathname: '/recurrence/[id]', params: { id: 'new' } })} />}
            </View>
          </View>
        )}

        <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen((v) => !v)} style={styles.link}>
          <Text style={[theme.type.bodyStrong, { color: theme.colors.primary }]}>{open ? 'Ocultar cálculo' : 'Como calculamos'}</Text>
          <Icon name={open ? 'chevron-up' : 'chevron-down'} size={18} color={theme.colors.primary} />
        </Pressable>
        {open && (
          <Animated.View entering={FadeIn.duration(motion.transition)} style={{ gap: 8 }}>
            {projection.steps.map((s, i) => (
              <View key={i} style={[styles.step, s.op === '=' && { borderTopWidth: 1, borderTopColor: theme.colors.border, paddingTop: 6 }]}>
                <Text style={[theme.type.label, { flex: 1, color: theme.colors.textPrimary }]}>
                  {s.op === '=' ? '' : `${s.op} `}
                  {s.label}
                </Text>
                <Text style={[theme.type.amount, { fontSize: 14, color: theme.colors.textPrimary }]}>{formatSignedCents(s.cents, s.op === '=' && s.cents < 0 ? 'minus' : 'none')}</Text>
              </View>
            ))}
            {[...projection.outflows, ...projection.incomes].length > 0 && (
              <View style={{ gap: 2 }}>
                <Text style={[theme.type.label, { color: theme.colors.textSecondary }]}>Itens considerados:</Text>
                {[...projection.incomes, ...projection.outflows].map((e) => (
                  <Text key={`${e.label}-${e.date}`} style={[theme.type.label, { color: theme.colors.textSecondary }]}>
                    {formatDateBR(e.date).slice(0, 5)} · {e.label} · {formatSignedCents(e.amount)}
                  </Text>
                ))}
              </View>
            )}
            <Text style={[theme.type.label, { color: theme.colors.textSecondary }]}>Base: {projection.basis}</Text>
            {projection.limitations.map((l, i) => (
              <Text key={i} style={[theme.type.label, { color: theme.colors.textSecondary }]}>
                • {l}
              </Text>
            ))}
          </Animated.View>
        )}
      </Card>
    </Animated.View>
  );
}

function Fact({ icon, label, hint, value, onPress }: { icon: IconName; label: string; hint: string; value: React.ReactNode; onPress?: () => void }) {
  const theme = useTheme();
  const content = (
    <View style={styles.fact}>
      <Icon name={icon} size={20} color={theme.colors.textSecondary} />
      <View style={{ flex: 1 }}>
        <Text style={[theme.type.body, { color: theme.colors.textPrimary }]}>{label}</Text>
        <Text style={[theme.type.label, { color: theme.colors.textSecondary }]}>{hint}</Text>
      </View>
      {value}
    </View>
  );
  return onPress ? (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => ({ backgroundColor: pressed ? theme.colors.pressed : 'transparent', borderRadius: theme.radius.md })}>
      {content}
    </Pressable>
  ) : (
    content
  );
}

const styles = StyleSheet.create({
  fact: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 8, minHeight: 56 },
  eventRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, paddingHorizontal: 8, minHeight: 52 },
  dateBadge: { paddingHorizontal: 8, paddingVertical: 4, minWidth: 56, alignItems: 'center' },
  accountRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  notice: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 12 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 40, alignSelf: 'flex-start' },
  step: { flexDirection: 'row', alignItems: 'baseline', gap: 12 },
});

/** Alerts (briefing §13): each with its reason and action; dismissing hides it until the situation changes. */
function AlertsSection() {
  const { visible, dismiss, restore } = useAlerts();
  const toast = useToast();
  if (visible.length === 0) return null;
  return (
    <Section title="Avisos" action={<Button label="Preferências" variant="ghost" onPress={() => router.push('/notifications')} />}>
      {visible.map((a) => (
        <InsightCard
          key={a.key}
          title={a.title}
          body={a.body}
          basis={a.reason}
          icon={a.kind === 'cash_risk' || a.kind === 'overdue' ? 'alert-outline' : a.kind === 'due' ? 'calendar-outline' : 'information-circle-outline'}
          tone={a.severity === 'attention' ? 'attention' : 'neutral'}
          action={{
            label: a.action.label,
            onPress: () => router.push(a.action.target === 'recurrences' ? '/recurrences' : a.action.target === 'goals' ? '/goals' : '/transactions'),
          }}
          onDismiss={async () => {
            await dismiss(a.key);
            toast({ message: 'Aviso dispensado.', action: { label: 'Desfazer', onPress: () => void restore(a.key) } });
          }}
        />
      ))}
    </Section>
  );
}

import { useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { FINANCE_SETTINGS } from '../src/ai/finance/tools';
import { addMonthsToDateKey, formatDateBR, parseDateInput, todayKey } from '../src/domain/dates';
import { goalPlan } from '../src/domain/financeQueries';
import { formatCents } from '../src/domain/money';
import type { Account, Cents, Goal, ReservePurpose } from '../src/domain/types';
import { confirm } from '../src/platform/dialogs';
import { logError, userFacingError } from '../src/platform/errors';
import { useRepositories } from '../src/state/DataProvider';
import { useQuery } from '../src/state/useQuery';
import { Button, Card, Chip, ChipRow, MutedText, SectionTitle, TextField } from '../src/ui/components';
import { CONTENT_MAX_WIDTH } from '../src/ui/layout';
import { MoneyInput } from '../src/ui/MoneyInput';
import { useTheme } from '../src/ui/theme';
import { useToast } from '../src/ui/Toast';

const PURPOSE_LABELS: Record<ReservePurpose, string> = { emergency: 'Emergência', goal: 'Meta', other: 'Outra' };

/** Monthly contribution dates on `day`, from next month until the deadline (inclusive). */
function monthlyDates(today: string, deadline: string, day: number): string[] {
  const dates: string[] = [];
  let d = addMonthsToDateKey(`${today.slice(0, 7)}-${String(day).padStart(2, '0')}`, 1);
  while (d <= deadline && dates.length < 120) {
    dates.push(d);
    d = addMonthsToDateKey(d, 1);
  }
  return dates;
}

/**
 * Ajustes › Metas, reservas e saldo mínimo: money set aside stays in the
 * account balance but is never counted as free (AI contract §4, semantics 6).
 */
export default function GoalsScreen() {
  const theme = useTheme();
  const repos = useRepositories();
  const toast = useToast();
  const today = todayKey();
  const { data } = useQuery(
    async (r) => {
      const [goals, reserves, accounts, floor, operating] = await Promise.all([
        r.goals.list(),
        r.goals.listReserves(),
        r.accounts.list(),
        r.settings.get<{ amount: Cents } | null>(FINANCE_SETTINGS.operatingFloor, null),
        r.settings.get<string[] | null>(FINANCE_SETTINGS.operatingAccounts, null),
      ]);
      return { goals, reserves, accounts, floor, operating };
    },
    ['goals', 'reserves', 'accounts', 'settings']
  );


  const [goalName, setGoalName] = useState('');
  const [goalTarget, setGoalTarget] = useState<Cents>(0);
  const [goalDeadline, setGoalDeadline] = useState('');
  const [goalDay, setGoalDay] = useState('5');

  const [reserveName, setReserveName] = useState('');
  const [reserveAmount, setReserveAmount] = useState<Cents>(0);
  const [reserveAccount, setReserveAccount] = useState<string | null>(null);
  const [reservePurpose, setReservePurpose] = useState<ReservePurpose>('emergency');
  const [reserveGoal, setReserveGoal] = useState<string | null>(null);

  async function run(action: () => Promise<void>, done: string) {
    try {
      await action();
      toast({ message: done, tone: 'success' });
    } catch (error) {
      logError('goals', error);
      toast({ message: userFacingError(error, 'Não foi possível salvar.'), tone: 'error' });
    }
  }


  const createGoal = () =>
    run(async () => {
      const deadline = parseDateInput(goalDeadline);
      if (!deadline || deadline <= today) throw new Error('Informe uma data futura, como 05/01/2027.');
      const day = Math.min(28, Math.max(1, Number(goalDay) || 5));
      await repos.goals.create({ name: goalName, targetAmount: goalTarget, deadline, contributionDates: monthlyDates(today, deadline, day) });
      setGoalName('');
      setGoalTarget(0);
      setGoalDeadline('');
    }, 'Meta criada.');

  const createReserve = () =>
    run(async () => {
      if (!reserveAccount) throw new Error('Escolha a conta onde o dinheiro está guardado.');
      await repos.goals.createReserve({
        accountId: reserveAccount,
        purpose: reservePurpose,
        goalId: reservePurpose === 'goal' ? reserveGoal : null,
        name: reserveName || (reservePurpose === 'goal' ? (data?.goals.find((g) => g.id === reserveGoal)?.name ?? 'Meta') : PURPOSE_LABELS[reservePurpose]),
        amount: reserveAmount,
      });
      setReserveName('');
      setReserveAmount(0);
    }, 'Reserva criada.');

  async function removeGoal(goal: Goal) {
    const ok = await confirm('Apagar meta', `Apaga "${goal.name}" e as reservas ligadas a ela. O dinheiro continua na conta, agora livre.`, {
      confirmLabel: 'Apagar',
      destructive: true,
    });
    if (ok) await run(() => repos.goals.remove(goal.id), 'Meta apagada.');
  }

  const accountName = (id: string) => data?.accounts.find((a) => a.id === id)?.name ?? '—';

  return (
    <ScrollView style={{ backgroundColor: theme.colors.background }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <SectionTitle>Saldo mínimo</SectionTitle>
      {data && (
        <FloorCard
          key={`${data.floor?.amount ?? 0}-${(data.operating ?? []).join()}`}
          accounts={data.accounts}
          savedFloor={data.floor?.amount ?? 0}
          savedOperating={data.operating ?? data.accounts.filter((a) => a.type === 'checking' || a.type === 'wallet').map((a) => a.id)}
          onSave={(floor, operating) =>
            run(async () => {
              await repos.settings.set(FINANCE_SETTINGS.operatingFloor, floor > 0 ? { amount: floor } : null);
              await repos.settings.set(FINANCE_SETTINGS.operatingAccounts, operating);
            }, 'Saldo mínimo salvo.')
          }
        />
      )}

      <SectionTitle>Metas</SectionTitle>
      {(data?.goals ?? []).map((g) => {
        const plan = goalPlan(g, data!.reserves, today);
        return (
          <Card key={g.id} style={{ gap: 6 }}>
            <Text style={[theme.type.bodyStrong, { color: theme.colors.textPrimary }]}>{g.name}</Text>
            <Text style={[theme.type.body, { color: theme.colors.textPrimary }]}>
              {formatCents(plan.reserved)} reservados de {formatCents(g.targetAmount)}
              {g.deadline ? ` até ${formatDateBR(g.deadline)}` : ''}
            </Text>
            <MutedText>
              {plan.status === 'done'
                ? 'Meta completa.'
                : plan.status === 'no_schedule'
                  ? `Faltam ${formatCents(plan.remaining)}, sem datas de aporte futuras.`
                  : `Faltam ${formatCents(plan.remaining)}: ${plan.contributions.length} aporte(s) a partir de ${formatDateBR(plan.contributions[0].date)}, de ${formatCents(plan.contributions[0].amount)}. Sem rendimento na conta.`}
            </MutedText>
            <Button label="Apagar meta" variant="ghost" onPress={() => removeGoal(g)} />
          </Card>
        );
      })}
      <Card style={{ gap: 10 }}>
        <Text style={[theme.type.bodyStrong, { color: theme.colors.textPrimary }]}>Nova meta</Text>
        <TextField label="Nome" placeholder="Ex.: Viagem" value={goalName} onChangeText={setGoalName} />
        <MoneyInput label="Valor da meta" value={goalTarget} onChange={setGoalTarget} size="regular" />
        <TextField label="Até quando" placeholder="dd/mm/aaaa" value={goalDeadline} onChangeText={setGoalDeadline} />
        <TextField label="Dia do mês para guardar" placeholder="5" value={goalDay} onChangeText={setGoalDay} keyboardType="number-pad" />
        <Button label="Criar meta" onPress={createGoal} disabled={!goalName.trim() || goalTarget <= 0} />
      </Card>

      <SectionTitle>Reservas</SectionTitle>
      <MutedText>Dinheiro separado dentro de uma conta. Continua no saldo da conta, mas não conta como livre.</MutedText>
      {(data?.reserves ?? []).map((r) => (
        <Card key={r.id} style={{ gap: 4 }}>
          <Text style={[theme.type.bodyStrong, { color: theme.colors.textPrimary }]}>
            {r.name} · {formatCents(r.amount)}
          </Text>
          <MutedText>
            {PURPOSE_LABELS[r.purpose]} · em {accountName(r.accountId)}
          </MutedText>
          <Button label="Apagar reserva" variant="ghost" onPress={() => run(() => repos.goals.removeReserve(r.id), 'Reserva apagada.')} />
        </Card>
      ))}
      <Card style={{ gap: 10 }}>
        <Text style={[theme.type.bodyStrong, { color: theme.colors.textPrimary }]}>Nova reserva</Text>
        <ChipRow>
          {(['emergency', 'goal', 'other'] as const).map((p) => (
            <Chip key={p} label={PURPOSE_LABELS[p]} selected={reservePurpose === p} onPress={() => setReservePurpose(p)} />
          ))}
        </ChipRow>
        {reservePurpose === 'goal' && (
          <ChipRow>
            {(data?.goals ?? []).map((g) => (
              <Chip key={g.id} label={g.name} selected={reserveGoal === g.id} onPress={() => setReserveGoal(g.id)} />
            ))}
          </ChipRow>
        )}
        <Text style={[theme.type.label, { color: theme.colors.textSecondary }]}>Em qual conta</Text>
        <ChipRow>
          {(data?.accounts ?? [])
            .filter((a) => a.type !== 'credit_card')
            .map((a) => (
              <Chip key={a.id} label={a.name} selected={reserveAccount === a.id} onPress={() => setReserveAccount(a.id)} />
            ))}
        </ChipRow>
        <TextField label="Nome (opcional)" value={reserveName} onChangeText={setReserveName} />
        <MoneyInput label="Valor reservado" value={reserveAmount} onChange={setReserveAmount} size="regular" />
        <Button
          label="Criar reserva"
          onPress={createReserve}
          disabled={reserveAmount <= 0 || !reserveAccount || (reservePurpose === 'goal' && !reserveGoal)}
        />
      </Card>
    </ScrollView>
  );
}

/** Starts from the saved values; remounted (by key) when they change. */
function FloorCard({
  accounts,
  savedFloor,
  savedOperating,
  onSave,
}: {
  accounts: Account[];
  savedFloor: Cents;
  savedOperating: string[];
  onSave: (floor: Cents, operating: string[]) => void;
}) {
  const theme = useTheme();
  const [floor, setFloor] = useState<Cents>(savedFloor);
  const [operating, setOperating] = useState<string[]>(savedOperating);
  return (
    <Card style={{ gap: 10 }}>
      <MutedText>
        O valor que você quer manter nas contas do dia a dia. O assistente usa este piso para dizer se uma compra cabe; ele não
        bloqueia nada.
      </MutedText>
      <MoneyInput label="Saldo mínimo" value={floor} onChange={setFloor} size="regular" />
      <Text style={[theme.type.label, { color: theme.colors.textSecondary }]}>Contas do dia a dia</Text>
      <ChipRow>
        {accounts
          .filter((a) => a.type !== 'credit_card' && a.type !== 'investment')
          .map((a) => (
            <Chip
              key={a.id}
              label={a.name}
              selected={operating.includes(a.id)}
              onPress={() => setOperating((prev) => (prev.includes(a.id) ? prev.filter((x) => x !== a.id) : [...prev, a.id]))}
            />
          ))}
      </ChipRow>
      <Button label="Salvar" onPress={() => onSave(floor, operating)} />
    </Card>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, paddingBottom: 48, width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
});

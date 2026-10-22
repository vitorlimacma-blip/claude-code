import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ValidationError } from '../../src/data/context';
import { buildCategoryTree } from '../../src/domain/categories';
import { monthRange } from '../../src/domain/dates';
import { ACCOUNT_TYPE_ICONS, PAYMENT_METHOD_LABELS } from '../../src/domain/labels';
import type { Account, Category, PaymentMethod, Recurrence, RecurrenceFrequency } from '../../src/domain/types';
import { notify } from '../../src/platform/dialogs';
import { logError, userFacingError } from '../../src/platform/errors';
import { useRepositories } from '../../src/state/DataProvider';
import { useQuery } from '../../src/state/useQuery';
import { useToday } from '../../src/state/useToday';
import { Button, Chip, ChipRow, MutedText, SegmentedControl, TextField } from '../../src/ui/components';
import { CONTENT_MAX_WIDTH } from '../../src/ui/layout';
import { MoneyInput } from '../../src/ui/MoneyInput';
import { AccountSelector } from '../../src/ui/selectors';
import { useTheme } from '../../src/ui/theme';
import { useToast } from '../../src/ui/Toast';
import { SCREEN_PADDING } from '../../src/ui/tokens';

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const METHODS: PaymentMethod[] = ['pix', 'boleto', 'debit', 'credit', 'transfer', 'other'];

export default function RecurrenceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const { data } = useQuery(
    async (r) => {
      const [accounts, categories, recurrence] = await Promise.all([r.accounts.list(), r.categories.list(), isNew ? undefined : r.recurrences.get(id)]);
      return { accounts, categories, recurrence };
    },
    [],
    [id]
  );
  if (!data) return null;
  return (
    <>
      <Stack.Screen options={{ title: isNew ? 'Nova conta prevista' : 'Editar conta prevista' }} />
      <RecurrenceForm {...data} />
    </>
  );
}

function RecurrenceForm({ accounts, categories, recurrence }: { accounts: Account[]; categories: Category[]; recurrence?: Recurrence }) {
  const theme = useTheme();
  const repos = useRepositories();
  const toast = useToast();
  const today = useToday();
  const [kind, setKind] = useState<'expense' | 'income'>(recurrence?.kind ?? 'expense');
  const [description, setDescription] = useState(recurrence?.description ?? '');
  const [amount, setAmount] = useState(recurrence?.amount ?? 0);
  const [day, setDay] = useState(String(recurrence?.dayOfMonth ?? Number(today.slice(8, 10))));
  const [frequency, setFrequency] = useState<RecurrenceFrequency>(recurrence?.frequency ?? 'monthly');
  const [monthOfYear, setMonthOfYear] = useState(recurrence?.monthOfYear ?? Number(today.slice(5, 7)));
  const [accountId, setAccountId] = useState(recurrence?.accountId ?? accounts.find((a) => a.type === 'checking')?.id ?? accounts[0]?.id ?? '');
  const [categoryId, setCategoryId] = useState<string | null>(recurrence?.categoryId ?? null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(recurrence?.paymentMethod ?? 'pix');
  const [saving, setSaving] = useState(false);

  const tree = useMemo(() => buildCategoryTree(categories.filter((c) => c.kind === kind && (!c.archived || c.id === categoryId))), [categories, kind, categoryId]);
  const selected = categories.find((c) => c.id === categoryId);
  const rootId = selected?.parentId ?? selected?.id;
  const root = tree.find((n) => n.category.id === rootId);

  async function save() {
    if (saving) return;
    setSaving(true);
    const input = {
      kind,
      description,
      amount,
      dayOfMonth: Number(day),
      frequency,
      monthOfYear: frequency === 'yearly' ? monthOfYear : null,
      accountId,
      categoryId,
      paymentMethod,
    };
    try {
      if (recurrence) await repos.recurrences.update(recurrence.id, input);
      else await repos.recurrences.create({ ...input, startDate: monthRange(today.slice(0, 7)).from });
      router.back();
      toast({ message: recurrence ? 'Conta prevista atualizada' : 'Conta prevista criada', tone: 'success' });
    } catch (err) {
      if (!(err instanceof ValidationError)) logError('recurrence.save', err);
      notify('Não foi possível salvar', userFacingError(err, 'Seus dados continuam aqui; tente de novo.'));
      setSaving(false);
    }
  }

  async function remove() {
    if (!recurrence) return;
    await repos.recurrences.remove(recurrence.id);
    router.back();
    toast({
      message: 'Conta prevista excluída',
      action: { label: 'Desfazer', onPress: () => void repos.recurrences.restore(recurrence.id) },
    });
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={{ backgroundColor: theme.colors.background }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <SegmentedControl
          value={kind}
          onChange={(k) => {
            setKind(k);
            if (selected && selected.kind !== k) setCategoryId(null);
          }}
          options={[
            { value: 'expense', label: 'Conta a pagar' },
            { value: 'income', label: 'Receita prevista' },
          ]}
        />
        <TextField label="Descrição" placeholder={kind === 'income' ? 'Ex.: Salário' : 'Ex.: Aluguel, energia, internet'} value={description} onChangeText={setDescription} autoFocus={!recurrence} />
        <MoneyInput label="Valor previsto" value={amount} onChange={setAmount} size="regular" sign={kind === 'income' ? '+' : '−'} />
        <MutedText style={{ fontSize: 13, marginTop: -8 }}>Para contas que variam (energia, água), use um valor médio; o valor real vem do lançamento.</MutedText>

        <SegmentedControl
          value={frequency}
          onChange={setFrequency}
          options={[
            { value: 'monthly', label: 'Todo mês' },
            { value: 'yearly', label: 'Uma vez por ano' },
          ]}
        />
        <TextField label="Dia do vencimento" value={day} onChangeText={(t) => setDay(t.replace(/\D/g, '').slice(0, 2))} keyboardType="number-pad" placeholder="1 a 31" />
        {frequency === 'yearly' && (
          <View style={{ gap: 6 }}>
            <Text style={[theme.type.label, { color: theme.colors.textSecondary }]}>Mês</Text>
            <ChipRow>
              {MONTHS.map((m, i) => (
                <Chip key={m} label={m} selected={monthOfYear === i + 1} onPress={() => setMonthOfYear(i + 1)} />
              ))}
            </ChipRow>
          </View>
        )}

        <AccountSelector
          label={kind === 'income' ? 'Entra em' : 'Sai de'}
          accounts={accounts.map((a) => ({ id: a.id, name: a.name, icon: ACCOUNT_TYPE_ICONS[a.type], color: a.color }))}
          value={accountId}
          onChange={setAccountId}
        />
        {accounts.find((a) => a.id === accountId)?.type === 'credit_card' && (
          <MutedText style={{ fontSize: 13, marginTop: -8 }}>No cartão, ela entra na fatura; a margem considera a fatura no vencimento dela.</MutedText>
        )}

        <View style={{ gap: 6 }}>
          <Text style={[theme.type.label, { color: theme.colors.textSecondary }]}>Forma de pagamento</Text>
          <ChipRow>
            {METHODS.map((m) => (
              <Chip key={m} label={PAYMENT_METHOD_LABELS[m]} selected={paymentMethod === m} onPress={() => setPaymentMethod(m)} />
            ))}
          </ChipRow>
        </View>

        <View style={{ gap: 6 }}>
          <Text style={[theme.type.label, { color: theme.colors.textSecondary }]}>Categoria (ajuda a reconhecer o pagamento)</Text>
          <ChipRow>
            {tree.map(({ category }) => (
              <Chip key={category.id} label={category.name} icon={category.icon} color={category.color} selected={category.id === rootId} onPress={() => setCategoryId(category.id === categoryId ? null : category.id)} />
            ))}
          </ChipRow>
          {root && root.children.length > 0 && (
            <ChipRow>
              {root.children.map((child) => (
                <Chip key={child.id} label={child.name} selected={child.id === categoryId} onPress={() => setCategoryId(child.id === categoryId ? root.category.id : child.id)} />
              ))}
            </ChipRow>
          )}
        </View>

        <View style={{ gap: 10, marginTop: 8 }}>
          <Button label={saving ? 'Salvando…' : 'Salvar'} icon="checkmark" onPress={save} disabled={saving} haptic />
          {recurrence && <Button label="Excluir" icon="trash-outline" variant="ghost" onPress={remove} />}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { padding: SCREEN_PADDING, gap: 18, paddingBottom: 64, width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
});

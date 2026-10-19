import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { ValidationError } from '../../src/data/context';
import type { Repositories } from '../../src/data/repositories';
import { buildCategoryTree } from '../../src/domain/categories';
import { formatDateBR, parseDateInput } from '../../src/domain/dates';
import { PAYMENT_METHOD_LABELS } from '../../src/domain/labels';
import { centsToInput, parseAmountToCents } from '../../src/domain/money';
import { PAYMENT_METHODS, type Account, type Category, type PaymentMethod, type Transaction } from '../../src/domain/types';
import { useRepositories } from '../../src/state/DataProvider';
import { useQuery } from '../../src/state/useQuery';
import { useToday } from '../../src/state/useToday';
import { Button, Chip, ChipRow, MutedText, SectionTitle, SegmentedControl, TextField } from '../../src/ui/components';
import { useTheme } from '../../src/ui/theme';

type FormType = 'expense' | 'income' | 'transfer';

export default function TransactionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const { data } = useQuery(
    async (r) => {
      const [categories, accounts, transaction] = await Promise.all([
        r.categories.list(),
        r.accounts.list(),
        isNew ? undefined : r.transactions.get(id),
      ]);
      const pair = transaction?.transferPairId ? await r.transactions.getTransferPair(transaction.transferPairId) : [];
      const counterpart = pair.find((t) => t.id !== transaction?.id);
      return { categories, accounts, transaction, counterpart };
    },
    ['categories', 'accounts'],
    [id]
  );

  if (!data) return null;
  return (
    <>
      <Stack.Screen options={{ title: isNew ? 'Novo lançamento' : 'Editar lançamento' }} />
      <TransactionForm {...data} />
    </>
  );
}

function TransactionForm({
  categories,
  accounts,
  transaction,
  counterpart,
}: {
  categories: Category[];
  accounts: Account[];
  transaction?: Transaction;
  counterpart?: Transaction;
}) {
  const theme = useTheme();
  const repos = useRepositories();
  const today = useToday();

  const isTransfer = !!transaction?.transferPairId;
  const outLeg = transaction?.type === 'transfer_out' ? transaction : counterpart;
  const inLeg = transaction?.type === 'transfer_in' ? transaction : counterpart;

  const [type, setType] = useState<FormType>(
    isTransfer ? 'transfer' : transaction?.type === 'income' ? 'income' : 'expense'
  );
  const [amount, setAmount] = useState(transaction ? centsToInput(transaction.amount) : '');
  const [accountId, setAccountId] = useState(
    (isTransfer ? outLeg?.accountId : transaction?.accountId) ?? accounts[0]?.id ?? ''
  );
  const [toAccountId, setToAccountId] = useState(inLeg?.accountId ?? accounts.find((a) => a.id !== accountId)?.id ?? '');
  const [categoryId, setCategoryId] = useState<string | null>(transaction?.categoryId ?? null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(transaction?.paymentMethod ?? 'pix');
  const [date, setDate] = useState(formatDateBR(transaction?.date ?? today));
  const [description, setDescription] = useState(transaction?.description ?? '');

  const kind = type === 'income' ? 'income' : 'expense';
  const tree = useMemo(() => buildCategoryTree(categories.filter((c) => c.kind === kind)), [categories, kind]);
  const selected = categories.find((c) => c.id === categoryId);
  const selectedRootId = selected?.parentId ?? selected?.id;
  const selectedRoot = tree.find((n) => n.category.id === selectedRootId);

  function changeType(next: FormType) {
    setType(next);
    if (selected && selected.kind !== (next === 'income' ? 'income' : 'expense')) setCategoryId(null);
  }

  async function save() {
    const cents = parseAmountToCents(amount);
    const dateKey = parseDateInput(date);
    if (!dateKey) {
      Alert.alert('Data inválida', 'Use o formato dd/mm/aaaa.');
      return;
    }
    try {
      await persist(repos, {
        transaction,
        type,
        amount: cents,
        date: dateKey,
        accountId,
        toAccountId,
        categoryId,
        paymentMethod,
        description,
      });
      router.back();
    } catch (err) {
      if (err instanceof ValidationError) Alert.alert('Verifique os dados', err.message);
      else throw err;
    }
  }

  function remove() {
    if (!transaction) return;
    Alert.alert('Excluir lançamento', isTransfer ? 'As duas pontas da transferência serão excluídas.' : 'Deseja excluir este lançamento?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          await repos.transactions.remove(transaction.id);
          router.back();
        },
      },
    ]);
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={{ backgroundColor: theme.colors.background }}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {!isTransfer && (
          <SegmentedControl
            value={type}
            onChange={changeType}
            options={[
              { value: 'expense', label: 'Despesa', color: theme.colors.danger },
              { value: 'income', label: 'Receita', color: theme.colors.positive },
              // An existing expense/income can't become a transfer (it would need a second account).
              ...(transaction ? [] : [{ value: 'transfer' as const, label: 'Transferência' }]),
            ]}
          />
        )}

        <TextField
          label="Valor (R$)"
          placeholder="0,00"
          keyboardType="decimal-pad"
          value={amount}
          onChangeText={setAmount}
          autoFocus={!transaction}
          style={{ fontSize: 28, fontWeight: '700' }}
        />

        {type !== 'transfer' && (
          <>
            <SectionTitle>Categoria</SectionTitle>
            <ChipRow>
              {tree.map(({ category }) => (
                <Chip
                  key={category.id}
                  label={category.name}
                  icon={category.icon}
                  color={category.color}
                  selected={category.id === selectedRootId}
                  onPress={() => setCategoryId(category.id === categoryId ? null : category.id)}
                />
              ))}
            </ChipRow>
            {selectedRoot && selectedRoot.children.length > 0 && (
              <>
                <MutedText>Subcategoria de {selectedRoot.category.name} (opcional)</MutedText>
                <ChipRow>
                  {selectedRoot.children.map((child) => (
                    <Chip
                      key={child.id}
                      label={child.name}
                      color={child.color}
                      selected={child.id === categoryId}
                      onPress={() => setCategoryId(child.id === categoryId ? selectedRoot.category.id : child.id)}
                    />
                  ))}
                </ChipRow>
              </>
            )}
          </>
        )}

        {!isTransfer && (
          <>
            <SectionTitle>{type === 'transfer' ? 'De' : 'Conta'}</SectionTitle>
            <AccountChips accounts={accounts} value={accountId} onChange={setAccountId} />
          </>
        )}
        {type === 'transfer' && !isTransfer && (
          <>
            <SectionTitle>Para</SectionTitle>
            {accounts.length < 2 ? (
              <MutedText>Cadastre pelo menos duas contas para fazer transferências (Etapa 1).</MutedText>
            ) : (
              <AccountChips accounts={accounts} value={toAccountId} onChange={setToAccountId} />
            )}
          </>
        )}

        {type !== 'transfer' && (
          <>
            <SectionTitle>Forma de pagamento</SectionTitle>
            <ChipRow>
              {PAYMENT_METHODS.map((m) => (
                <Chip
                  key={m}
                  label={PAYMENT_METHOD_LABELS[m]}
                  selected={m === paymentMethod}
                  onPress={() => setPaymentMethod(m)}
                />
              ))}
            </ChipRow>
          </>
        )}

        <TextField label="Data" placeholder="dd/mm/aaaa" value={date} onChangeText={setDate} keyboardType="numbers-and-punctuation" />
        <TextField
          label="Descrição (opcional)"
          placeholder={type === 'transfer' ? 'Ex.: pagamento da fatura' : 'Ex.: almoço, conta de luz'}
          value={description}
          onChangeText={setDescription}
        />

        <View style={{ gap: 10, marginTop: 8 }}>
          <Button label="Salvar" icon="checkmark" onPress={save} />
          {transaction && <Button label="Excluir" variant="danger" icon="trash-outline" onPress={remove} />}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function AccountChips({
  accounts,
  value,
  onChange,
}: {
  accounts: Account[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <ChipRow>
      {accounts.map((a) => (
        <Chip key={a.id} label={a.name} color={a.color} selected={a.id === value} onPress={() => onChange(a.id)} />
      ))}
    </ChipRow>
  );
}

async function persist(
  repos: Repositories,
  form: {
    transaction?: Transaction;
    type: FormType;
    amount: number;
    date: string;
    accountId: string;
    toAccountId: string;
    categoryId: string | null;
    paymentMethod: PaymentMethod;
    description: string;
  }
) {
  const { transaction } = form;
  if (form.type === 'transfer') {
    if (transaction) {
      await repos.transactions.update(transaction.id, {
        amount: form.amount,
        date: form.date,
        description: form.description,
      });
    } else {
      await repos.transactions.createTransfer({
        fromAccountId: form.accountId,
        toAccountId: form.toAccountId,
        amount: form.amount,
        date: form.date,
        description: form.description,
      });
    }
    return;
  }

  const values = {
    accountId: form.accountId,
    categoryId: form.categoryId,
    type: form.type,
    amount: form.amount,
    date: form.date,
    paymentMethod: form.paymentMethod,
    description: form.description,
  };
  if (transaction) await repos.transactions.update(transaction.id, values);
  else await repos.transactions.create(values);
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, paddingBottom: 48 },
});

import { randomUUID } from 'expo-crypto';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import type { CategorySuggestion } from '../../src/ai/categorizer';
import { ValidationError } from '../../src/data/context';
import type { TransactionPatch } from '../../src/data/repositories';
import { descriptionSuggestions, lastUsedAccountId, type DescriptionSuggestion } from '../../src/domain/autocomplete';
import { buildCategoryTree } from '../../src/domain/categories';
import { addDaysToDateKey, formatDateBR, formatMonthBR, parseDateInput } from '../../src/domain/dates';
import { ACCOUNT_TYPE_ICONS, NATURE_LABELS, PAYMENT_METHOD_LABELS } from '../../src/domain/labels';
import { inferTransferNature, refundableAmount, splitInstallments } from '../../src/domain/ledger';
import { formatCents } from '../../src/domain/money';
import type { Account, Category, CategorySource, DateKey, PaymentMethod, Transaction } from '../../src/domain/types';
import { notify } from '../../src/platform/dialogs';
import { logError, userFacingError } from '../../src/platform/errors';
import { successFeedback } from '../../src/platform/haptics';
import { useRepositories } from '../../src/state/DataProvider';
import { useCategorizer } from '../../src/state/useCategorizer';
import { useQuery } from '../../src/state/useQuery';
import { useToday } from '../../src/state/useToday';
import { BottomSheet } from '../../src/ui/BottomSheet';
import { Button, Card, Chip, ChipRow, MutedText, SegmentedControl, TextField } from '../../src/ui/components';
import { Icon } from '../../src/ui/icons';
import { CONTENT_MAX_WIDTH } from '../../src/ui/layout';
import { MoneyInput } from '../../src/ui/MoneyInput';
import { AccountSelector, type AccountOption } from '../../src/ui/selectors';
import { useTheme } from '../../src/ui/theme';
import { useToast } from '../../src/ui/Toast';
import { SCREEN_PADDING } from '../../src/ui/tokens';

type FormType = 'expense' | 'income' | 'transfer';

/** Payment methods offered in the form, most common first. */
const FORM_METHODS: PaymentMethod[] = ['pix', 'debit', 'credit', 'cash', 'boleto', 'other'];
const HISTORY_LIMIT = 800;

function defaultMethod(account: Account | undefined): PaymentMethod {
  if (account?.type === 'credit_card') return 'credit';
  if (account?.type === 'wallet') return 'cash';
  return 'pix';
}

function accountOptions(accounts: Account[]): AccountOption[] {
  return accounts.map((a) => ({
    id: a.id,
    name: a.name,
    icon: ACCOUNT_TYPE_ICONS[a.type],
    color: a.color,
    detail: a.type === 'credit_card' && a.closingDay ? `Cartão · fecha dia ${a.closingDay}` : undefined,
  }));
}

export default function TransactionScreen() {
  const { id, duplicate } = useLocalSearchParams<{ id: string; duplicate?: string }>();
  const isNew = id === 'new';
  // Not refreshed on transaction changes: the form keeps what is being typed.
  const { data } = useQuery(
    async (r) => {
      const [categories, accounts, history, transaction, template] = await Promise.all([
        r.categories.list(),
        r.accounts.list(),
        r.transactions.list({ limit: HISTORY_LIMIT }),
        isNew ? undefined : r.transactions.get(id),
        duplicate ? r.transactions.get(duplicate) : undefined,
      ]);
      const pair = transaction?.transferPairId ? await r.transactions.getTransferPair(transaction.transferPairId) : [];
      const refundOrigin = transaction?.refundOfId ? await r.transactions.get(transaction.refundOfId) : undefined;
      const refunds = transaction && !transaction.transferPairId ? await r.transactions.listRefunds(transaction.id) : [];
      const installments = transaction?.installmentGroupId ? await r.transactions.listInstallments(transaction.installmentGroupId) : [];
      return {
        categories,
        accounts,
        history,
        transaction,
        template,
        counterpart: pair.find((t) => t.id !== transaction?.id),
        refundOrigin,
        refunds,
        installments,
      };
    },
    ['categories', 'accounts'],
    [id, duplicate]
  );

  if (!data) return null;
  if (!isNew && !data.transaction) {
    return (
      <View style={{ padding: 24 }}>
        <Stack.Screen options={{ title: 'Lançamento' }} />
        <MutedText>Este lançamento não existe mais.</MutedText>
      </View>
    );
  }
  return (
    <>
      <Stack.Screen options={{ title: isNew ? (duplicate ? 'Duplicar lançamento' : 'Novo lançamento') : 'Editar lançamento' }} />
      <TransactionForm key={`${id}-${duplicate ?? ''}`} {...data} />
    </>
  );
}

function TransactionForm({
  categories,
  accounts,
  history,
  transaction,
  template,
  counterpart,
  refundOrigin,
  refunds,
  installments,
}: {
  categories: Category[];
  accounts: Account[];
  history: Transaction[];
  transaction?: Transaction;
  template?: Transaction;
  counterpart?: Transaction;
  refundOrigin?: Transaction;
  refunds: Transaction[];
  installments: Transaction[];
}) {
  const theme = useTheme();
  const repos = useRepositories();
  const toast = useToast();
  const today = useToday();
  const { suggest } = useCategorizer();

  const source = transaction ?? template;
  const isTransfer = !!transaction?.transferPairId;
  const isRefund = transaction?.nature === 'refund';
  const outLeg = transaction?.type === 'transfer_out' ? transaction : counterpart;
  const inLeg = transaction?.type === 'transfer_in' ? transaction : counterpart;

  const suggestedAccountId = useMemo(
    () => (source ? null : lastUsedAccountId(history, new Set(accounts.map((a) => a.id)))),
    [source, history, accounts]
  );
  const initialAccountId =
    (isTransfer ? outLeg?.accountId : source?.accountId) ?? suggestedAccountId ?? accounts[0]?.id ?? '';

  // A client-generated id makes saving idempotent: a double tap or a retry can't create a second row.
  const clientId = useRef(randomUUID()).current;
  const [type, setType] = useState<FormType>(
    isTransfer ? 'transfer' : source?.type === 'income' ? 'income' : 'expense'
  );
  const [amount, setAmount] = useState(transaction?.amount ?? template?.amount ?? 0);
  const [description, setDescription] = useState(source?.description ?? '');
  const [accountId, setAccountId] = useState(initialAccountId);
  const [toAccountId, setToAccountId] = useState(inLeg?.accountId ?? accounts.find((a) => a.id !== initialAccountId)?.id ?? '');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(
    source?.paymentMethod ?? defaultMethod(accounts.find((a) => a.id === initialAccountId))
  );
  const [methodTouched, setMethodTouched] = useState(!!source);
  const [categoryId, setCategoryId] = useState<string | null>(source?.categoryId ?? null);
  const [categoryTouched, setCategoryTouched] = useState(!!source?.categoryId);
  const [categorySource, setCategorySource] = useState<CategorySource | null>(null);
  // The category the learner proposed, until the user picks one themselves.
  const [suggestion, setSuggestion] = useState<CategorySuggestion | null>(null);
  const [date, setDate] = useState<DateKey>(transaction?.date ?? today);
  const [dateText, setDateText] = useState('');
  const [notes, setNotes] = useState(source?.notes ?? '');
  const [pending, setPending] = useState(transaction?.status === 'pending');
  const [installmentCount, setInstallmentCount] = useState('1');
  const [showMore, setShowMore] = useState(false);
  const [descriptionFocused, setDescriptionFocused] = useState(false);
  const [saving, setSaving] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const kind = type === 'income' ? 'income' : 'expense';
  const pickable = categories.filter((c) => c.kind === kind && (!c.archived || c.id === categoryId));
  const tree = useMemo(() => buildCategoryTree(pickable), [pickable]);
  const selected = categories.find((c) => c.id === categoryId);
  const selectedRootId = selected?.parentId ?? selected?.id;
  const selectedRoot = tree.find((n) => n.category.id === selectedRootId);
  const account = accounts.find((a) => a.id === accountId);
  const toAccount = accounts.find((a) => a.id === toAccountId);
  const count = Math.max(1, Math.floor(Number(installmentCount)) || 1);
  const canSplit = !transaction && type === 'expense';
  const autocomplete = useMemo(
    () => (descriptionFocused && type !== 'transfer' ? descriptionSuggestions(history, description, kind, 4) : []),
    [descriptionFocused, type, history, description, kind]
  );

  // Suggest a category from the description while the user hasn't chosen one.
  useEffect(() => {
    if (categoryTouched || type === 'transfer' || description.trim().length < 3) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      suggest(description, kind).then((result) => {
        if (cancelled || !result) return;
        setSuggestion(result);
        setCategoryId(result.categoryId);
      });
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [description, kind, type, categoryTouched, suggest]);

  function changeType(next: FormType) {
    setType(next);
    if (selected && selected.kind !== (next === 'income' ? 'income' : 'expense')) {
      setCategoryId(null);
      setCategoryTouched(false);
      setSuggestion(null);
    }
  }

  function changeAccount(id: string) {
    setAccountId(id);
    if (!methodTouched) setPaymentMethod(defaultMethod(accounts.find((a) => a.id === id)));
  }

  function pickCategory(id: string | null) {
    setCategoryTouched(true);
    setSuggestion(null);
    setCategorySource(id ? 'manual' : null);
    setCategoryId(id);
  }

  function pickSuggestion(s: DescriptionSuggestion) {
    setDescription(s.description);
    setDescriptionFocused(false);
    if (s.categoryId && categories.some((c) => c.id === s.categoryId && !c.archived)) {
      setCategoryId(s.categoryId);
      setCategoryTouched(true);
      setSuggestion(null);
      // Reusing a past description is a rule-like choice, not a new manual correction.
      setCategorySource('rule');
    }
    if (accounts.some((a) => a.id === s.accountId)) setAccountId(s.accountId);
    setPaymentMethod(s.paymentMethod);
    setMethodTouched(true);
  }

  function applyDateText(text: string) {
    setDateText(text);
    const parsed = parseDateInput(text);
    if (parsed) setDate(parsed);
  }

  async function save() {
    if (saving) return;
    if (amount <= 0) return notify('Informe o valor', 'Digite quanto foi, em reais.');
    if (type === 'transfer' && accountId === toAccountId) return notify('Escolha contas diferentes', 'A transferência sai de uma conta e entra em outra.');
    setSaving(true);
    const accepted = suggestion && !categoryTouched && suggestion.categoryId === categoryId ? suggestion : null;
    const source: CategorySource | null = accepted ? accepted.source : categoryId ? (categorySource ?? 'manual') : null;
    try {
      let undo: () => Promise<unknown>;
      let message: string;
      if (transaction) {
        const before: TransactionPatch = isTransfer
          ? { amount: transaction.amount, date: transaction.date, description: transaction.description }
          : {
              amount: transaction.amount,
              date: transaction.date,
              description: transaction.description,
              notes: transaction.notes,
              accountId: transaction.accountId,
              categoryId: transaction.categoryId,
              categorySource: transaction.categorySource,
              categoryConfidence: transaction.categoryConfidence,
              paymentMethod: transaction.paymentMethod,
              status: transaction.status,
              ...(isRefund ? {} : { type: transaction.type as 'expense' | 'income' }),
            };
        const patch: TransactionPatch = isTransfer
          ? { amount, date, description }
          : {
              amount,
              date,
              description,
              notes,
              accountId,
              categoryId,
              ...(transaction.categoryId !== categoryId && { categorySource: source, categoryConfidence: accepted?.confidence ?? null }),
              paymentMethod,
              status: pending ? 'pending' : 'cleared',
              ...(isRefund ? {} : { type: type as 'expense' | 'income' }),
            };
        await repos.transactions.update(transaction.id, patch);
        undo = () => repos.transactions.update(transaction.id, before);
        message = 'Alterações salvas';
      } else if (type === 'transfer') {
        const { out } = await repos.transactions.createTransfer({ id: clientId, fromAccountId: accountId, toAccountId, amount, date, description });
        undo = () => repos.transactions.remove(out.id);
        message = `${NATURE_LABELS[out.nature]} registrada`;
      } else if (canSplit && count > 1) {
        await repos.transactions.createInstallments({
          id: clientId,
          accountId,
          categoryId,
          total: amount,
          count,
          firstDate: date,
          description,
          paymentMethod,
        });
        undo = () => repos.transactions.removeInstallmentGroup(clientId);
        message = `Compra em ${count}x registrada`;
      } else {
        await repos.transactions.create({
          id: clientId,
          accountId,
          type,
          amount,
          date,
          description,
          notes,
          categoryId,
          categorySource: source,
          categoryConfidence: accepted?.confidence ?? null,
          paymentMethod,
          status: pending ? 'pending' : 'cleared',
        });
        undo = () => repos.transactions.remove(clientId);
        message = type === 'income' ? 'Receita salva' : 'Despesa salva';
      }
      successFeedback();
      router.back();
      toast({
        message,
        tone: 'success',
        action: {
          label: 'Desfazer',
          onPress: () => {
            undo().then(
              () => toast({ message: 'Desfeito' }),
              (err) => {
                logError('transaction.undo', err);
                toast({ message: 'Não foi possível desfazer.', tone: 'error' });
              }
            );
          },
        },
      });
    } catch (err) {
      // What was typed stays in the form, so the user can fix it and save again.
      if (!(err instanceof ValidationError)) logError('transaction.save', err);
      notify('Não foi possível salvar', userFacingError(err, 'Seus dados digitados continuam aqui; tente salvar de novo.'));
      setSaving(false);
    }
  }

  async function removeOne(ids?: string[]) {
    if (!transaction) return;
    setDeleteOpen(false);
    try {
      let undo: () => Promise<unknown>;
      if (ids) {
        await repos.transactions.removeInstallmentGroup(transaction.installmentGroupId!);
        undo = () => repos.transactions.restoreMany(ids);
      } else {
        await repos.transactions.remove(transaction.id);
        undo = () => repos.transactions.restore(transaction.id);
      }
      router.back();
      toast({
        message: ids ? `${ids.length} parcelas excluídas` : isTransfer ? 'Transferência excluída' : 'Lançamento excluído',
        action: { label: 'Desfazer', onPress: () => void undo().then(() => toast({ message: 'Exclusão desfeita', tone: 'success' })) },
      });
    } catch (err) {
      logError('transaction.remove', err);
      notify('Não foi possível excluir', userFacingError(err, 'Nada foi alterado. Tente de novo.'));
    }
  }

  const liveInstallments = installments.filter((t) => !t.deletedAt);
  const transferNature = type === 'transfer' && account && toAccount ? inferTransferNature(account.type, toAccount.type) : null;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={{ backgroundColor: theme.colors.background }}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {isRefund && refundOrigin && (
          <Info icon="return-down-back-outline">
            Estorno de “{refundOrigin.description || 'lançamento sem descrição'}”, de {formatDateBR(refundOrigin.date)} (
            {formatCents(refundOrigin.amount)}). Ele reduz o gasto dessa categoria e não conta como receita.
          </Info>
        )}
        {transaction?.installmentNumber && transaction.installmentTotal && (
          <Info icon="calendar-outline">
            Parcela {transaction.installmentNumber} de {transaction.installmentTotal} · total da compra{' '}
            {formatCents(liveInstallments.reduce((s, t) => s + t.amount, 0))}. Cada parcela conta no orçamento do próprio mês.
          </Info>
        )}

        {!isTransfer && !isRefund && (
          <SegmentedControl
            value={type}
            onChange={changeType}
            options={[
              { value: 'expense', label: 'Despesa' },
              { value: 'income', label: 'Receita' },
              // An existing expense/income can't become a transfer (it would need a second account).
              ...(transaction ? [] : [{ value: 'transfer' as const, label: 'Transferência' }]),
            ]}
          />
        )}

        <MoneyInput
          label={canSplit && count > 1 ? 'Valor total da compra' : 'Valor'}
          value={amount}
          onChange={setAmount}
          autoFocus={!transaction}
          sign={type === 'income' ? '+' : type === 'expense' ? '−' : undefined}
        />

        <View style={{ gap: 6 }}>
          <TextField
            label={type === 'transfer' ? 'Descrição (opcional)' : 'Descrição ou estabelecimento'}
            placeholder={type === 'transfer' ? 'Ex.: pagamento da fatura' : 'Ex.: padaria, mercado, salário'}
            value={description}
            onChangeText={setDescription}
            onFocus={() => setDescriptionFocused(true)}
            onBlur={() => setTimeout(() => setDescriptionFocused(false), 150)}
            returnKeyType="next"
          />
          {autocomplete.length > 0 && (
            <Card style={{ padding: 4, gap: 0 }}>
              {autocomplete.map((s) => {
                const cat = s.categoryId ? categories.find((c) => c.id === s.categoryId) : undefined;
                const acc = accounts.find((a) => a.id === s.accountId);
                return (
                  <Pressable
                    key={s.description}
                    onPress={() => pickSuggestion(s)}
                    accessibilityRole="button"
                    accessibilityLabel={`Usar ${s.description}`}
                    style={({ pressed }) => [styles.suggestion, { backgroundColor: pressed ? theme.colors.pressed : 'transparent', borderRadius: theme.radius.sm }]}
                  >
                    <Text style={[theme.type.bodyStrong, { color: theme.colors.textPrimary }]}>{s.description}</Text>
                    <Text style={[theme.type.label, { color: theme.colors.textSecondary }]}>
                      {[cat?.name, acc?.name, `última vez ${formatCents(s.lastAmount)}`].filter(Boolean).join(' · ')}
                    </Text>
                  </Pressable>
                );
              })}
            </Card>
          )}
        </View>

        {accounts.length === 0 ? (
          <Info icon="wallet-outline">Cadastre uma conta em Ajustes › Contas e cartões para registrar lançamentos.</Info>
        ) : (
          <>
            <AccountSelector
              label={type === 'transfer' ? 'Sai de' : 'Conta'}
              accounts={accountOptions(accounts)}
              value={accountId}
              onChange={changeAccount}
            />
            {!source && suggestedAccountId === accountId && type !== 'transfer' && (
              <MutedText style={{ fontSize: 13, marginTop: -8 }}>Sugerida: a última conta que você usou. Confira antes de salvar.</MutedText>
            )}
          </>
        )}

        {type === 'transfer' &&
          (accounts.length < 2 ? (
            <Info icon="wallet-outline">Cadastre pelo menos duas contas para registrar transferências.</Info>
          ) : (
            <>
              <AccountSelector label="Entra em" accounts={accountOptions(accounts.filter((a) => a.id !== accountId || isTransfer))} value={toAccountId} onChange={setToAccountId} />
              {transferNature && (
                <Info icon="information-circle-outline">
                  {transferNature === 'card_payment'
                    ? 'Será registrado como pagamento de fatura: não conta como gasto, porque as compras do cartão já contaram.'
                    : transferNature === 'investment_contribution'
                      ? 'Será registrado como aporte: dinheiro guardado, não é gasto.'
                      : transferNature === 'investment_withdrawal'
                        ? 'Será registrado como resgate: dinheiro que volta do investimento, não é receita.'
                        : 'Transferência entre suas contas: não é gasto nem receita.'}
                </Info>
              )}
            </>
          ))}

        {type !== 'transfer' && (
          <View style={{ gap: 6 }}>
            <Text style={[theme.type.label, { color: theme.colors.textSecondary }]}>Forma de pagamento</Text>
            <ChipRow>
              {FORM_METHODS.map((m) => (
                <Chip
                  key={m}
                  label={PAYMENT_METHOD_LABELS[m]}
                  selected={m === paymentMethod}
                  onPress={() => {
                    setPaymentMethod(m);
                    setMethodTouched(true);
                  }}
                />
              ))}
            </ChipRow>
          </View>
        )}

        {type !== 'transfer' && (
          <View style={{ gap: 6 }}>
            <Text style={[theme.type.label, { color: theme.colors.textSecondary }]}>Categoria</Text>
            {suggestion && suggestion.categoryId === categoryId && (
              <View style={[styles.hint, { backgroundColor: theme.colors.primarySoft, borderRadius: theme.radius.sm }]}>
                <Icon name="sparkles-outline" size={16} color={theme.colors.onPrimarySoft} />
                <Text style={[theme.type.label, { color: theme.colors.onPrimarySoft, flex: 1 }]}>
                  Sugestão: {suggestion.reason} Toque em outra para trocar.
                </Text>
              </View>
            )}
            <ChipRow>
              {tree.map(({ category }) => (
                <Chip
                  key={category.id}
                  label={category.name}
                  icon={category.icon}
                  color={category.color}
                  selected={category.id === selectedRootId}
                  onPress={() => pickCategory(category.id === categoryId ? null : category.id)}
                />
              ))}
            </ChipRow>
            {selectedRoot && selectedRoot.children.length > 0 && (
              <>
                <MutedText style={{ fontSize: 13 }}>Subcategoria de {selectedRoot.category.name} (opcional)</MutedText>
                <ChipRow>
                  {selectedRoot.children.map((child) => (
                    <Chip
                      key={child.id}
                      label={child.name}
                      selected={child.id === categoryId}
                      onPress={() => pickCategory(child.id === categoryId ? selectedRoot.category.id : child.id)}
                    />
                  ))}
                </ChipRow>
              </>
            )}
          </View>
        )}

        <View style={{ gap: 6 }}>
          <Text style={[theme.type.label, { color: theme.colors.textSecondary }]}>Data</Text>
          <ChipRow>
            <Chip label="Hoje" selected={date === today} onPress={() => { setDate(today); setDateText(''); }} />
            <Chip label="Ontem" selected={date === addDaysToDateKey(today, -1)} onPress={() => { setDate(addDaysToDateKey(today, -1)); setDateText(''); }} />
            {date !== today && date !== addDaysToDateKey(today, -1) && <Chip label={formatDateBR(date)} selected onPress={() => undefined} />}
          </ChipRow>
          <TextField placeholder="Outra data: dd/mm/aaaa" value={dateText} onChangeText={applyDateText} keyboardType="numbers-and-punctuation" accessibilityLabel="Outra data" />
          {account?.type === 'credit_card' && transaction?.invoiceMonth && (
            <MutedText style={{ fontSize: 13 }}>Na fatura com vencimento em {formatMonthBR(transaction.invoiceMonth)}.</MutedText>
          )}
        </View>

        {!isTransfer && type !== 'transfer' && (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: showMore }}
            onPress={() => setShowMore((v) => !v)}
            style={styles.moreToggle}
          >
            <Text style={[theme.type.bodyStrong, { color: theme.colors.primary }]}>{showMore ? 'Menos detalhes' : 'Mais detalhes'}</Text>
            <Icon name={showMore ? 'chevron-up' : 'chevron-down'} size={18} color={theme.colors.primary} />
            {!showMore && (pending || notes || count > 1) && (
              <MutedText style={{ fontSize: 13 }}>
                {[count > 1 ? `${count}x` : null, pending ? 'pendente' : null, notes ? 'com observação' : null].filter(Boolean).join(' · ')}
              </MutedText>
            )}
          </Pressable>
        )}

        {showMore && type !== 'transfer' && (
          <View style={{ gap: 14 }}>
            {canSplit && (
              <View style={{ gap: 6 }}>
                <TextField
                  label="Parcelas"
                  value={installmentCount}
                  onChangeText={(t) => setInstallmentCount(t.replace(/\D/g, '').slice(0, 3))}
                  keyboardType="number-pad"
                  placeholder="1"
                />
                {count > 1 && amount >= count && (
                  <MutedText style={{ fontSize: 13 }}>
                    {count}x: {splitInstallments(amount, count).slice(0, 2).map(formatCents).join(', depois ')}… Uma parcela por mês a partir
                    da data; cada uma conta no orçamento do seu mês.
                  </MutedText>
                )}
              </View>
            )}
            <View style={styles.switchRow}>
              <View style={{ flex: 1 }}>
                <Text style={[theme.type.body, { color: theme.colors.textPrimary }]}>Ainda não foi pago</Text>
                <MutedText style={{ fontSize: 13 }}>Marca como pendente (agendado ou a pagar).</MutedText>
              </View>
              <Switch value={pending} onValueChange={setPending} accessibilityLabel="Ainda não foi pago" />
            </View>
            <TextField label="Observações" value={notes} onChangeText={setNotes} multiline placeholder="Opcional" />
          </View>
        )}

        <View style={{ gap: 10, marginTop: 8 }}>
          <Button label={saving ? 'Salvando…' : 'Salvar'} icon="checkmark" onPress={save} disabled={saving || accounts.length === 0} haptic />
          {transaction && (
            <>
              {!isTransfer && !isRefund && (
                <Button
                  label="Duplicar"
                  icon="repeat-outline"
                  variant="secondary"
                  onPress={() => router.replace({ pathname: '/transaction/[id]', params: { id: 'new', duplicate: transaction.id } })}
                />
              )}
              {!isTransfer && !isRefund && refundableAmount(transaction, refunds) > 0 && (
                <Button label="Registrar estorno" icon="return-down-back-outline" variant="secondary" onPress={() => setRefundOpen(true)} />
              )}
              <Button
                label="Excluir"
                icon="trash-outline"
                variant="ghost"
                onPress={() => (liveInstallments.length > 1 ? setDeleteOpen(true) : removeOne())}
              />
            </>
          )}
        </View>
      </ScrollView>

      {transaction && (
        <RefundSheet
          visible={refundOpen}
          onClose={() => setRefundOpen(false)}
          origin={transaction}
          remaining={refundableAmount(transaction, refunds)}
          today={today}
        />
      )}
      <BottomSheet visible={deleteOpen} onClose={() => setDeleteOpen(false)} title="Excluir parcela">
        <MutedText>
          Esta é a parcela {transaction?.installmentNumber} de {transaction?.installmentTotal}. As exclusões podem ser desfeitas logo em seguida.
        </MutedText>
        <Button label="Excluir só esta parcela" variant="secondary" onPress={() => removeOne()} />
        <Button label={`Excluir as ${liveInstallments.length} parcelas`} variant="danger" onPress={() => removeOne(liveInstallments.map((t) => t.id))} />
      </BottomSheet>
    </KeyboardAvoidingView>
  );
}

function Info({ icon, children }: { icon: string; children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <View style={[styles.hint, { backgroundColor: theme.colors.infoSurface, borderRadius: theme.radius.md, padding: 12 }]}>
      <Icon name={icon} size={18} color={theme.colors.info} />
      <Text style={[theme.type.label, { color: theme.colors.textPrimary, flex: 1 }]}>{children}</Text>
    </View>
  );
}

/** Records a refund linked to `origin`, by default for everything not refunded yet. */
function RefundSheet({
  visible,
  onClose,
  origin,
  remaining,
  today,
}: {
  visible: boolean;
  onClose: () => void;
  origin: Transaction;
  remaining: number;
  today: DateKey;
}) {
  const repos = useRepositories();
  const toast = useToast();
  const [amount, setAmount] = useState(remaining);
  const [saving, setSaving] = useState(false);
  const clientId = useRef(randomUUID()).current;

  async function save() {
    if (saving) return;
    setSaving(true);
    try {
      const refund = await repos.transactions.createRefund({ id: clientId, refundOfId: origin.id, amount, date: today });
      successFeedback();
      onClose();
      router.back();
      toast({
        message: 'Estorno registrado',
        tone: 'success',
        action: { label: 'Desfazer', onPress: () => void repos.transactions.remove(refund.id).then(() => toast({ message: 'Desfeito' })) },
      });
    } catch (err) {
      if (!(err instanceof ValidationError)) logError('refund.save', err);
      notify('Não foi possível registrar', userFacingError(err, 'Nada foi alterado. Tente de novo.'));
      setSaving(false);
    }
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Registrar estorno" footer={<Button label="Registrar" onPress={save} disabled={saving || amount <= 0} haptic />}>
      <MutedText>
        O estorno fica ligado a “{origin.description || 'este lançamento'}”, na mesma categoria, e reduz esse gasto. Ainda pode ser
        estornado até {formatCents(remaining)}.
      </MutedText>
      <MoneyInput label="Valor do estorno" value={amount} onChange={(v) => setAmount(Math.min(v, remaining))} size="regular" sign={origin.type === 'expense' ? '+' : '−'} />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  content: { padding: SCREEN_PADDING, gap: 18, paddingBottom: 64, width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
  suggestion: { paddingHorizontal: 12, paddingVertical: 8, gap: 2, minHeight: 48, justifyContent: 'center' },
  hint: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 8 },
  moreToggle: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, flexWrap: 'wrap' },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});

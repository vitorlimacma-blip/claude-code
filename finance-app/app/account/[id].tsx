import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { ValidationError } from '../../src/data/context';
import { findInstitution, INSTITUTIONS } from '../../src/domain/institutions';
import { ACCOUNT_TYPE_ICONS, ACCOUNT_TYPE_LABELS } from '../../src/domain/labels';
import { centsToInput, parseAmountToCents, parseSignedAmountToCents } from '../../src/domain/money';
import { ACCOUNT_TYPES, type Account, type AccountType } from '../../src/domain/types';
import { confirm, notify } from '../../src/platform/dialogs';
import { useRepositories } from '../../src/state/DataProvider';
import { useQuery } from '../../src/state/useQuery';
import { Button, Chip, ChipRow, MutedText, SectionTitle, TextField } from '../../src/ui/components';
import { CONTENT_MAX_WIDTH } from '../../src/ui/layout';
import { useTheme } from '../../src/ui/theme';

/** The user's own banks first, then the rest. */
const FEATURED = ['itau', 'santander', 'xp', 'mercado_pago'];
const INSTITUTION_ORDER = [
  ...INSTITUTIONS.filter((i) => FEATURED.includes(i.slug)),
  ...INSTITUTIONS.filter((i) => !FEATURED.includes(i.slug)),
];

export default function AccountScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const { data } = useQuery(async (r) => ({ account: isNew ? undefined : await r.accounts.get(id) }), [], [id]);
  if (!data) return null;
  return (
    <>
      <Stack.Screen options={{ title: isNew ? 'Nova conta' : 'Editar conta' }} />
      <AccountForm account={data.account} />
    </>
  );
}

function optionalDay(text: string): number | null {
  const n = Number(text.trim());
  return text.trim() && Number.isFinite(n) ? n : null;
}

function AccountForm({ account }: { account?: Account }) {
  const theme = useTheme();
  const repos = useRepositories();
  const [name, setName] = useState(account?.name ?? '');
  const [type, setType] = useState<AccountType>(account?.type ?? 'checking');
  const [institution, setInstitution] = useState<string | null>(account?.institution ?? null);
  const [initialBalance, setInitialBalance] = useState(
    account ? (account.initialBalance < 0 ? '-' : '') + centsToInput(Math.abs(account.initialBalance)) : ''
  );
  const [creditLimit, setCreditLimit] = useState(account?.creditLimit ? centsToInput(account.creditLimit) : '');
  const [closingDay, setClosingDay] = useState(account?.closingDay ? String(account.closingDay) : '');
  const [dueDay, setDueDay] = useState(account?.dueDay ? String(account.dueDay) : '');
  const isCard = type === 'credit_card';

  function pickInstitution(slug: string) {
    const next = slug === institution ? null : slug;
    setInstitution(next);
    // Suggest a name from the bank and the account type when the user hasn't typed one.
    const inst = findInstitution(next);
    if (inst && !name.trim()) setName(type === 'credit_card' ? `Cartão ${inst.name}` : inst.name);
  }

  async function save() {
    const values = {
      name,
      type,
      institution,
      color: findInstitution(institution)?.color ?? account?.color ?? '#6B7280',
      initialBalance: parseSignedAmountToCents(initialBalance),
      creditLimit: isCard && creditLimit.trim() ? parseAmountToCents(creditLimit) : null,
      closingDay: isCard ? optionalDay(closingDay) : null,
      dueDay: isCard ? optionalDay(dueDay) : null,
    };
    try {
      if (account) await repos.accounts.update(account.id, values);
      else await repos.accounts.create(values);
      router.back();
    } catch (err) {
      if (err instanceof ValidationError) notify('Verifique os dados', err.message);
      else throw err;
    }
  }

  async function remove() {
    if (!account) return;
    if (!(await confirm('Excluir conta', `Excluir "${account.name}"?`, { confirmLabel: 'Excluir', destructive: true }))) {
      return;
    }
    try {
      await repos.accounts.remove(account.id);
      router.back();
    } catch (err) {
      if (!(err instanceof ValidationError)) throw err;
      if (await confirm('Conta com lançamentos', `${err.message}\n\nArquivar agora?`, { confirmLabel: 'Arquivar' })) {
        await repos.accounts.update(account.id, { archived: true });
        router.back();
      }
    }
  }

  async function unarchive() {
    if (!account) return;
    await repos.accounts.update(account.id, { archived: false });
    router.back();
  }

  return (
    <ScrollView
      style={{ backgroundColor: theme.colors.background }}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <SectionTitle>Tipo</SectionTitle>
      <ChipRow>
        {ACCOUNT_TYPES.map((t) => (
          <Chip key={t} label={ACCOUNT_TYPE_LABELS[t]} icon={ACCOUNT_TYPE_ICONS[t]} selected={t === type} onPress={() => setType(t)} />
        ))}
      </ChipRow>

      <SectionTitle>Banco ou instituição</SectionTitle>
      <ChipRow>
        {INSTITUTION_ORDER.map((i) => (
          <Chip key={i.slug} label={i.name} color={i.color} selected={i.slug === institution} onPress={() => pickInstitution(i.slug)} />
        ))}
      </ChipRow>

      <TextField label="Nome" placeholder="Ex.: Itaú conta corrente" value={name} onChangeText={setName} />
      <TextField
        label={isCard ? 'Fatura em aberto ao começar a usar o app (R$, opcional)' : 'Saldo inicial (R$)'}
        placeholder={isCard ? 'Ex.: -850,00' : 'Ex.: 1.500,00'}
        keyboardType="numbers-and-punctuation"
        value={initialBalance}
        onChangeText={setInitialBalance}
      />
      {isCard && (
        <>
          <MutedText>Em cartões, use valor negativo para o que já está em aberto.</MutedText>
          <TextField label="Limite (R$, opcional)" keyboardType="decimal-pad" value={creditLimit} onChangeText={setCreditLimit} />
          <View style={styles.days}>
            <View style={{ flex: 1 }}>
              <TextField label="Dia de fechamento" keyboardType="number-pad" value={closingDay} onChangeText={setClosingDay} maxLength={2} />
            </View>
            <View style={{ flex: 1 }}>
              <TextField label="Dia de vencimento" keyboardType="number-pad" value={dueDay} onChangeText={setDueDay} maxLength={2} />
            </View>
          </View>
        </>
      )}

      <View style={{ gap: 10, marginTop: 8 }}>
        <Button label="Salvar" icon="checkmark" onPress={save} />
        {account?.archived && <Button label="Desarquivar" variant="secondary" onPress={unarchive} />}
        {account && !account.archived && <Button label="Excluir" variant="danger" icon="trash-outline" onPress={remove} />}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, paddingBottom: 48, width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
  days: { flexDirection: 'row', gap: 12 },
});

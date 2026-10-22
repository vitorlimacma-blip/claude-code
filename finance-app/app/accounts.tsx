import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { todayKey } from '../src/domain/dates';
import { findInstitution } from '../src/domain/institutions';
import { ACCOUNT_TYPE_ICONS, ACCOUNT_TYPE_LABELS } from '../src/domain/labels';
import { formatCents } from '../src/domain/money';
import { useQuery } from '../src/state/useQuery';
import { Button, Card, IconBubble, MutedText } from '../src/ui/components';
import { CONTENT_MAX_WIDTH } from '../src/ui/layout';
import { useTheme } from '../src/ui/theme';

export default function AccountsScreen() {
  const theme = useTheme();
  const [showArchived, setShowArchived] = useState(false);
  const { data } = useQuery(
    async (r) => {
      const [accounts, balances] = await Promise.all([
        r.accounts.list({ includeArchived: showArchived }),
        r.accounts.balances(todayKey()),
      ]);
      return { accounts, balances };
    },
    ['accounts', 'transactions'],
    [showArchived]
  );

  return (
    <ScrollView style={{ backgroundColor: theme.colors.background }} contentContainerStyle={styles.content}>
      <MutedText>
        Cadastre cada conta corrente, carteira, cartão de crédito e investimento. Os cartões guardam os dias de fechamento
        e de vencimento, usados para calcular as faturas.
      </MutedText>
      <Card style={{ gap: 14 }}>
        {data?.accounts.map((account) => {
          const balance = data.balances.get(account.id) ?? 0;
          const institution = findInstitution(account.institution);
          return (
            <Pressable
              key={account.id}
              onPress={() => router.push({ pathname: '/account/[id]', params: { id: account.id } })}
              style={({ pressed }) => [styles.row, { opacity: pressed ? 0.6 : 1 }]}
            >
              <IconBubble icon={ACCOUNT_TYPE_ICONS[account.type]} color={account.color} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.name, { color: theme.colors.textPrimary }]}>
                  {account.name}
                  {account.archived ? ' (arquivada)' : ''}
                </Text>
                <MutedText style={{ fontSize: 12 }}>
                  {[ACCOUNT_TYPE_LABELS[account.type], institution?.name].filter(Boolean).join(' · ')}
                  {account.type === 'credit_card' && account.closingDay
                    ? ` · fecha dia ${account.closingDay}, vence dia ${account.dueDay ?? '?'}`
                    : ''}
                </MutedText>
              </View>
              <Text style={[styles.amount, { color: balance < 0 ? theme.colors.amountNegative : theme.colors.textPrimary }]}>
                {formatCents(balance)}
              </Text>
            </Pressable>
          );
        })}
      </Card>
      <View style={styles.archived}>
        <MutedText>Mostrar contas arquivadas</MutedText>
        <Switch value={showArchived} onValueChange={setShowArchived} />
      </View>
      <Button label="Nova conta ou cartão" icon="add" onPress={() => router.push({ pathname: '/account/[id]', params: { id: 'new' } })} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, paddingBottom: 48, width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  name: { fontSize: 15, fontWeight: '600' },
  amount: { fontSize: 15, fontWeight: '700' },
  archived: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});

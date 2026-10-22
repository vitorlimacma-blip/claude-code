import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { createFirstAccount, finishOnboarding } from '../src/data/onboarding';
import { todayKey } from '../src/domain/dates';
import type { Cents } from '../src/domain/types';
import { logError, userFacingError } from '../src/platform/errors';
import { useRepositories } from '../src/state/DataProvider';
import { Button, Card, Chip, ChipRow, MutedText, Screen, TextField, Title } from '../src/ui/components';
import { Icon, type IconName } from '../src/ui/icons';
import { MoneyInput } from '../src/ui/MoneyInput';
import { useTheme } from '../src/ui/theme';

type AccountKind = 'checking' | 'savings' | 'wallet';
const KINDS: { value: AccountKind; label: string; name: string }[] = [
  { value: 'checking', label: 'Conta corrente', name: 'Conta corrente' },
  { value: 'savings', label: 'Poupança', name: 'Poupança' },
  { value: 'wallet', label: 'Dinheiro na carteira', name: 'Carteira' },
];

/**
 * First run (briefing §13): what the app does and how it treats data, the
 * first account, then the first entry. Every step can be skipped; budgets,
 * forecasts and AI stay for later.
 */
export default function OnboardingScreen() {
  const theme = useTheme();
  const repos = useRepositories();
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [kind, setKind] = useState<AccountKind>('checking');
  const [name, setName] = useState('Conta corrente');
  const [balance, setBalance] = useState<Cents>(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(task: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await task();
    } catch (e) {
      logError('onboarding', e);
      setError(userFacingError(e, 'Não foi possível salvar agora. Tente de novo.'));
    } finally {
      setBusy(false);
    }
  }

  const done = (outcome: 'completed' | 'skipped', then?: () => void) =>
    run(async () => {
      await finishOnboarding(repos, outcome);
      router.replace('/');
      then?.();
    });

  const tryDemo = () =>
    run(async () => {
      await repos.demo.generate(todayKey());
      await finishOnboarding(repos, 'skipped');
      router.replace('/');
    });

  const saveAccount = () =>
    run(async () => {
      await createFirstAccount(repos, { name, type: kind, balance });
      setStep(2);
    });

  return (
    <Screen>
      <View style={styles.top}>
        <MutedText>Passo {step + 1} de 3</MutedText>
        {step < 2 && <Button label="Pular" variant="ghost" onPress={() => done('skipped')} disabled={busy} />}
      </View>

      {step === 0 && (
        <View style={{ gap: 16 }}>
          <Title>Organize seu dinheiro em poucos toques</Title>
          <Card style={{ gap: 14 }}>
            <Point icon="flash-outline" text="Anote gastos e receitas em segundos e veja quanto sobra até o próximo recebimento." />
            <Point icon="lock-closed-outline" text="Seus dados ficam neste aparelho. Não precisa de cadastro nem de conexão com banco." />
            <Point
              icon="sparkles-outline"
              text="O assistente calcula no aparelho. Nada vai para a nuvem sem você ligar a permissão em Ajustes."
            />
          </Card>
          <Button label="Começar" onPress={() => setStep(1)} disabled={busy} />
          <Button label="Explorar com dados de demonstração" variant="secondary" icon="flask-outline" onPress={tryDemo} disabled={busy} />
          <MutedText style={{ fontSize: 13 }}>
            A demonstração usa uma rotina fictícia, identificada como teste. Você apaga tudo em Ajustes › Dados de teste quando quiser.
          </MutedText>
        </View>
      )}

      {step === 1 && (
        <View style={{ gap: 16 }}>
          <Title>Onde fica o dinheiro do dia a dia?</Title>
          <MutedText>Uma conta basta para começar. Cartões e outras contas você adiciona depois, em Ajustes.</MutedText>
          <ChipRow>
            {KINDS.map((k) => (
              <Chip
                key={k.value}
                label={k.label}
                selected={kind === k.value}
                onPress={() => {
                  setKind(k.value);
                  if (KINDS.some((o) => o.name === name) || !name.trim()) setName(k.name);
                }}
              />
            ))}
          </ChipRow>
          <TextField label="Nome" value={name} onChangeText={setName} placeholder="Ex.: Nubank, Itaú" />
          <MoneyInput label="Saldo de hoje (opcional)" value={balance} onChange={setBalance} size="regular" />
          <MutedText style={{ fontSize: 13 }}>Com o saldo, o Resumo já mostra quanto está disponível. Dá para corrigir depois.</MutedText>
          <Button label="Continuar" onPress={saveAccount} disabled={busy || !name.trim()} />
          <Button label="Pular este passo" variant="ghost" onPress={() => setStep(2)} disabled={busy} />
        </View>
      )}

      {step === 2 && (
        <View style={{ gap: 16 }}>
          <Title>Pronto para o primeiro lançamento</Title>
          <MutedText>
            Valor, descrição e salvar: a categoria é sugerida e você corrige com um toque. Orçamentos, contas previstas e metas ficam
            para quando você quiser.
          </MutedText>
          <Button label="Registrar um lançamento" icon="add" onPress={() => done('completed', () => router.push({ pathname: '/transaction/[id]', params: { id: 'new' } }))} disabled={busy} />
          <Button label="Agora não" variant="ghost" onPress={() => done('completed')} disabled={busy} />
        </View>
      )}

      {error && <Text style={{ color: theme.colors.danger }}>{error}</Text>}
    </Screen>
  );
}

function Point({ icon, text }: { icon: IconName; text: string }) {
  const theme = useTheme();
  return (
    <View style={styles.point}>
      <Icon name={icon} size={20} color={theme.colors.primary} />
      <Text style={[theme.type.body, { color: theme.colors.textPrimary, flex: 1 }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 44 },
  point: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
});

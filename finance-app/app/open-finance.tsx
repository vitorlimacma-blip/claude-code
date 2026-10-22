import { ScrollView, StyleSheet, Text } from 'react-native';
import { Card, MutedText, SectionTitle } from '../src/ui/components';
import { CONTENT_MAX_WIDTH } from '../src/ui/layout';
import { useTheme } from '../src/ui/theme';

/**
 * Ajustes › Conexão com bancos (briefing §14): says plainly that there is no
 * bank connection in this version and what a future one would require. The
 * interfaces are prepared in src/domain/openFinance.ts; nothing is simulated.
 */
export default function OpenFinanceScreen() {
  const theme = useTheme();
  return (
    <ScrollView style={{ backgroundColor: theme.colors.background }} contentContainerStyle={styles.content}>
      <Card style={{ gap: 6 }}>
        <Text style={[styles.strong, { color: theme.colors.textPrimary }]}>Nenhum banco conectado</Text>
        <MutedText>
          Esta versão não se conecta a bancos. Seus lançamentos vêm do que você registra (e das importações de arquivo), e nada é
          enviado a instituições financeiras ou agregadoras.
        </MutedText>
      </Card>

      <SectionTitle>Se a conexão vier no futuro</SectionTitle>
      <Card style={{ gap: 10 }}>
        <MutedText>• Só com o seu consentimento, dado no próprio banco, para os dados que o app usa (contas, saldos, lançamentos).</MutedText>
        <MutedText>• Consentimento com prazo e que você pode revogar aqui a qualquer momento.</MutedText>
        <MutedText>
          • Lançamentos que você já registrou à mão são reconhecidos e ligados ao do banco, sem duplicar; quando houver dúvida, você
          decide.
        </MutedText>
        <MutedText>• Cada conta mostra quando foi atualizada pela última vez; dado antigo aparece como desatualizado.</MutedText>
        <MutedText>
          • Nem toda instituição é atendida por todas as agregadoras, e a atualização não é instantânea. Custos e contratos precisam ser
          verificados antes de qualquer integração.
        </MutedText>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, paddingBottom: 48, width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
  strong: { fontSize: 15, fontWeight: '700' },
});

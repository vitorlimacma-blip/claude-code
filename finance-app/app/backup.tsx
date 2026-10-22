import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { MAX_SNAPSHOTS, type SnapshotInfo } from '../src/data/backup';
import { todayKey } from '../src/domain/dates';
import { confirm, notify } from '../src/platform/dialogs';
import { logError, userFacingError } from '../src/platform/errors';
import { pickTextFile, saveTextFile } from '../src/platform/files';
import { useRepositories } from '../src/state/DataProvider';
import { Button, Card, MutedText, SectionTitle } from '../src/ui/components';
import { CONTENT_MAX_WIDTH } from '../src/ui/layout';
import { useTheme } from '../src/ui/theme';

const REASON_LABELS: Record<SnapshotInfo['reason'], string> = {
  'pre-migration': 'Antes de atualizar o banco',
  'pre-restore': 'Antes de uma restauração',
  export: 'Exportação',
  manual: 'Feito por você',
};

function describe(info: SnapshotInfo): string {
  const accounts = info.rowCounts.accounts ?? 0;
  const transactions = info.rowCounts.transactions ?? 0;
  return `${accounts} conta(s), ${transactions} lançamento(s), inclusive excluídos`;
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function restoredSummary(counts: Record<string, number>): string {
  return `${counts.accounts ?? 0} conta(s) e ${counts.transactions ?? 0} lançamento(s) restaurados.`;
}

export default function BackupScreen() {
  const theme = useTheme();
  const repos = useRepositories();
  const [backups, setBackups] = useState<SnapshotInfo[]>([]);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    repos.backup.listBackups().then(setBackups, (err) => logError('backup.list', err));
  }, [repos]);
  useEffect(refresh, [refresh]);

  async function run(context: string, fn: () => Promise<void>, failure: string) {
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      logError(context, err);
      notify('Não foi possível concluir', userFacingError(err, failure));
    } finally {
      setBusy(false);
      refresh();
    }
  }

  const exportData = () =>
    run(
      'backup.export',
      async () => {
        const json = await repos.backup.exportJson();
        await saveTextFile(`financas-backup-${todayKey()}.json`, json, 'application/json');
      },
      'A exportação falhou. Nenhum dado foi alterado.'
    );

  const importData = () =>
    run(
      'backup.import',
      async () => {
        const ok = await confirm(
          'Restaurar de um arquivo',
          'Todos os dados atuais serão substituídos pelos do arquivo. Antes, um backup automático dos dados atuais é ' +
            'guardado aqui, para você poder voltar atrás.',
          { confirmLabel: 'Escolher arquivo', destructive: true }
        );
        if (!ok) return;
        const json = await pickTextFile(['application/json']);
        if (json === null) return;
        notify('Restauração concluída', restoredSummary(await repos.backup.importJson(json)));
      },
      'A restauração falhou e nada foi alterado.'
    );

  const backupNow = () =>
    run(
      'backup.manual',
      async () => {
        const info = await repos.backup.backupNow();
        notify('Backup guardado', info ? describe(info) : 'Ainda não há dados para guardar.');
      },
      'O backup falhou. Nenhum dado foi alterado.'
    );

  const restore = (info: SnapshotInfo) =>
    run(
      'backup.restore',
      async () => {
        const ok = await confirm(
          'Restaurar este backup',
          `${formatTimestamp(info.createdAt)} · ${describe(info)}.\n\nOs dados atuais serão substituídos; antes, ` +
            'eles próprios ficam guardados como um novo backup.',
          { confirmLabel: 'Restaurar', destructive: true }
        );
        if (!ok) return;
        notify('Restauração concluída', restoredSummary(await repos.backup.restoreBackup(info.id)));
      },
      'A restauração falhou e nada foi alterado.'
    );

  return (
    <ScrollView style={{ backgroundColor: theme.colors.background }} contentContainerStyle={styles.content}>
      <SectionTitle>Exportar e restaurar</SectionTitle>
      <Card style={{ gap: 10 }}>
        <MutedText>
          A exportação gera um arquivo JSON com todas as contas, categorias, orçamentos, lançamentos (inclusive os
          excluídos) e preferências. As chaves de IA não entram no arquivo. Guarde-o em local seguro: ele contém seus
          dados financeiros sem criptografia.
        </MutedText>
        <Button label="Exportar dados" icon="download-outline" onPress={exportData} disabled={busy} />
        <Button label="Restaurar de um arquivo" icon="push-outline" variant="secondary" onPress={importData} disabled={busy || !repos.backup.available} />
      </Card>

      <SectionTitle>Backups automáticos</SectionTitle>
      <MutedText>
        O app guarda uma cópia completa antes de atualizar o banco de dados e antes de cada restauração, num arquivo
        separado neste aparelho. Ficam os {MAX_SNAPSHOTS} mais recentes.
      </MutedText>
      <Card style={{ gap: 14 }}>
        {backups.length === 0 && <MutedText>Nenhum backup ainda.</MutedText>}
        {backups.map((info) => (
          <View key={info.id} style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: theme.colors.textPrimary }]}>{formatTimestamp(info.createdAt)}</Text>
              <MutedText style={{ fontSize: 12 }}>
                {REASON_LABELS[info.reason]} · {describe(info)}
              </MutedText>
            </View>
            <Button label="Restaurar" variant="secondary" onPress={() => restore(info)} disabled={busy} />
          </View>
        ))}
        <Button label="Fazer backup agora" icon="save-outline" variant="secondary" onPress={backupNow} disabled={busy || !repos.backup.available} />
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, paddingBottom: 48, width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { fontSize: 15, fontWeight: '600' },
});

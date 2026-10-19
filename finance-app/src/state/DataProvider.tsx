import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { openAppDatabase } from '../data/database';
import type { Repositories } from '../data/repositories';
import { useTheme } from '../ui/theme';

const RepositoriesContext = createContext<Repositories | null>(null);

/** Opens and migrates the local database once, then provides the repositories to every screen. */
export function DataProvider({ children }: { children: ReactNode }) {
  const theme = useTheme();
  const [repos, setRepos] = useState<Repositories | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    openAppDatabase().then(setRepos, (err: Error) => {
      console.error(err);
      setError(err);
    });
  }, []);

  if (error) {
    return (
      <View style={[styles.center, { backgroundColor: theme.colors.background }]}>
        <Text style={[styles.title, { color: theme.colors.text }]}>Não foi possível abrir o banco de dados</Text>
        <Text style={{ color: theme.colors.textMuted }}>{error.message}</Text>
      </View>
    );
  }

  if (!repos) {
    return (
      <View style={[styles.center, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  return <RepositoriesContext.Provider value={repos}>{children}</RepositoriesContext.Provider>;
}

export function useRepositories(): Repositories {
  const repos = useContext(RepositoriesContext);
  if (!repos) throw new Error('useRepositories must be used within a DataProvider');
  return repos;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 },
  title: { fontSize: 16, fontWeight: '700', textAlign: 'center' },
});

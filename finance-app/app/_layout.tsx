import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AIContextProvider } from '../src/state/AIContext';
import { DataProvider } from '../src/state/DataProvider';
import { useTheme } from '../src/ui/theme';

export default function RootLayout() {
  const theme = useTheme();
  const base = theme.dark ? DarkTheme : DefaultTheme;
  const navigationTheme = {
    ...base,
    colors: {
      ...base.colors,
      primary: theme.colors.primary,
      background: theme.colors.background,
      card: theme.colors.surface,
      text: theme.colors.text,
      border: theme.colors.border,
    },
  };

  return (
    <ThemeProvider value={navigationTheme}>
      <StatusBar style={theme.dark ? 'light' : 'dark'} />
      <DataProvider>
        <AIContextProvider>
          <Stack>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="transaction/[id]" options={{ presentation: 'modal', title: 'Lançamento' }} />
            <Stack.Screen name="category/[id]" options={{ presentation: 'modal', title: 'Categoria' }} />
            <Stack.Screen name="account/[id]" options={{ presentation: 'modal', title: 'Conta' }} />
            <Stack.Screen name="accounts" options={{ title: 'Contas e cartões' }} />
            <Stack.Screen name="ai-settings" options={{ title: 'Inteligência artificial' }} />
          </Stack>
        </AIContextProvider>
      </DataProvider>
    </ThemeProvider>
  );
}

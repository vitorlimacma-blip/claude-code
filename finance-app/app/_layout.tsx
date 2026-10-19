import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Manrope_600SemiBold } from '@expo-google-fonts/manrope/600SemiBold';
import { Manrope_700Bold } from '@expo-google-fonts/manrope/700Bold';
import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider as NavigationThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AIContextProvider } from '../src/state/AIContext';
import { DataProvider } from '../src/state/DataProvider';
import { ThemePreferenceSync } from '../src/state/useThemePreference';
import { ThemeProvider, useTheme } from '../src/ui/theme';
import { ToastProvider } from '../src/ui/Toast';

export default function RootLayout() {
  // Only the weights the type scale uses. If loading fails, the theme falls back to the system font.
  const [loaded, error] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Manrope_600SemiBold, Manrope_700Bold });
  if (!loaded && !error) return null;
  return (
    <ThemeProvider fontsLoaded={loaded}>
      <AppNavigation />
    </ThemeProvider>
  );
}

function AppNavigation() {
  const theme = useTheme();
  const base = theme.dark ? DarkTheme : DefaultTheme;
  const navigationTheme = {
    ...base,
    colors: {
      ...base.colors,
      primary: theme.colors.primary,
      background: theme.colors.background,
      card: theme.colors.surface,
      text: theme.colors.textPrimary,
      border: theme.colors.border,
    },
    fonts: {
      ...base.fonts,
      ...(theme.type.bodyStrong.fontFamily && {
        regular: { fontFamily: theme.type.body.fontFamily!, fontWeight: 'normal' as const },
        medium: { fontFamily: theme.type.label.fontFamily!, fontWeight: 'normal' as const },
        bold: { fontFamily: theme.type.bodyStrong.fontFamily!, fontWeight: 'normal' as const },
        heavy: { fontFamily: theme.type.bodyStrong.fontFamily!, fontWeight: 'normal' as const },
      }),
    },
  };

  return (
    <NavigationThemeProvider value={navigationTheme}>
      <StatusBar style={theme.dark ? 'light' : 'dark'} />
      <DataProvider>
        <ThemePreferenceSync />
        <AIContextProvider>
          <ToastProvider>
          <Stack>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="transaction/[id]" options={{ presentation: 'modal', title: 'Lançamento' }} />
            <Stack.Screen name="category/[id]" options={{ presentation: 'modal', title: 'Categoria' }} />
            <Stack.Screen name="account/[id]" options={{ presentation: 'modal', title: 'Conta' }} />
            <Stack.Screen name="accounts" options={{ title: 'Contas e cartões' }} />
            <Stack.Screen name="ai-settings" options={{ title: 'Inteligência artificial' }} />
            <Stack.Screen name="backup" options={{ title: 'Backup e restauração' }} />
            {/* Outside the tabs: hidden tabs (href: null) can't be navigated to with js-tabs. */}
            <Stack.Screen name="forecasts" options={{ title: 'Previsões' }} />
            <Stack.Screen name="catalogo" options={{ title: 'Catálogo de componentes' }} />
            <Stack.Screen name="categories" options={{ title: 'Categorias' }} />
          </Stack>
          </ToastProvider>
        </AIContextProvider>
      </DataProvider>
    </NavigationThemeProvider>
  );
}

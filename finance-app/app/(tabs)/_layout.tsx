import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router/js-tabs';
import type { ComponentProps } from 'react';
import type { ColorValue } from 'react-native';
import { useIsWide } from '../../src/ui/layout';
import { useTheme } from '../../src/ui/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

function tabIcon(name: IconName) {
  // eslint-disable-next-line react/display-name
  return ({ color, size }: { color: ColorValue; size: number }) => (
    <Ionicons name={name} size={size} color={color as string} />
  );
}

/** Bottom tabs on phones; a side menu on wide screens (computer, tablet). */
export default function TabsLayout() {
  const wide = useIsWide();
  const theme = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.primary,
        ...(wide && {
          tabBarPosition: 'left',
          tabBarVariant: 'material',
          tabBarLabelPosition: 'beside-icon',
          tabBarStyle: { width: 220, paddingTop: 16 },
        }),
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Resumo', tabBarIcon: tabIcon('speedometer-outline') }} />
      <Tabs.Screen name="transactions" options={{ title: 'Lançamentos', tabBarIcon: tabIcon('list-outline') }} />
      <Tabs.Screen name="assistant" options={{ title: 'Assistente', tabBarIcon: tabIcon('sparkles-outline') }} />
      <Tabs.Screen name="categories" options={{ title: 'Categorias', tabBarIcon: tabIcon('pricetags-outline') }} />
      <Tabs.Screen name="settings" options={{ title: 'Ajustes', tabBarIcon: tabIcon('settings-outline') }} />
      {/* Reached from the dashboard, not from the tab bar (5 tabs is the most a phone fits well). */}
      <Tabs.Screen name="forecasts" options={{ title: 'Previsões', href: null }} />
    </Tabs>
  );
}

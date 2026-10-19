import { Tabs } from 'expo-router/js-tabs';
import type { ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName } from '../../src/ui/icons';
import { useIsWide } from '../../src/ui/layout';
import { useTheme } from '../../src/ui/theme';

function tabIcon(name: IconName) {
  // eslint-disable-next-line react/display-name
  return ({ color, size }: { color: ColorValue; size: number }) => (
    <Icon name={name} size={Math.min(size, 24)} color={color} />
  );
}

/** Bottom tabs on phones; a side menu on wide screens (computer, tablet). */
export default function TabsLayout() {
  const wide = useIsWide();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.textSecondary,
        // Explicit line height: Inter's descenders (ç, g, j) were clipped by the default label box.
        // With five tabs, phones up to ~400 wide truncate "Lançamentos"; fixed by the navigation review of Fase 3 (D-034).
        tabBarLabelStyle: { ...theme.type.label, fontSize: 12, lineHeight: 16 },
        // Tall enough for a 24 icon plus the 16-high label (the default 49 squeezed the label).
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.border,
          height: 64 + insets.bottom,
          paddingTop: 6,
          paddingBottom: insets.bottom + 6,
        },
        ...(wide && {
          tabBarPosition: 'left',
          tabBarVariant: 'material',
          tabBarLabelPosition: 'beside-icon',
          tabBarLabelStyle: { ...theme.type.label },
          tabBarStyle: { width: 220, height: undefined, paddingTop: 16, paddingBottom: 0, backgroundColor: theme.colors.surface, borderRightColor: theme.colors.border },
        }),
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Resumo', tabBarIcon: tabIcon('speedometer-outline') }} />
      <Tabs.Screen name="transactions" options={{ title: 'Lançamentos', tabBarIcon: tabIcon('list-outline') }} />
      <Tabs.Screen name="assistant" options={{ title: 'Assistente', tabBarIcon: tabIcon('sparkles-outline') }} />
      <Tabs.Screen name="categories" options={{ title: 'Categorias', tabBarIcon: tabIcon('pricetags-outline') }} />
      <Tabs.Screen name="settings" options={{ title: 'Ajustes', tabBarIcon: tabIcon('settings-outline') }} />
    </Tabs>
  );
}

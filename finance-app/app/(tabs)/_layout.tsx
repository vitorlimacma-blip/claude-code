import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router/js-tabs';
import type { ComponentProps } from 'react';
import type { ColorValue } from 'react-native';

type IconName = ComponentProps<typeof Ionicons>['name'];

function tabIcon(name: IconName) {
  // eslint-disable-next-line react/display-name
  return ({ color, size }: { color: ColorValue; size: number }) => (
    <Ionicons name={name} size={size} color={color as string} />
  );
}

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" options={{ title: 'Resumo', tabBarIcon: tabIcon('speedometer-outline') }} />
      <Tabs.Screen name="transactions" options={{ title: 'Lançamentos', tabBarIcon: tabIcon('list-outline') }} />
      <Tabs.Screen name="categories" options={{ title: 'Categorias', tabBarIcon: tabIcon('pricetags-outline') }} />
      <Tabs.Screen name="forecasts" options={{ title: 'Previsões', tabBarIcon: tabIcon('trending-up-outline') }} />
    </Tabs>
  );
}

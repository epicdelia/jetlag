import { Tabs } from 'expo-router/js-tabs';

import { Icon } from '@/components/icon';
import { usePalette } from '@/hooks/use-palette';

export default function TabsLayout() {
  const { c } = usePalette();
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: c.background },
        headerTitleStyle: { color: c.text },
        headerShadowVisible: false,
        tabBarStyle: { backgroundColor: c.surface, borderTopColor: c.border },
        tabBarActiveTintColor: c.accent,
        tabBarInactiveTintColor: c.textSecondary,
        sceneStyle: { backgroundColor: c.background },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Today',
          tabBarIcon: ({ color }) => <Icon name={{ ios: 'sun.horizon', android: 'today', web: 'today' }} color={color} />,
        }}
      />
      <Tabs.Screen
        name="trips"
        options={{
          title: 'Trips',
          tabBarIcon: ({ color }) => <Icon name={{ ios: 'airplane', android: 'flight', web: 'flight' }} color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color }) => <Icon name={{ ios: 'gearshape', android: 'settings', web: 'settings' }} color={color} />,
        }}
      />
    </Tabs>
  );
}

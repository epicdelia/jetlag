import { router, Stack } from 'expo-router';
import { View } from 'react-native';

import { Button, Screen, T } from '@/components/ui';
import { Spacing } from '@/constants/theme';

/** Unknown URLs (web) and stale deep links land here instead of the router's developer screen. */
export default function NotFound() {
  return (
    <Screen>
      <Stack.Screen options={{ title: 'Not found' }} />
      <View style={{ gap: Spacing.sm, paddingTop: Spacing.lg }}>
        <T variant="title" accessibilityRole="header">
          This page doesn't exist
        </T>
        <T variant="secondary">The link may be old, or the trip may have been deleted.</T>
      </View>
      <Button title="Go to Today" onPress={() => router.replace('/')} />
    </Screen>
  );
}

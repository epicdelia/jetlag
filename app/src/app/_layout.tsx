import { DarkTheme, DefaultTheme, router, Stack, ThemeProvider, type Theme } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo } from 'react';

import { Button } from '@/components/ui';
import { Colors } from '@/constants/theme';
import { useScheme } from '@/hooks/use-palette';
import { AppStoreProvider, useAppStore } from '@/lib/store';

SplashScreen.preventAutoHideAsync().catch(() => {});

function RootStack() {
  const { ready, profile } = useAppStore();
  const scheme = useScheme();
  const c = Colors[scheme];

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  const theme = useMemo<Theme>(() => {
    const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        primary: c.accent,
        background: c.background,
        card: c.surface,
        text: c.text,
        border: c.border,
        notification: c.accent,
      },
    };
  }, [scheme, c]);

  if (!ready) return null;

  return (
    <ThemeProvider value={theme}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: c.background },
          headerTintColor: c.accent,
          headerTitleStyle: { color: c.text },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: c.background },
        }}>
        <Stack.Protected guard={!profile}>
          <Stack.Screen name="onboarding" options={{ headerShown: false }} />
        </Stack.Protected>
        <Stack.Protected guard={!!profile}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen
            name="trip/new"
            options={{
              title: 'New trip',
              presentation: 'modal',
              headerLeft: () => (
                <Button
                  title="Cancel"
                  kind="ghost"
                  onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
                />
              ),
            }}
          />
          <Stack.Screen name="trip/[id]" options={{ title: 'Plan' }} />
        </Stack.Protected>
        <Stack.Screen name="about" options={{ title: 'About & science' }} />
      </Stack>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <AppStoreProvider>
      <RootStack />
    </AppStoreProvider>
  );
}

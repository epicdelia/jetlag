import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { ProfileForm } from '@/components/profile-form';
import { Button, Card, Screen, T } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useAppStore } from '@/lib/store';
import { sleepProfileError } from '@/lib/trip-form';
import { DEFAULT_PROFILE, type Profile } from '@/lib/types';

export default function Onboarding() {
  const { setProfile } = useAppStore();
  const [draft, setDraft] = useState<Profile>(DEFAULT_PROFILE);
  const invalid = sleepProfileError(draft.sleep) !== null;

  return (
    <Screen topInset>
      <View style={{ gap: Spacing.sm, paddingTop: Spacing.lg }}>
        <T variant="label">Welcome</T>
        <T variant="title" accessibilityRole="header">
          Arrive on local time, sooner.
        </T>
        <T variant="secondary">
          Shift builds a day-by-day plan for when to seek and avoid light, sleep, and (optionally) caffeine, based on
          published research on the body clock. First, a few things about how you sleep at home.
        </T>
      </View>

      <Card>
        <ProfileForm value={draft} onChange={setDraft} />
      </Card>

      <T variant="small" muted>
        This is general wellness guidance, not medical advice. You can change all of this later in Settings.
      </T>

      {invalid ? (
        <T variant="small" muted>
          Fix your usual sleep times above to continue.
        </T>
      ) : null}
      <Button
        title="Continue"
        disabled={invalid}
        onPress={() => {
          if (invalid) return;
          setProfile(draft);
          router.replace('/');
        }}
      />
      <Button title="How this works" kind="ghost" onPress={() => router.push('/about')} />
    </Screen>
  );
}

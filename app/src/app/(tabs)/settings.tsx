import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Platform, View } from 'react-native';

import { ProfileForm } from '@/components/profile-form';
import { Banner, Button, Card, Screen, Section, Segmented, T, ToggleRow } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { getPermission, notificationsSupported, type PermissionState } from '@/lib/notifications';
import { useAppStore } from '@/lib/store';
import { sleepProfileError } from '@/lib/trip-form';
import type { Profile } from '@/lib/types';

const LEADS = ['0', '10', '30'] as const;

export default function Settings() {
  const { profile, setProfile, settings, setSettings, reminders, resync, resetAll } = useAppStore();
  const [perm, setPerm] = useState<PermissionState>('undetermined');
  // Edits are kept as a draft and saved only while the engine can use them, so an
  // out-of-range sleep profile never reaches new trips.
  const [draft, setDraft] = useState<Profile | null>(profile);
  useEffect(() => {
    if (profile && (!draft || sleepProfileError(draft.sleep) === null)) setDraft(profile);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);
  const onProfileChange = (p: Profile) => {
    setDraft(p);
    if (sleepProfileError(p.sleep) === null) setProfile(p);
  };

  useEffect(() => {
    void getPermission().then(setPerm);
  }, [reminders]);

  if (!profile || !draft) return null;
  const draftInvalid = sleepProfileError(draft.sleep) !== null;

  const confirmReset = () => {
    const doIt = () => void resetAll();
    const msg = 'This deletes your profile, all trips and scheduled reminders from this device.';
    if (Platform.OS === 'web') {
      // eslint-disable-next-line no-alert
      if (typeof window !== 'undefined' && window.confirm(msg)) doIt();
      return;
    }
    Alert.alert('Erase all data?', msg, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Erase', style: 'destructive', onPress: doIt },
    ]);
  };

  return (
    <Screen>
      <Card>
        <ProfileForm value={draft} onChange={onProfileChange} />
        <T variant="small" muted style={{ marginTop: Spacing.sm }}>
          {draftInvalid
            ? 'Not saved yet: your previous sleep times stay in use until these are in range.'
            : 'Changes apply to new trips. Existing plans offer a one-tap rebuild.'}
        </T>
      </Card>

      <Card>
        <Section title="Reminders">
          {notificationsSupported ? (
            <View>
              <ToggleRow
                label="Notify me before each step"
                description="Local notifications on this device only. Nothing is sent to a server."
                value={settings.notificationsEnabled}
                onChange={(v) => void setSettings({ ...settings, notificationsEnabled: v })}>
                {settings.notificationsEnabled ? (
                  <Segmented
                    accessibilityLabel="Remind me this many minutes before"
                    options={LEADS.map((v) => ({ value: v, label: v === '0' ? 'At start' : `${v} min before` }))}
                    value={(LEADS.find((x) => Number(x) === settings.leadMinutes) ?? '10') as (typeof LEADS)[number]}
                    onChange={(v) => void setSettings({ ...settings, leadMinutes: Number(v) })}
                  />
                ) : null}
              </ToggleRow>
              {settings.notificationsEnabled && perm === 'denied' ? (
                <Banner>
                  Notifications are turned off for Shift in system settings, so reminders can't be delivered. Your plans
                  still work in the app.
                </Banner>
              ) : null}
              {reminders ? (
                <T variant="small" muted style={{ marginTop: Spacing.sm }}>
                  {reminders.scheduled} reminder{reminders.scheduled === 1 ? '' : 's'} scheduled (up to 60 at a time;
                  more are added as you open the app).
                </T>
              ) : null}
              {settings.notificationsEnabled ? (
                <Button title="Refresh reminders" kind="secondary" onPress={() => void resync(true)} />
              ) : null}
            </View>
          ) : (
            <T variant="secondary">Reminders are available in the iOS and Android app, not on the web.</T>
          )}
        </Section>
      </Card>

      <Button title="About, science & limitations" kind="secondary" onPress={() => router.push('/about')} />
      <Button title="Erase all data" kind="danger" onPress={confirmReset} />
    </Screen>
  );
}

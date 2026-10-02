import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
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
  // Edits are kept as a draft. Stepping through times passes values nobody chose, so nothing is
  // saved per step: the draft is saved with Save, or when leaving the screen if the engine can use
  // it. An out-of-range draft is discarded on leaving, so it never reaches new trips.
  const [draft, setDraft] = useState<Profile | null>(profile);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const profileRef = useRef(profile);
  profileRef.current = profile;
  useEffect(() => {
    setDraft(profile);
  }, [profile]);
  const changed = !!draft && !!profile && JSON.stringify(draft) !== JSON.stringify(profile);
  const saveDraft = () => {
    if (draft && sleepProfileError(draft.sleep) === null) void setProfile(draft);
  };
  useFocusEffect(
    useCallback(
      () => () => {
        const d = draftRef.current;
        const p = profileRef.current;
        if (!d || !p || JSON.stringify(d) === JSON.stringify(p)) return;
        if (sleepProfileError(d.sleep) === null) void setProfile(d);
        else setDraft(p);
      },
      [setProfile],
    ),
  );

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
        <ProfileForm value={draft} onChange={setDraft} />
        <T variant="small" muted style={{ marginTop: Spacing.sm }} accessibilityLiveRegion="polite">
          {draftInvalid
            ? `Not saved: these sleep times are out of range. Your saved times (bed ${profile.sleep.usualBedtime}, wake ${profile.sleep.usualWake}) stay in use, and leaving this screen discards these.`
            : changed
              ? 'Unsaved changes. They are saved when you tap Save or leave this screen. They apply to new trips; existing plans offer a one-tap rebuild.'
              : 'Saved. Changes apply to new trips; existing plans offer a one-tap rebuild.'}
        </T>
        {changed ? (
          <View style={{ flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm }}>
            <View style={{ flex: 1 }}>
              <Button title="Save" onPress={saveDraft} disabled={draftInvalid} />
            </View>
            <View style={{ flex: 1 }}>
              <Button title="Discard" kind="secondary" onPress={() => setDraft(profile)} />
            </View>
          </View>
        ) : null}
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

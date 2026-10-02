import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Platform, StyleSheet, View } from 'react-native';

import { PlaceField } from '@/components/city-picker';
import { Banner, Button, Card, Field, Screen, Section, T } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { usePalette } from '@/hooks/use-palette';
import { computePlan } from '@/lib/plan';
import { newId, useAppStore } from '@/lib/store';
import { defaultTripName, emptyLeg, sleepProfileError, validateTrip } from '@/lib/trip-form';
import type { LegDraft } from '@/lib/types';
import { formatDuration, formatOffset, localToUtc } from '@/lib/tz';

export default function NewTrip() {
  const { profile, saveTrip } = useAppStore();
  const { c } = usePalette();
  const [legs, setLegs] = useState<LegDraft[]>(() => [emptyLeg()]);
  const [stay, setStay] = useState('');
  const [name, setName] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [engineError, setEngineError] = useState<string | null>(null);

  const result = useMemo(() => (profile ? validateTrip(legs, stay, profile) : null), [legs, stay, profile]);
  if (!profile || !result) return null;

  const update = (i: number, patch: Partial<LegDraft>) =>
    setLegs((ls) => {
      const next = ls.map((l, j) => (j === i ? { ...l, ...patch } : l));
      // Keep the following leg's origin in step with this leg's destination.
      if (patch.toTz !== undefined && next[i + 1]) {
        next[i + 1] = { ...next[i + 1]!, fromTz: patch.toTz, fromLabel: patch.toLabel ?? '' };
      }
      return next;
    });

  const profileError = sleepProfileError(profile.sleep);
  const goToSettings = () => {
    if (router.canGoBack()) router.back();
    router.navigate('/settings');
  };

  const onSave = async () => {
    setSubmitted(true);
    setEngineError(null);
    if (profileError || !result.input) return;
    const plan = computePlan(result.input);
    if (!plan.ok) {
      setEngineError(
        plan.kind === 'input'
          ? `The planner couldn't use this trip: ${plan.message}`
          : `The planner hit a problem (${plan.message}). Your trip was not saved.`,
      );
      return;
    }
    setSaving(true);
    const id = newId();
    const scheduled = await saveTrip({
      id,
      name: name.trim() || defaultTripName(legs),
      createdAt: new Date().toISOString(),
      input: result.input,
      legsLocal: legs,
      profileAtSave: profile,
    });
    setSaving(false);
    router.replace({ pathname: '/trip/[id]', params: { id } });
    if (Platform.OS !== 'web' && scheduled === 0) {
      // Non-blocking: explain once why no reminders were set.
      setTimeout(
        () =>
          Alert.alert(
            'No reminders scheduled',
            'Your plan is saved. Reminders are off or notification permission was not granted; you can change this in Settings.',
          ),
        400,
      );
    }
  };

  const show = (msg?: string | null) => (submitted ? msg : null);

  return (
    <Screen>
      <T variant="secondary">
        Enter each flight with the times printed on your ticket: departure in the departure city's local time, arrival
        in the arrival city's local time.
      </T>

      {legs.map((leg, i) => {
        const e = result.legErrors[i] ?? {};
        const dur = result.durations[i];
        const depOff = leg.fromTz ? localToUtc(leg.departDate, leg.departTime, leg.fromTz) : null;
        const arrOff = leg.toTz ? localToUtc(leg.arriveDate, leg.arriveTime, leg.toTz) : null;
        return (
          <Card key={i}>
            <View style={st.legHeader}>
              <T variant="heading" accessibilityRole="header" style={{ flex: 1 }}>
                {legs.length > 1 ? `Flight ${i + 1}` : 'Flight'}
              </T>
              {legs.length > 1 ? (
                <Button
                  title="Remove"
                  kind="ghost"
                  onPress={() => setLegs((ls) => ls.filter((_, j) => j !== i))}
                />
              ) : null}
            </View>
            {e.leg ? <Banner>{e.leg}</Banner> : null}
            <View style={st.row}>
              <PlaceField
                label="From"
                value={leg.fromTz ? { tz: leg.fromTz, label: leg.fromLabel } : null}
                onChange={(p) => update(i, { fromTz: p.tz, fromLabel: p.label })}
                error={show(e.from)}
              />
              <PlaceField
                label="To"
                value={leg.toTz ? { tz: leg.toTz, label: leg.toLabel } : null}
                onChange={(p) => update(i, { toTz: p.tz, toLabel: p.label })}
                error={show(e.to)}
              />
            </View>

            <T variant="subheading" style={{ marginTop: Spacing.sm }}>
              Departs{leg.fromTz ? ` (local time, ${depOff?.ok ? formatOffset(depOff.ms, leg.fromTz) : leg.fromTz})` : ''}
            </T>
            <View style={st.row}>
              <Field
                style={st.dateField}
                label="Date"
                value={leg.departDate}
                onChangeText={(t) => update(i, { departDate: t })}
                placeholder="YYYY-MM-DD"
                inputMode="numeric"
                maxLength={10}
              />
              <Field
                style={st.timeField}
                label="Time"
                value={leg.departTime}
                onChangeText={(t) => update(i, { departTime: t })}
                placeholder="HH:mm"
                inputMode="numeric"
                maxLength={5}
              />
            </View>
            {show(e.depart) ? <T variant="small" style={{ color: c.danger }}>{e.depart}</T> : null}

            <T variant="subheading" style={{ marginTop: Spacing.sm }}>
              Arrives{leg.toTz ? ` (local time, ${arrOff?.ok ? formatOffset(arrOff.ms, leg.toTz) : leg.toTz})` : ''}
            </T>
            <View style={st.row}>
              <Field
                style={st.dateField}
                label="Date"
                value={leg.arriveDate}
                onChangeText={(t) => update(i, { arriveDate: t })}
                placeholder="YYYY-MM-DD"
                inputMode="numeric"
                maxLength={10}
              />
              <Field
                style={st.timeField}
                label="Time"
                value={leg.arriveTime}
                onChangeText={(t) => update(i, { arriveTime: t })}
                placeholder="HH:mm"
                inputMode="numeric"
                maxLength={5}
              />
            </View>
            {show(e.arrive) ? <T variant="small" style={{ color: c.danger }}>{e.arrive}</T> : null}
            {dur != null && dur > 0 ? (
              <T variant="small" muted accessibilityLiveRegion="polite">
                Flight time: {formatDuration(dur)}. If this doesn't match your ticket, check the dates and cities.
              </T>
            ) : null}
          </Card>
        );
      })}

      <Button
        title="Add a connecting flight"
        kind="secondary"
        onPress={() => setLegs((ls) => [...ls, emptyLeg(ls[ls.length - 1])])}
      />

      <Card>
        <Section title="Trip details">
          <Field
            label="Days at your destination (optional)"
            value={stay}
            onChangeText={setStay}
            placeholder="e.g. 5"
            inputMode="numeric"
            error={show(result.stayError)}
          />
          <T variant="small" muted>
            For very short stays it can be better to stay on home time rather than adapt.
          </T>
          <Field
            label="Name (optional)"
            value={name}
            onChangeText={setName}
            placeholder={defaultTripName(legs)}
          />
        </Section>
      </Card>

      {result.notes.map((n) => (
        <Banner key={n} tone="info">
          {n}
        </Banner>
      ))}
      {submitted && !result.input ? <Banner>Please fix the highlighted fields.</Banner> : null}
      {engineError ? <Banner>{engineError}</Banner> : null}
      {profileError ? (
        <Banner>
          <T variant="small" style={{ color: c.warningText }}>
            Your sleep profile needs a fix before a plan can be built. {profileError}
          </T>
          <Button title="Open Settings" kind="secondary" onPress={goToSettings} />
        </Banner>
      ) : null}

      <Button title={saving ? 'Saving…' : 'Build my plan'} onPress={onSave} disabled={saving || !!profileError} />
      <T variant="small" muted>
        Uses your sleep profile: bed {profile.sleep.usualBedtime}, wake {profile.sleep.usualWake}, {profile.sleep.chronotype}{' '}
        chronotype.
      </T>
    </Screen>
  );
}

const st = StyleSheet.create({
  legHeader: { flexDirection: 'row', alignItems: 'center' },
  row: { flexDirection: 'row', gap: Spacing.md },
  dateField: { flex: 3 },
  timeField: { flex: 2 },
});

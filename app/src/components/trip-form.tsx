import type { TripInput } from '@jetlag/engine';
import { router } from 'expo-router';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Alert, Platform, StyleSheet, View } from 'react-native';

import { PlaceField } from '@/components/city-picker';
import { DateTimeField } from '@/components/date-time-field';
import { Banner, Button, Card, Field, Screen, Section, T } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { usePalette } from '@/hooks/use-palette';
import { computePlan } from '@/lib/plan';
import { newId, useAppStore } from '@/lib/store';
import { defaultTripName, emptyLeg, sleepProfileError, validateTrip } from '@/lib/trip-form';
import type { TripDraft } from '@/lib/trip-edit';
import type { LegDraft, Trip } from '@/lib/types';
import { dateKeyPlusDays, formatDuration, formatOffset, localToUtc, parseDate } from '@/lib/tz';

export interface TripFormProps {
  /** Starting values; defaults to one empty leg from the device's zone. */
  initial?: TripDraft;
  /** When set, saving replaces this trip (same id) instead of adding a new one. */
  editing?: Trip;
  /** Shown above the flights (e.g. return-trip notes). */
  intro?: ReactNode;
  /** Extra fields stored on the saved trip (e.g. `returnOf`). */
  meta?: Pick<Trip, 'returnOf'>;
  /** Last chance to adjust the engine input before planning (e.g. return-trip starting phase). */
  adjustInput?: (input: TripInput) => TripInput;
  submitTitle?: string;
}

/**
 * New / Edit trip form. Flight times are entered as the ticket shows them, in each airport's
 * local time, and converted with `localToUtc` (via `validateTrip`).
 */
export function TripForm({ initial, editing, intro, meta, adjustInput, submitTitle }: TripFormProps) {
  const { profile, saveTrip } = useAppStore();
  const { c } = usePalette();
  const [legs, setLegs] = useState<LegDraft[]>(() => initial?.legs ?? [emptyLeg()]);
  const [stay, setStay] = useState(initial?.stay ?? '');
  const [name, setName] = useState(initial?.name ?? '');
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [engineError, setEngineError] = useState<string | null>(null);
  // Last complete departure date per leg. Typed dates pass through partial values ("2026-10-2")
  // on every keystroke, so the arrival date moves by the change from the last *valid* date.
  const lastDepart = useRef<(string | null)[]>(legs.map((l) => (parseDate(l.departDate) ? l.departDate : null)));

  const result = useMemo(() => (profile ? validateTrip(legs, stay, profile) : null), [legs, stay, profile]);
  if (!profile || !result) return null;

  const update = (i: number, patch: Partial<LegDraft>) => {
    // Moving the departure date carries the arrival date along (keeps the overnight gap).
    let shiftDays = 0;
    if (patch.departDate !== undefined && patch.arriveDate === undefined && parseDate(patch.departDate)) {
      const base = lastDepart.current[i];
      shiftDays = base ? (daysBetween(base, patch.departDate) ?? 0) : 0;
      lastDepart.current[i] = patch.departDate;
    }
    setLegs((ls) => {
      const next = ls.map((l, j) => (j === i ? { ...l, ...patch } : l));
      const prev = ls[i];
      if (prev && shiftDays !== 0 && parseDate(prev.arriveDate)) {
        next[i] = { ...next[i]!, arriveDate: dateKeyPlusDays(prev.arriveDate, shiftDays) };
      }
      // Keep the following leg's origin in step with this leg's destination.
      if (patch.toTz !== undefined && next[i + 1]) {
        next[i + 1] = { ...next[i + 1]!, fromTz: patch.toTz, fromLabel: patch.toLabel ?? '' };
      }
      return next;
    });
  };

  const profileError = sleepProfileError(profile.sleep);
  const goToSettings = () => {
    if (router.canGoBack()) router.back();
    router.navigate('/settings');
  };

  const onSave = async () => {
    setSubmitted(true);
    setEngineError(null);
    if (profileError || !result.input) return;
    const input = adjustInput ? adjustInput(result.input) : result.input;
    const plan = computePlan(input);
    if (!plan.ok) {
      setEngineError(
        plan.kind === 'input'
          ? `The planner couldn't use this trip: ${plan.message}`
          : `The planner hit a problem (${plan.message}). Your trip was not saved.`,
      );
      return;
    }
    setSaving(true);
    const id = editing?.id ?? newId();
    const scheduled = await saveTrip({
      ...editing,
      ...meta,
      id,
      name: name.trim() || defaultTripName(legs),
      createdAt: editing?.createdAt ?? new Date().toISOString(),
      input,
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
      {intro}

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
                  onPress={() => {
                    lastDepart.current = lastDepart.current.filter((_, j) => j !== i);
                    setLegs((ls) => ls.filter((_, j) => j !== i));
                  }}
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
              <DateTimeField
                mode="date"
                style={st.dateField}
                label="Departure date"
                value={leg.departDate}
                fallbackDate={leg.departDate}
                onChange={(t) => update(i, { departDate: t })}
                error={!!show(e.depart)}
              />
              <DateTimeField
                mode="time"
                style={st.timeField}
                label="Departure time"
                value={leg.departTime}
                fallbackDate={leg.departDate}
                placeholder={Platform.OS === 'web' ? 'HH:mm' : 'Set time'}
                onChange={(t) => update(i, { departTime: t })}
                error={!!show(e.depart)}
              />
            </View>
            {show(e.depart) ? <T variant="small" style={{ color: c.danger }}>{e.depart}</T> : null}

            <T variant="subheading" style={{ marginTop: Spacing.sm }}>
              Arrives{leg.toTz ? ` (local time, ${arrOff?.ok ? formatOffset(arrOff.ms, leg.toTz) : leg.toTz})` : ''}
            </T>
            <View style={st.row}>
              <DateTimeField
                mode="date"
                style={st.dateField}
                label="Arrival date"
                value={leg.arriveDate}
                fallbackDate={leg.departDate}
                onChange={(t) => update(i, { arriveDate: t })}
                error={!!show(e.arrive)}
              />
              <DateTimeField
                mode="time"
                style={st.timeField}
                label="Arrival time"
                value={leg.arriveTime}
                fallbackDate={leg.arriveDate || leg.departDate}
                placeholder={Platform.OS === 'web' ? 'HH:mm' : 'Set time'}
                onChange={(t) => update(i, { arriveTime: t })}
                error={!!show(e.arrive)}
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
        onPress={() => {
          const added = emptyLeg(legs[legs.length - 1]);
          lastDepart.current = [...lastDepart.current, parseDate(added.departDate) ? added.departDate : null];
          setLegs((ls) => [...ls, added]);
        }}
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

      <Button title={saving ? 'Saving…' : (submitTitle ?? 'Build my plan')} onPress={onSave} disabled={saving || !!profileError} />
      <T variant="small" muted>
        Uses your sleep profile: bed {profile.sleep.usualBedtime}, wake {profile.sleep.usualWake}, {profile.sleep.chronotype}{' '}
        chronotype.
      </T>
    </Screen>
  );
}

function daysBetween(a: string, b: string): number | null {
  const x = parseDate(a);
  const y = parseDate(b);
  if (!x || !y) return null;
  return Math.round((Date.UTC(y.y, y.m - 1, y.d) - Date.UTC(x.y, x.m - 1, x.d)) / 864e5);
}

const st = StyleSheet.create({
  legHeader: { flexDirection: 'row', alignItems: 'center' },
  row: { flexDirection: 'row', gap: Spacing.md },
  dateField: { flex: 3 },
  timeField: { flex: 2 },
});

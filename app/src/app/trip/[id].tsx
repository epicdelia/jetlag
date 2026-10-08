import type { AdviceKind, Plan } from '@jetlag/engine';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { memo, startTransition, useEffect, useMemo, useState } from 'react';
import { Alert, Platform, View } from 'react-native';

import { StrategyCard } from '@/components/strategy-card';
import { DayStrip, Legend, LiveWindowRow, dayTitle, shiftStatus } from '@/components/timeline';
import { TripLegs } from '@/components/trip-summary';
import { Banner, Button, Card, Screen, T } from '@/components/ui';
import { MELATONIN_NOTE, SAFETY_NOTE } from '@/constants/copy';
import { Spacing } from '@/constants/theme';
import { computeTripPlan, dayStrips, hasMelatonin } from '@/lib/plan';
import { useAppStore } from '@/lib/store';
import { prefsForNow, sleepProfileError } from '@/lib/trip-form';
import { formatDateLabel, formatDateTime, zoneAbbr } from '@/lib/tz';
import { labelForZone } from '@/lib/cities';

/** Day cards rendered with the first frame; the rest follow in an interruptible transition. */
const FIRST_DAYS = 3;

export default function PlanScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { trips, profile, saveTrip, deleteTrip } = useAppStore();
  const trip = trips.find((t) => t.id === id);
  const returnTrip = trip ? trips.find((t) => t.returnOf === trip.id) : undefined;
  // computeTripPlan returns the same object (and plan) for the same trips, so the day cards
  // below stay memoised across store updates.
  const result = useMemo(() => (trip ? computeTripPlan(trip, trips) : null), [trip, trips]);
  // Map zones to the place names the user picked, for day headers.
  const zoneNames = useMemo(() => {
    const m = new Map<string, string>();
    for (const l of trip?.input.legs ?? []) {
      if (l.from.label) m.set(l.from.tz, l.from.label.replace(/\s*\([A-Z]{3}\)$/, ''));
      if (l.to.label) m.set(l.to.tz, l.to.label.replace(/\s*\([A-Z]{3}\)$/, ''));
    }
    return m;
  }, [trip]);
  const plan = result?.ok ? result.plan : null;
  const kinds = useMemo(
    () => (plan ? (Array.from(new Set(plan.days.flatMap((d) => d.windows.map((w) => w.kind)))) as AdviceKind[]) : []),
    [plan],
  );
  // A long plan is 20+ day cards and several hundred views: rendering them all before the first
  // paint blocks the tap for a few hundred ms on a slow device. Show the first days at once and
  // render the rest in a transition (time-sliced, so input and scrolling stay responsive).
  const dayCount = plan?.days.length ?? 0;
  const [shownDays, setShownDays] = useState(FIRST_DAYS);
  useEffect(() => {
    if (shownDays < dayCount) startTransition(() => setShownDays(dayCount));
  }, [shownDays, dayCount]);

  if (!trip || !result) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Plan' }} />
        <T variant="heading">Trip not found</T>
        <Button title="Back to trips" onPress={() => router.replace('/trips')} />
      </Screen>
    );
  }

  const destTz = trip.input.legs[trip.input.legs.length - 1]!.to.tz;

  const basis = trip.profileAtSave ?? { sleep: trip.input.sleep, prefs: trip.input.prefs };
  const profileChanged =
    profile &&
    (JSON.stringify(profile.sleep) !== JSON.stringify(basis.sleep) ||
      JSON.stringify(profile.prefs) !== JSON.stringify(basis.prefs));
  const profileProblem = profile ? sleepProfileError(profile.sleep) : null;

  const confirmDelete = () => {
    const doIt = () => {
      deleteTrip(trip.id);
      router.replace('/trips');
    };
    if (Platform.OS === 'web') {
      // eslint-disable-next-line no-alert
      if (typeof window !== 'undefined' && window.confirm('Delete this trip and its reminders?')) doIt();
      return;
    }
    Alert.alert('Delete trip?', 'This removes the plan and its reminders.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: doIt },
    ]);
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: trip.name }} />
      <View style={{ gap: Spacing.xs }}>
        <T variant="title" accessibilityRole="header">
          {trip.name}
        </T>
        <TripLegs trip={trip} />
        {trip.input.stayDays ? (
          <T variant="small" muted>
            Staying {trip.input.stayDays} day{trip.input.stayDays === 1 ? '' : 's'}
          </T>
        ) : null}
      </View>

      {profileChanged ? (
        <Banner tone="info">
          <T variant="small">Your sleep profile or preferences changed since this plan was made.</T>
          {profileProblem ? (
            <T variant="small">{profileProblem}</T>
          ) : (
            <Button
              title="Rebuild with current profile"
              kind="secondary"
              onPress={() => {
                // Re-check which pre-flight days are still ahead: never plan days in the past.
                const prefs = prefsForNow(profile.prefs, trip.input.legs, Date.now());
                void saveTrip({
                  ...trip,
                  input: { ...trip.input, sleep: { ...profile.sleep }, prefs: { ...prefs } },
                  profileAtSave: profile,
                });
              }}
            />
          )}
        </Banner>
      ) : null}

      {!result.ok ? (
        <Banner>
          {result.kind === 'input'
            ? `The planner couldn't use this trip: ${result.message}`
            : `The plan couldn't be built right now (${result.message}).`}
        </Banner>
      ) : (
        <>
          {result.fixture ? <Banner>Development fixture data. Not a real plan.</Banner> : null}
          <StrategyCard plan={result.plan} />
          {hasMelatonin(result.plan) ? <Banner tone="info">{MELATONIN_NOTE}</Banner> : null}
          {result.handoffAt != null && result.returnTrip ? (
            <Banner tone="info">
              <T variant="small">
                From {formatDateTime(result.handoffAt, destTz)} {zoneAbbr(result.handoffAt, destTz)}, your return plan
                takes over, so this plan stops there.
              </T>
            </Banner>
          ) : null}
          {result.plan.days.length > 0 ? <Legend kinds={kinds} /> : null}
          {result.plan.days.slice(0, shownDays).map((d, di) => (
            <DayCard key={`${d.dayIndex}-${d.date}`} plan={result.plan} index={di} zoneNames={zoneNames} destTz={destTz} />
          ))}
        </>
      )}

      <View style={{ gap: Spacing.sm }}>
        {returnTrip ? (
          <Button
            title="View my return plan"
            kind="secondary"
            onPress={() => router.push({ pathname: '/trip/[id]', params: { id: returnTrip.id } })}
          />
        ) : !trip.returnOf ? (
          <Button
            title="Plan my return"
            kind="secondary"
            accessibilityHint="Opens a new trip with this route reversed"
            onPress={() => router.push({ pathname: '/trip/new', params: { returnOf: trip.id } })}
          />
        ) : null}
        <Button
          title="Edit trip"
          kind="secondary"
          accessibilityHint="Change flights or stay; the plan and reminders are rebuilt"
          onPress={() => router.push({ pathname: '/trip/new', params: { edit: trip.id } })}
        />
      </View>

      <T variant="small" muted>
        {SAFETY_NOTE}
      </T>
      <Button title="About the science" kind="ghost" onPress={() => router.push('/about')} />
      <Button title="Delete trip" kind="danger" onPress={confirmDelete} />
    </Screen>
  );
}

/**
 * One plan day: header, timeline strip(s) and advice rows. Memoised and free of the clock: the
 * 30 s tick re-renders only the now marker and the active row inside it.
 */
const DayCard = memo(function DayCard({
  plan,
  index,
  zoneNames,
  destTz,
}: {
  plan: Plan;
  index: number;
  zoneNames: Map<string, string>;
  destTz: string;
}) {
  const d = plan.days[index]!;
  const zone = zoneNames.get(d.tz) ?? labelForZone(d.tz);
  const mid = Date.parse(`${d.date}T12:00:00Z`);
  const strips = dayStrips(plan, index);
  return (
    <Card style={{ gap: Spacing.md }}>
      <View style={{ gap: 2 }}>
        <T variant="label">{dayTitle(d)}</T>
        <T variant="heading" accessibilityRole="header">
          {formatDateLabel(d.date)} · {zone}
        </T>
        <T variant="small" muted>
          Times in {zoneAbbr(mid, d.tz)} ({d.tz}) unless marked. {shiftStatus(d, destTz, zoneNames.get(destTz))}.
        </T>
      </View>
      {strips.map((st) => (
        <DayStrip
          key={`${st.date}-${st.tz}`}
          plan={plan}
          strip={st}
          caption={
            strips.length > 1
              ? `${formatDateLabel(st.date)} · ${zoneNames.get(st.tz) ?? labelForZone(st.tz)} (${zoneAbbr(st.start + 12 * 3600e3, st.tz)})`
              : undefined
          }
        />
      ))}
      {d.windows.length === 0 ? (
        <T variant="secondary">Nothing special today: keep to local daytime and night.</T>
      ) : (
        <View>
          {d.windows.map((w, i) => (
            <LiveWindowRow key={i} w={w} dayDate={d.date} />
          ))}
        </View>
      )}
    </Card>
  );
});

import type { AdviceWindow, DayPlan, Plan } from '@jetlag/engine';
import { router } from 'expo-router';
import { View } from 'react-native';

import { DayStrip, WindowRow, dayTitle, shiftStatus } from '@/components/timeline';
import { Banner, Button, Card, Screen, T } from '@/components/ui';
import { SAFETY_NOTE } from '@/constants/copy';
import { Spacing } from '@/constants/theme';
import { useNow } from '@/hooks/use-now';
import { computePlan, isPoint, planSpan, allWindows } from '@/lib/plan';
import { useAppStore } from '@/lib/store';
import type { Trip } from '@/lib/types';
import { formatDateKey, formatDateLabel, formatDuration, formatTime, zoneAbbr } from '@/lib/tz';

interface Focus {
  trip: Trip;
  plan: Plan;
  state: 'active' | 'upcoming';
  start: number;
}

/** The trip whose plan covers now, else the next upcoming one. */
function pickFocus(trips: Trip[], now: number): Focus | null {
  let upcoming: Focus | null = null;
  for (const trip of trips) {
    const r = computePlan(trip.input);
    if (!r.ok) continue;
    const span = planSpan(r.plan);
    if (!span) continue;
    if (now >= span.start && now < span.end) return { trip, plan: r.plan, state: 'active', start: span.start };
    if (span.start > now && (!upcoming || span.start < upcoming.start)) {
      upcoming = { trip, plan: r.plan, state: 'upcoming', start: span.start };
    }
  }
  return upcoming;
}

function todayOf(plan: Plan, now: number): DayPlan | null {
  for (const d of plan.days) if (formatDateKey(now, d.tz) === d.date) return d;
  return null;
}

const POINT_WINDOW_MS = 30 * 60000;

export default function Today() {
  const { trips } = useAppStore();
  const now = useNow();
  const focus = pickFocus(trips, now);

  if (!focus) {
    return (
      <Screen>
        <View style={{ gap: Spacing.sm, paddingTop: Spacing.lg }}>
          <T variant="title" accessibilityRole="header">
            {trips.length ? 'No plan running today' : 'Plan your next trip'}
          </T>
          <T variant="secondary">
            Add your flights and Shift will tell you, day by day, when light, darkness, sleep and caffeine will help your
            body clock catch up.
          </T>
        </View>
        <Button title="New trip" onPress={() => router.push('/trip/new')} />
      </Screen>
    );
  }

  const { trip, plan } = focus;
  const ws = allWindows(plan);
  const nowWs: AdviceWindow[] = [];
  const nextWs: AdviceWindow[] = [];
  for (const w of ws) {
    const s = Date.parse(w.startUtc);
    const e = Date.parse(w.endUtc);
    if (isPoint(w) ? Math.abs(now - s) <= POINT_WINDOW_MS : s <= now && now < e) nowWs.push(w);
    else if (s > now && nextWs.length < 4) nextWs.push(w);
  }
  const today = todayOf(plan, now);
  const hereTz = today?.tz ?? nowWs[0]?.tz ?? nextWs[0]?.tz ?? trip.input.legs[0]!.from.tz;

  return (
    <Screen>
      <View style={{ gap: Spacing.xs }}>
        <T variant="label">{focus.state === 'active' ? 'Today' : 'Coming up'}</T>
        <T variant="title" accessibilityRole="header">
          {trip.name}
        </T>
        <T variant="secondary">
          {formatTime(now, hereTz)} {zoneAbbr(now, hereTz)} · {formatDateLabel(formatDateKey(now, hereTz))}
          {today ? ` · ${dayTitle(today)}` : ''}
        </T>
        {focus.state === 'upcoming' ? (
          <T variant="secondary">Your plan starts in {formatDuration((focus.start - now) / 60000)}.</T>
        ) : null}
      </View>

      {focus.state === 'active' ? (
        <Card>
          <T variant="label">Right now</T>
          {nowWs.length ? (
            nowWs.map((w, i) => <WindowRow key={i} w={w} active />)
          ) : (
            <T variant="secondary">Nothing specific: follow local daytime and night as best you can.</T>
          )}
        </Card>
      ) : null}

      <Card>
        <T variant="label">Next</T>
        {nextWs.length ? (
          nextWs.map((w, i) => (
            <View key={i}>
              <T variant="small" muted style={{ paddingHorizontal: Spacing.xs }}>
                in {formatDuration((Date.parse(w.startUtc) - now) / 60000)}
              </T>
              <WindowRow w={w} />
            </View>
          ))
        ) : (
          <T variant="secondary">That's the end of this plan. You should be close to adapted.</T>
        )}
      </Card>

      {today ? (
        <Card style={{ gap: Spacing.md }}>
          <T variant="label">Today at a glance</T>
          <DayStrip plan={plan} day={today} now={now} />
          <T variant="small" muted>
            {shiftStatus(today.remainingShiftHours)}.
          </T>
        </Card>
      ) : null}

      {plan.warnings.length > 0 ? <Banner>{plan.warnings.join(' ')}</Banner> : null}

      <Button
        title="See full plan"
        kind="secondary"
        onPress={() => router.push({ pathname: '/trip/[id]', params: { id: trip.id } })}
      />
      <T variant="small" muted>
        {SAFETY_NOTE}
      </T>
    </Screen>
  );
}

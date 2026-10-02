import type { AdviceKind } from '@jetlag/engine';

import { AdviceLabels } from '@/constants/theme';
import { computeTripPlan, isPoint } from './plan';
import type { Trip } from './types';
import { formatTime, zoneAbbr } from './tz';

export interface Reminder {
  /** Stable identifier (trip, window start, kind): rescheduling replaces instead of duplicating. */
  id: string;
  /** Delivery instant (epoch ms). */
  at: number;
  title: string;
  body: string;
  tripId: string;
}

/** iOS keeps at most 64 pending local notifications per app; stay below it. */
export const MAX_PENDING = 60;

/** Kinds worth interrupting someone for. "Caffeine OK" is permissive, not an action, so it is skipped. */
const NOTIFY_KINDS: ReadonlySet<AdviceKind> = new Set<AdviceKind>([
  'seek_light',
  'avoid_light',
  'sleep',
  'nap',
  'avoid_caffeine',
  'melatonin',
]);

/** Upcoming reminders across all trips, soonest first, capped at MAX_PENDING. */
export function upcomingReminders(trips: Trip[], leadMinutes: number, now = Date.now()): Reminder[] {
  const out: Reminder[] = [];
  for (const trip of trips) {
    // An outbound plan stops where its return plan starts, so the two never both remind.
    const r = computeTripPlan(trip, trips);
    if (!r.ok || r.fixture) continue;
    for (const day of r.plan.days) {
      for (const w of day.windows) {
        if (!NOTIFY_KINDS.has(w.kind)) continue;
        const start = Date.parse(w.startUtc);
        const at = start - leadMinutes * 60000;
        if (!(at > now + 30000)) continue;
        const label = AdviceLabels[w.kind];
        const zone = zoneAbbr(start, w.tz);
        const when = isPoint(w)
          ? `at ${formatTime(start, w.tz)} ${zone}`
          : `${formatTime(start, w.tz)}–${formatTime(Date.parse(w.endUtc), w.tz)} ${zone}`;
        out.push({
          id: `${trip.id}:${w.startUtc}:${w.kind}`,
          at,
          title: `${label.verb} ${when}`,
          body: w.rationale,
          tripId: trip.id,
        });
      }
    }
  }
  out.sort((a, b) => a.at - b.at);
  return out.slice(0, MAX_PENDING);
}

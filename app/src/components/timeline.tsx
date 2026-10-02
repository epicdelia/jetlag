import { formatWindowLocal, type AdviceKind, type AdviceWindow, type DayPlan, type Plan } from '@jetlag/engine';
import { StyleSheet, View } from 'react-native';

import { AdviceLabels, AdviceOrder, Radius, Spacing } from '@/constants/theme';
import { usePalette } from '@/hooks/use-palette';
import { allWindows, isPoint } from '@/lib/plan';
import { dateKeyPlusDays, formatDateKey, formatDateLabel, formatTime, localToUtc, zoneAbbr } from '@/lib/tz';
import { T } from './ui';

/** "07:00–09:30 JST", "at 17:30 JST"; adds "(+1)" when the end falls on a later local date. */
export function formatWindowTime(w: AdviceWindow): string {
  const s = Date.parse(w.startUtc);
  const e = Date.parse(w.endUtc);
  const zone = zoneAbbr(s, w.tz);
  if (isPoint(w)) return `at ${formatTime(s, w.tz)} ${zone}`;
  const dayDiff = Math.round(
    (Date.parse(`${formatDateKey(e, w.tz)}T00:00:00Z`) - Date.parse(`${formatDateKey(s, w.tz)}T00:00:00Z`)) / 864e5,
  );
  return `${formatTime(s, w.tz)}–${formatTime(e, w.tz)}${dayDiff > 0 ? ` (+${dayDiff})` : ''} ${zone}`;
}

export function dayTitle(d: DayPlan): string {
  if (d.dayIndex < 0) return `${-d.dayIndex} day${d.dayIndex === -1 ? '' : 's'} before you fly`;
  if (d.dayIndex === 0) return 'Travel day';
  return `Day ${d.dayIndex} after departure`;
}

export function shiftStatus(hours: number): string {
  const h = Math.round(Math.abs(hours) * 2) / 2;
  if (h < 0.5) return 'Body clock: adapted to local time';
  return hours > 0
    ? `Body clock: ~${h}h behind local time`
    : `Body clock: ~${h}h ahead of local time`;
}

function dayBounds(d: DayPlan): { start: number; end: number } | null {
  const a = localToUtc(d.date, '00:00', d.tz);
  const b = localToUtc(dateKeyPlusDays(d.date, 1), '00:00', d.tz);
  const a2 = a.ok ? a : localToUtc(d.date, '01:00', d.tz);
  const b2 = b.ok ? b : localToUtc(dateKeyPlusDays(d.date, 1), '01:00', d.tz);
  if (!a2.ok || !b2.ok) return null;
  return { start: a2.ms, end: b2.ms };
}

const LANES: { key: string; label: string; kinds: AdviceKind[] }[] = [
  { key: 'sleep', label: 'Sleep', kinds: ['sleep', 'nap'] },
  { key: 'light', label: 'Light', kinds: ['seek_light', 'avoid_light'] },
  { key: 'caffeine', label: 'Caffeine', kinds: ['caffeine_ok', 'avoid_caffeine'] },
  { key: 'melatonin', label: 'Melatonin', kinds: ['melatonin'] },
];

/**
 * 24-hour strip for one local day (in the day's zone). Includes windows from
 * neighbouring days that overlap it (e.g. last night's sleep).
 */
export function DayStrip({ plan, day, now }: { plan: Plan; day: DayPlan; now?: number }) {
  const { c, advice } = usePalette();
  const b = dayBounds(day);
  if (!b) return null;
  const span = b.end - b.start;
  const ws = allWindows(plan).filter((w) => {
    const s = Date.parse(w.startUtc);
    const e = Date.parse(w.endUtc);
    return isPoint(w) ? s >= b.start && s < b.end : e > b.start && s < b.end;
  });
  const lanes = LANES.filter((l) => ws.some((w) => l.kinds.includes(w.kind)));
  if (lanes.length === 0) return null;
  const pct = (ms: number) => `${(Math.min(Math.max(ms - b.start, 0), span) / span) * 100}%` as const;
  const nowIn = now !== undefined && now >= b.start && now < b.end;

  return (
    <View
      accessible
      accessibilityLabel={`Timeline for ${formatDateLabel(day.date)}. Details are listed below.`}
      style={{ gap: 6 }}>
      {lanes.map((lane) => (
        <View key={lane.key} style={s.laneRow}>
          <T variant="small" muted style={s.laneLabel} numberOfLines={1}>
            {lane.label}
          </T>
          <View style={[s.lane, { backgroundColor: c.surfaceAlt }]}>
            {ws
              .filter((w) => lane.kinds.includes(w.kind))
              .map((w, i) => {
                const st = Date.parse(w.startUtc);
                const en = Date.parse(w.endUtc);
                if (isPoint(w)) {
                  return (
                    <View
                      key={i}
                      style={[s.point, { left: pct(st), backgroundColor: advice[w.kind], borderColor: c.surface }]}
                    />
                  );
                }
                return (
                  <View
                    key={i}
                    style={[
                      s.block,
                      {
                        left: pct(st),
                        width: `${((Math.min(en, b.end) - Math.max(st, b.start)) / span) * 100}%`,
                        backgroundColor: advice[w.kind],
                      },
                    ]}
                  />
                );
              })}
            {nowIn ? <View style={[s.now, { left: pct(now!), backgroundColor: c.danger }]} /> : null}
          </View>
        </View>
      ))}
      <View style={s.laneRow}>
        <View style={s.laneLabel} />
        <View style={s.ticks}>
          {['00', '06', '12', '18', '24'].map((h) => (
            <T key={h} variant="small" muted style={{ fontSize: 11 }}>
              {h}
            </T>
          ))}
        </View>
      </View>
    </View>
  );
}

/**
 * One advice window. Pass `dayDate` (the day's own date) inside a day card: when the window
 * starts on a different local date (travel day across a flight or the date line), the row
 * shows that date so nobody reads a Singapore-morning window as a London-evening one.
 */
export function WindowRow({ w, active, dayDate }: { w: AdviceWindow; active?: boolean; dayDate?: string }) {
  const { c, advice } = usePalette();
  const localDate = formatWindowLocal(w).localDate;
  const dateChip = dayDate && localDate !== dayDate ? formatDateLabel(localDate) : null;
  const time = dateChip ? `${dateChip}, ${formatWindowTime(w)}` : formatWindowTime(w);
  return (
    <View
      style={[s.windowRow, active && { backgroundColor: c.surfaceAlt, borderRadius: Radius.md }]}
      accessible
      accessibilityLabel={`${AdviceLabels[w.kind].title}, ${time}. ${w.rationale}`}>
      <View style={[s.swatch, { backgroundColor: advice[w.kind] }]} />
      <View style={{ flex: 1, gap: 2 }}>
        <View style={s.rowTitle}>
          <T variant="subheading">{AdviceLabels[w.kind].title}</T>
          <T variant="mono" style={{ fontSize: 14 }}>
            {time}
          </T>
        </View>
        <T variant="small" muted>
          {w.rationale}
        </T>
      </View>
    </View>
  );
}

export function Legend({ kinds }: { kinds: AdviceKind[] }) {
  const { advice } = usePalette();
  const present = AdviceOrder.filter((k) => kinds.includes(k));
  return (
    <View style={s.legend}>
      {present.map((k) => (
        <View key={k} style={s.legendItem}>
          <View style={[s.legendDot, { backgroundColor: advice[k] }]} />
          <T variant="small">{AdviceLabels[k].title}</T>
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  laneRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  laneLabel: { width: 70 },
  lane: { flex: 1, height: 14, borderRadius: 7, overflow: 'hidden', position: 'relative' },
  block: { position: 'absolute', top: 0, bottom: 0, borderRadius: 4 },
  point: {
    position: 'absolute',
    top: 0,
    width: 14,
    height: 14,
    marginLeft: -7,
    borderRadius: 7,
    borderWidth: 2,
  },
  now: { position: 'absolute', top: 0, bottom: 0, width: 2, marginLeft: -1 },
  ticks: { flex: 1, flexDirection: 'row', justifyContent: 'space-between' },
  windowRow: { flexDirection: 'row', gap: Spacing.md, paddingVertical: Spacing.sm, paddingHorizontal: Spacing.xs },
  swatch: { width: 6, borderRadius: 3, alignSelf: 'stretch' },
  rowTitle: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', columnGap: Spacing.sm },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 12, height: 12, borderRadius: 6 },
});

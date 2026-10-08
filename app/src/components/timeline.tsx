import { formatWindowLocal, type AdviceKind, type AdviceWindow, type DayPlan, type Plan } from '@jetlag/engine';
import { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { AdviceLabels, AdviceOrder, Radius, Spacing } from '@/constants/theme';
import { useNowIn, useNowWithin } from '@/hooks/use-now';
import { usePalette } from '@/hooks/use-palette';
import { allWindows, isPoint, type Strip } from '@/lib/plan';
import { formatDateKey, formatDateLabel, formatTime, offsetMinutes, zoneAbbr } from '@/lib/tz';
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

const half = (h: number) => Math.round(Math.abs(h) * 2) / 2;

/** An hour offset wrapped to [−12, 12): offsets a whole day apart are the same clock. */
export function wrap12(h: number): number {
  return ((((h + 12) % 24) + 24) % 24) - 12;
}

/**
 * Body-clock status for a day. `remainingShiftHours` is measured against destination time, so
 * it is converted to the clock where the traveller is (`localTz`, default the day's zone): on a
 * pre-flight day at home, or a stay-on-home-time day, local time and destination time differ.
 */
export function shiftStatus(day: DayPlan, destTz: string, destName?: string, localTz: string = day.tz): string {
  const mid = Date.parse(`${day.date}T12:00:00Z`);
  const destAhead = (offsetMinutes(mid, destTz) - offsetMinutes(mid, localTz)) / 60;
  // + = body clock behind local time. Wrapped to [−12, 12): a delay plan for a trip 10h+ east
  // starts ~24h "ahead" of local time, which is the same clock as in step.
  const vsLocal = wrap12(day.remainingShiftHours - destAhead);
  const local = half(vsLocal);
  const head =
    local < 0.5
      ? 'Body clock: in step with local time'
      : `Body clock: ~${local}h ${vsLocal > 0 ? 'behind' : 'ahead of'} local time`;
  if (localTz === destTz || Math.abs(destAhead) < 0.25) return head;
  const dest = half(day.remainingShiftHours);
  const where = destName ? `${destName} time` : 'destination time';
  if (dest < 0.5) return `${head}, in step with ${where}`;
  return `${head}, ~${dest}h ${day.remainingShiftHours > 0 ? 'behind' : 'ahead of'} ${where}`;
}

const LANES: { key: string; label: string; kinds: AdviceKind[] }[] = [
  { key: 'sleep', label: 'Sleep', kinds: ['sleep', 'nap'] },
  { key: 'light', label: 'Light', kinds: ['seek_light', 'avoid_light'] },
  { key: 'caffeine', label: 'Caffeine', kinds: ['caffeine_ok', 'avoid_caffeine'] },
  { key: 'melatonin', label: 'Melatonin', kinds: ['melatonin'] },
];

/** The red "now" line on a lane. Subscribes to the clock itself, so a tick re-renders only it. */
function NowMarker({ start, end }: { start: number; end: number }) {
  const { c } = usePalette();
  const now = useNowIn(start, end);
  if (now == null) return null;
  return <View style={[s.now, { left: `${((now - start) / (end - start)) * 100}%`, backgroundColor: c.danger }]} />;
}

/**
 * 24-hour strip for one local date on one clock (`strip.tz`). Includes windows from
 * neighbouring days that overlap it (e.g. last night's sleep). `caption` names the date and
 * clock when a day needs more than one strip (travel day: departure date and arrival date).
 * Shows a live "now" marker when now falls inside the strip.
 */
export const DayStrip = memo(function DayStrip({ plan, strip, caption }: { plan: Plan; strip: Strip; caption?: string }) {
  const { c, advice } = usePalette();
  const b = strip;
  const span = b.end - b.start;
  const ws = useMemo(
    () =>
      allWindows(plan).filter((w) => {
        const s = Date.parse(w.startUtc);
        const e = Date.parse(w.endUtc);
        return isPoint(w) ? s >= b.start && s < b.end : e > b.start && s < b.end;
      }),
    [plan, b.start, b.end],
  );
  const lanes = LANES.filter((l) => ws.some((w) => l.kinds.includes(w.kind)));
  if (lanes.length === 0) return null;
  const pct = (ms: number) => `${(Math.min(Math.max(ms - b.start, 0), span) / span) * 100}%` as const;

  return (
    <View
      accessible
      accessibilityLabel={`Timeline for ${formatDateLabel(strip.date)}, ${zoneAbbr(strip.start, strip.tz)}. Details are listed below.`}
      style={{ gap: 6 }}>
      {caption ? (
        <T variant="small" muted>
          {caption}
        </T>
      ) : null}
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
            <NowMarker start={b.start} end={b.end} />
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
});

/**
 * One advice window. Pass `dayDate` (the day's own date) inside a day card: when the window
 * starts on a different local date (travel day across a flight or the date line), the row
 * shows that date so nobody reads a Singapore-morning window as a London-evening one.
 */
export const WindowRow = memo(function WindowRow({
  w,
  active,
  dayDate,
}: {
  w: AdviceWindow;
  active?: boolean;
  dayDate?: string;
}) {
  const { c, advice } = usePalette();
  const time = useMemo(() => {
    const localDate = formatWindowLocal(w).localDate;
    const dateChip = dayDate && localDate !== dayDate ? formatDateLabel(localDate) : null;
    return dateChip ? `${dateChip}, ${formatWindowTime(w)}` : formatWindowTime(w);
  }, [w, dayDate]);
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
});

/** A WindowRow highlighted while now is inside the window; only a flip re-renders it. */
export function LiveWindowRow({ w, dayDate }: { w: AdviceWindow; dayDate?: string }) {
  const active = useNowWithin(Date.parse(w.startUtc), Date.parse(w.endUtc));
  return <WindowRow w={w} active={active} dayDate={dayDate} />;
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

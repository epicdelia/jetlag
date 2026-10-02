import type { Plan, Strategy } from '@jetlag/engine';
import { StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { usePalette } from '@/hooks/use-palette';
import { formatSignedHours } from '@/lib/tz';
import { Banner, Card, T } from './ui';

const STRATEGY: Record<Strategy, { title: string; body: (p: Plan) => string }> = {
  advance: {
    title: 'Shift your body clock earlier',
    body: (p) =>
      `Your destination is ${formatSignedHours(p.zoneDeltaHours)} from home. The plan moves your clock about ${Math.abs(
        Math.round(p.plannedShiftHours * 10) / 10,
      )}h earlier using morning light and darker evenings.`,
  },
  delay: {
    title: 'Shift your body clock later',
    body: (p) =>
      `Your destination is ${formatSignedHours(p.zoneDeltaHours)} from home. The plan moves your clock about ${Math.abs(
        Math.round(p.plannedShiftHours * 10) / 10,
      )}h later using evening light and darker mornings.`,
  },
  stay_on_home_time: {
    title: 'Stay on home time',
    body: (p) =>
      `Your destination is ${formatSignedHours(p.zoneDeltaHours)} from home, but the stay is short, so adapting would likely cost more than it gains. Keep to your home sleep times where you can.`,
  },
  none: {
    title: 'No adjustment needed',
    body: (p) =>
      `The time difference (${formatSignedHours(p.zoneDeltaHours)}) is small enough that most people adjust within a day or so without a plan.`,
  },
};

export function StrategyCard({ plan }: { plan: Plan }) {
  const { c } = usePalette();
  const s = STRATEGY[plan.strategy];
  const adapting = plan.strategy === 'advance' || plan.strategy === 'delay';
  return (
    <Card style={{ gap: Spacing.md }}>
      <T variant="label">Strategy</T>
      <T variant="heading" accessibilityRole="header">
        {s.title}
      </T>
      <T variant="secondary">{s.body(plan)}</T>
      <View style={st.stats}>
        <Stat label="Time difference" value={formatSignedHours(plan.zoneDeltaHours)} />
        {adapting ? (
          <Stat
            label="Planned shift"
            value={`${Math.abs(Math.round(plan.plannedShiftHours * 10) / 10)}h ${plan.plannedShiftHours >= 0 ? 'earlier' : 'later'}`}
          />
        ) : null}
        {adapting ? (
          <Stat
            label="Days to adapt"
            value={plan.estimatedDaysToAdapt > 0 ? `≈ ${plan.estimatedDaysToAdapt}` : '—'}
          />
        ) : null}
      </View>
      {plan.warnings.length > 0 ? (
        <Banner>
          {plan.warnings.map((w, i) => (
            <T key={i} variant="small" style={{ color: c.warningText }}>
              • {w}
            </T>
          ))}
        </Banner>
      ) : null}
      <T variant="small" muted>
        Estimates come from a simple model of lab studies; your actual pace may differ by a day or two.
      </T>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  const { c } = usePalette();
  return (
    <View style={[st.stat, { backgroundColor: c.surfaceAlt }]}>
      <T variant="small" muted>
        {label}
      </T>
      <T variant="subheading">{value}</T>
    </View>
  );
}

const st = StyleSheet.create({
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  stat: { borderRadius: 10, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, minWidth: 110, flexGrow: 1 },
});

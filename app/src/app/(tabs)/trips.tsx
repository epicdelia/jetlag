import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { TripLegs } from '@/components/trip-summary';
import { Button, Card, Pill, Screen, T } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { usePalette } from '@/hooks/use-palette';
import { computePlan, planSpan } from '@/lib/plan';
import { useAppStore } from '@/lib/store';
import { formatSignedHours } from '@/lib/tz';

const STRATEGY_SHORT = {
  advance: 'Shift earlier',
  delay: 'Shift later',
  stay_on_home_time: 'Stay on home time',
  none: 'No adjustment',
} as const;

export default function Trips() {
  const { trips } = useAppStore();
  const { c } = usePalette();
  const now = Date.now();
  const sorted = [...trips].sort(
    (a, b) => Date.parse(a.input.legs[0]?.departUtc ?? '') - Date.parse(b.input.legs[0]?.departUtc ?? ''),
  );

  return (
    <Screen>
      <Button title="New trip" onPress={() => router.push('/trip/new')} />
      {sorted.length === 0 ? (
        <T variant="secondary">No trips yet. Add your flights to get a day-by-day plan.</T>
      ) : null}
      {sorted.map((t) => {
        const r = computePlan(t.input);
        const span = r.ok ? planSpan(r.plan) : null;
        const past = span ? span.end < now : false;
        return (
          <Pressable
            key={t.id}
            accessibilityRole="button"
            accessibilityHint="Opens the plan"
            onPress={() => router.push({ pathname: '/trip/[id]', params: { id: t.id } })}
            style={({ pressed }) => ({ opacity: pressed ? 0.8 : past ? 0.7 : 1 })}>
            <Card>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
                <T variant="heading" style={{ flex: 1 }}>
                  {t.name}
                </T>
                {past ? <Pill text="Past" /> : null}
              </View>
              <TripLegs trip={t} />
              {r.ok ? (
                <T variant="small">
                  {STRATEGY_SHORT[r.plan.strategy]} · {formatSignedHours(r.plan.zoneDeltaHours)}
                  {r.plan.estimatedDaysToAdapt > 0 ? ` · ≈ ${r.plan.estimatedDaysToAdapt} days to adapt` : ''}
                </T>
              ) : (
                <T variant="small" style={{ color: c.danger }}>
                  Plan unavailable: {r.message}
                </T>
              )}
            </Card>
          </Pressable>
        );
      })}
    </Screen>
  );
}

import { View } from 'react-native';

import { Spacing } from '@/constants/theme';
import type { Trip } from '@/lib/types';
import { formatDateTime, zoneAbbr } from '@/lib/tz';
import { T } from './ui';

/** Legs as entered, in each airport's local time. */
export function TripLegs({ trip }: { trip: Trip }) {
  return (
    <View style={{ gap: Spacing.xs }}>
      {trip.input.legs.map((l, i) => {
        const dep = Date.parse(l.departUtc);
        const arr = Date.parse(l.arriveUtc);
        return (
          <T key={i} variant="small" muted>
            {l.from.label ?? l.from.tz} {formatDateTime(dep, l.from.tz)} {zoneAbbr(dep, l.from.tz)} → {l.to.label ?? l.to.tz}{' '}
            {formatDateTime(arr, l.to.tz)} {zoneAbbr(arr, l.to.tz)}
          </T>
        );
      })}
    </View>
  );
}

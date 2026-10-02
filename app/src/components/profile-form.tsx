import type { Chronotype } from '@jetlag/engine';
import { View } from 'react-native';

import { MELATONIN_NOTE } from '@/constants/copy';
import { Spacing } from '@/constants/theme';
import { usePalette } from '@/hooks/use-palette';
import { sleepProfileError } from '@/lib/trip-form';
import type { Profile } from '@/lib/types';
import { hhmmToMinutes, formatDuration } from '@/lib/tz';
import { Banner, Section, Segmented, T, TimeStepper, ToggleRow } from './ui';

export const CHRONOTYPES: { value: Chronotype; label: string; explain: string }[] = [
  {
    value: 'early',
    label: 'Early',
    explain: 'You wake easily in the morning and are sleepy early in the evening.',
  },
  {
    value: 'intermediate',
    label: 'Middle',
    explain: 'Neither strongly a morning nor an evening person; most people are here.',
  },
  {
    value: 'late',
    label: 'Late',
    explain: 'Left to yourself, you would stay up late and sleep in.',
  },
];

export function ProfileForm({ value, onChange }: { value: Profile; onChange: (p: Profile) => void }) {
  const { c } = usePalette();
  const { sleep, prefs } = value;
  const setSleep = (patch: Partial<Profile['sleep']>) => onChange({ ...value, sleep: { ...sleep, ...patch } });
  const setPrefs = (patch: Partial<Profile['prefs']>) => onChange({ ...value, prefs: { ...prefs, ...patch } });

  const bed = hhmmToMinutes(sleep.usualBedtime) ?? 0;
  const wake = hhmmToMinutes(sleep.usualWake) ?? 0;
  const sleepMin = (wake - bed + 1440) % 1440;
  const sleepError = sleepProfileError(sleep);
  const chrono = CHRONOTYPES.find((x) => x.value === sleep.chronotype) ?? CHRONOTYPES[1]!;

  return (
    <View style={{ gap: Spacing.xl }}>
      <Section title="Usual sleep at home" hint="On a normal day without an alarm pushing you, if you can.">
        <TimeStepper label="Bedtime" value={sleep.usualBedtime} onChange={(v) => setSleep({ usualBedtime: v })} />
        <TimeStepper label="Wake time" value={sleep.usualWake} onChange={(v) => setSleep({ usualWake: v })} />
        <T variant="small" muted>
          That is about {formatDuration(sleepMin)} in bed.
        </T>
        {sleepError ? (
          <Banner>
            <T variant="small" style={{ color: c.warningText }} accessibilityLiveRegion="polite">
              {sleepError}
            </T>
          </Banner>
        ) : sleepMin < 5 * 60 ? (
          <Banner tone="info">Double-check these times: the gap between bedtime and wake looks short.</Banner>
        ) : null}
      </Section>

      <Section title="Chronotype">
        <Segmented
          accessibilityLabel="Chronotype"
          options={CHRONOTYPES.map((x) => ({ value: x.value, label: x.label }))}
          value={sleep.chronotype}
          onChange={(v) => setSleep({ chronotype: v })}
        />
        <T variant="small" muted>
          {chrono.explain}
        </T>
      </Section>

      <Section title="What the plan may include">
        <View>
          <ToggleRow
            label="Caffeine timing"
            description="When coffee or tea can help you stay alert, and when to stop so it doesn't disturb sleep."
            value={prefs.useCaffeine}
            onChange={(v) => setPrefs({ useCaffeine: v })}
          />
          <ToggleRow
            label="Start adjusting before you fly"
            description="Shift sleep and light a little each day before departure so there is less to do on arrival."
            value={prefs.preAdapt}
            onChange={(v) => setPrefs({ preAdapt: v })}>
            {prefs.preAdapt ? (
              <Segmented
                accessibilityLabel="Days to adjust before departure"
                options={[
                  { value: '1', label: '1 day' },
                  { value: '2', label: '2 days' },
                  { value: '3', label: '3 days' },
                ]}
                value={String(prefs.maxPreDays ?? 3) as '1' | '2' | '3'}
                onChange={(v) => setPrefs({ maxPreDays: Number(v) })}
              />
            ) : null}
          </ToggleRow>
          <ToggleRow
            label="Melatonin timing (optional)"
            description="Off by default. Adds when a low dose (0.5 mg) is commonly taken to help shift your clock."
            value={prefs.useMelatonin}
            onChange={(v) => setPrefs({ useMelatonin: v })}>
            {prefs.useMelatonin ? (
              <Banner>
                <T variant="small" style={{ color: c.warningText }}>
                  {MELATONIN_NOTE}
                </T>
              </Banner>
            ) : null}
          </ToggleRow>
        </View>
      </Section>
    </View>
  );
}

import { View } from 'react-native';

import { MELATONIN_NOTE } from '@/constants/copy';
import { Banner, Card, Screen, Section, T } from '@/components/ui';
import { Spacing } from '@/constants/theme';

function P({ children }: { children: string }) {
  return <T variant="secondary">{children}</T>;
}

function Bullet({ children }: { children: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
      <T variant="secondary">•</T>
      <T variant="secondary" style={{ flex: 1 }}>
        {children}
      </T>
    </View>
  );
}

export default function About() {
  return (
    <Screen>
      <Banner>
        <T variant="subheading">Not medical advice</T>
        <T variant="small">
          Shift gives general, behavioural guidance about light, sleep timing and caffeine for healthy adults. It does
          not diagnose, treat or prevent any condition. If you have a sleep disorder, a medical condition, are pregnant,
          or take medication that affects sleep or alertness, talk to a clinician before changing your routine.
        </T>
      </Banner>

      <Card>
        <Section title="How it works">
          <P>
            Your body clock runs on its own schedule and is reset mainly by light. Light shortly after the lowest point
            of your body temperature (a few hours before your usual wake time) moves the clock earlier; light in the
            hours before that point moves it later. Shift estimates that point from your usual sleep times and
            chronotype, then schedules when to seek and avoid bright light, when to sleep, and when caffeine helps or
            gets in the way.
          </P>
          <P>
            Flying east usually means shifting earlier, which is harder; flying west means shifting later. For very
            large eastward trips it can be quicker to shift the long way round. People typically adapt at roughly 1 hour
            per day after eastward flights and about 1.5 hours per day after westward flights; the plan assumes that
            pace, not faster.
          </P>
        </Section>
      </Card>

      <Card>
        <Section title="What the advice is based on">
          <Bullet>Human light phase-response curves (Khalsa et al. 2003; St Hilaire et al. 2012; Minors et al. 1991).</Bullet>
          <Bullet>Sensitivity to ordinary room light at night (Zeitzer et al. 2000).</Bullet>
          <Bullet>
            Pre-flight advancing with morning light and earlier sleep (Burgess et al. 2003; Eastman et al. 2005; Revell
            et al. 2006).
          </Bullet>
          <Bullet>Caffeine and sleep (Drake et al. 2013; Gardiner et al. 2023 meta-analysis).</Bullet>
          <Bullet>Short naps after sleep loss (Brooks & Lack 2006).</Bullet>
          <Bullet>
            Melatonin timing (Burgess et al. 2010; Cochrane review, Herxheimer & Petrie 2002), only if you turn it on.
          </Bullet>
          <Bullet>Clinical reviews of jet lag (Sack 2010; Waterhouse et al. 2007; AASM review, Sack et al. 2007).</Bullet>
        </Section>
      </Card>

      <Card>
        <Section title="Limitations">
          <Bullet>
            Not clinically validated. The model is a simple rule-based estimate built from lab studies of mostly young,
            healthy adults. Older adults, shift workers and people with sleep disorders may respond differently.
          </Bullet>
          <Bullet>
            Your body-clock timing is inferred from self-reported sleep, so it can be off by 1–2 hours. The plan leaves
            safety margins, but light at the wrong time can still push your clock the wrong way.
          </Bullet>
          <Bullet>
            It doesn't know how much light you actually get. Outdoor daylight is far brighter than indoor light; when a
            plan says seek light, go outside if you can. When it says avoid light, dim the lights and wear sunglasses
            outdoors.
          </Bullet>
          <Bullet>
            Adaptation speeds are typical averages. Your pace may differ, and sleep loss, stress, meals and exercise are
            not modelled.
          </Bullet>
          <Bullet>
            Several thresholds (when to stay on home time, when to shift the long way round, caffeine and nap buffers)
            are conservative design choices where the evidence doesn't give an exact number.
          </Bullet>
          <Bullet>
            Return trips start from an estimate of where your body clock is when you fly home, assuming you followed
            the outbound plan. Chained trips (one destination after another), polar daylight and very long multi-stop
            itineraries are not modelled yet.
          </Bullet>
          <Bullet>
            Safety first: never drive, operate machinery or make critical decisions while drowsy because a plan says to
            stay awake.
          </Bullet>
        </Section>
      </Card>

      <Card>
        <Section title="About melatonin">
          <P>
            Melatonin advice is off unless you turn it on. When enabled, the plan suggests a low dose (0.5 mg) at times
            when it is commonly used to help shift the clock earlier. It is not suggested for shifting later, because
            the evidence there is weaker.
          </P>
          <P>{MELATONIN_NOTE}</P>
        </Section>
      </Card>

      <Card>
        <Section title="Your data">
          <P>
            Your sleep profile and trips are stored only on this device. Reminders are local notifications scheduled on
            this device. Nothing is uploaded.
          </P>
        </Section>
      </Card>
    </Screen>
  );
}

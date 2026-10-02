# SCIENCE.md — Circadian model specification (v0)

Status: specification for `engine/` to implement `buildPlan(input: TripInput): Plan` (see `engine/src/types.ts`).
The only contract change is one optional, backward-compatible input field, `TripInput.startingBodyClockOffsetHours` (§8.1).

Audience: the engine engineer (implement §11–§12 directly) and anyone reviewing the product's claims.

Ground rules this spec follows:

- Every numeric parameter is either (a) taken from a cited, verified study, or (b) explicitly labelled **DESIGN CHOICE** with the reasoning. Where evidence is thin we pick the conservative value.
- No medical claims. Advice is behavioural (light, dark, sleep timing, caffeine, naps). Melatonin is opt-in, 0.5 mg, framed as "commonly used". The app (not each rationale) carries a "talk to a clinician before using melatonin, especially if you are pregnant, take other medication, or have a medical condition" note.
- The model is a simple rule-based phase tracker, not a validated oscillator model. See §14 Limitations.

---

## 0. Citation verification

All references below were checked by web search on 2026-10-02 (authors, year, journal, and where available volume and pages). Full-text hosts (PMC, CDC, publisher PDFs) were blocked by the sandbox proxy, so numbers marked † come from abstracts or secondary summaries rather than the full text. Before shipping, a human should re-check † items against the PDFs.

| Key | Reference | Verified |
|---|---|---|
| Khalsa2003 | Khalsa SBS, Jewett ME, Cajochen C, Czeisler CA. A phase response curve to single bright light pulses in human subjects. *J Physiol* 2003;549(3):945–952. PMID 12717008 | yes (abstract) |
| StHilaire2012 | St Hilaire MA, Gooley JJ, Khalsa SBS, Kronauer RE, Czeisler CA, Lockley SW. Human phase response curve to a 1 h pulse of bright white light. *J Physiol* 2012;590(13):3035–3045. PMC3406389 | yes (abstract) |
| Minors1991 | Minors DS, Waterhouse JM, Wirz-Justice A. A human phase-response curve to light. *Neurosci Lett* 1991;133(1):36–40. | yes (citation) |
| Zeitzer2000 | Zeitzer JM, Dijk DJ, Kronauer RE, Brown EN, Czeisler CA. Sensitivity of the human circadian pacemaker to nocturnal light: melatonin phase resetting and suppression. *J Physiol* 2000;526(3):695–702. PMC2270041 | yes (abstract)† |
| Baehr2000 | Baehr EK, Revelle W, Eastman CI. Individual differences in the phase and amplitude of the human circadian temperature rhythm: with an emphasis on morningness–eveningness. *J Sleep Res* 2000;9(2):117–127. | yes (abstract)† |
| Duffy1999 | Duffy JF, Dijk DJ, Hall EF, Czeisler CA. Relationship of endogenous circadian melatonin and temperature rhythms to self-reported preference for morning or evening activity in young and older people. *J Investig Med* 1999;47(3):141–150. PMC8530273 | yes (abstract) |
| BurgessEastman2005 | Burgess HJ, Eastman CI. The dim light melatonin onset following fixed and free sleep schedules. *J Sleep Res* 2005;14(3):229–237. | yes (citation); "DLMO ≈ 2 h before bedtime"† |
| Benloucif2005 | Benloucif S, Guico MJ, Reid KJ, Wolfe LF, L'Hermite-Balériaux M, Zee PC. Stability of melatonin and temperature as circadian phase markers and their relation to sleep times in humans. *J Biol Rhythms* 2005;20(2):178–188. | yes (citation) |
| Burgess2003 | Burgess HJ, Crowley SJ, Gazda CJ, Fogg LF, Eastman CI. Preflight adjustment to eastward travel: 3 days of advancing sleep with and without morning bright light. *J Biol Rhythms* 2003;18(4):318–328. PMID 12932084 | yes (abstract) |
| Eastman2005 | Eastman CI, Gazda CJ, Burgess HJ, Crowley SJ, Fogg LF. Advancing circadian rhythms before eastward flight: a strategy to prevent or reduce jet lag. *Sleep* 2005;28(1):33–44. PMC1249488 | yes (abstract) |
| Revell2006 | Revell VL, Burgess HJ, Gazda CJ, Smith MR, Fogg LF, Eastman CI. Advancing human circadian rhythms with afternoon melatonin and morning intermittent bright light. *J Clin Endocrinol Metab* 2006;91(1):54–59. PMID 16263827 | yes (abstract) |
| EastmanBurgess2009 | Eastman CI, Burgess HJ. How to travel the world without jet lag. *Sleep Med Clin* 2009;4(2):241–255. PMC2829880 | yes (citation; full text not readable here) |
| Burgess2008 | Burgess HJ, Revell VL, Eastman CI. A three pulse phase response curve to three milligrams of melatonin in humans. *J Physiol* 2008;586(2):639–647. PMC2375693 | yes (citation) |
| Burgess2010 | Burgess HJ, Revell VL, Molina TA, Eastman CI. Human phase response curves to three days of daily melatonin: 0.5 mg versus 3.0 mg. *J Clin Endocrinol Metab* 2010;95(7):3325–3331. PMC2928909 | yes (abstract) |
| Lewy1998 | Lewy AJ, Bauer VK, Ahmed S, et al. The human phase response curve (PRC) to melatonin is about 12 hours out of phase with the PRC to light. *Chronobiol Int* 1998;15(1):71–83. | yes (citation) |
| Herxheimer2002 | Herxheimer A, Petrie KJ. Melatonin for the prevention and treatment of jet lag. *Cochrane Database Syst Rev* 2002;(2):CD001520. | yes (abstract) |
| Sack2007 | Sack RL, Auckley D, Auger RR, et al. Circadian rhythm sleep disorders: part I, basic principles, shift work and jet lag disorders. An American Academy of Sleep Medicine review. *Sleep* 2007;30(11):1460–1483. | yes (citation) |
| Sack2010 | Sack RL. Clinical practice. Jet lag. *N Engl J Med* 2010;362(5):440–447. | yes (citation) |
| Waterhouse2007 | Waterhouse J, Reilly T, Atkinson G, Edwards B. Jet lag: trends and coping strategies. *Lancet* 2007;369(9567):1117–1129. | yes (citation) |
| CDCYellowBook | CDC Yellow Book, "Jet Lag Disorder" (Travel by Air & Sea chapter). cdc.gov/yellow-book/hcp/travel-air-sea/jet-lag-disorder.html | yes (search snippet)† |
| Aschoff1975 | Aschoff J, Hoffmann K, Pohl H, Wever R. Re-entrainment of circadian rhythms after phase-shifts of the Zeitgeber. *Chronobiologia* 1975;2(1):23–78. | yes (citation) |
| DaanLewy1984 | Daan S, Lewy AJ. Scheduled exposure to daylight: a potential strategy to reduce "jet lag" following transmeridian flight. *Psychopharmacol Bull* 1984;20(3):566–568. | yes (citation) |
| Takahashi2002 | Takahashi T, Sasaki M, Itoh H, et al. Melatonin alleviates jet lag symptoms caused by an 11-hour eastward flight. *Psychiatry Clin Neurosci* 2002;56(3):301–302. | yes (citation; volume and pages re-checked by web search 2026-10-02) |
| DiekmanBose2018 | Diekman CO, Bose A. Reentrainment of the circadian pacemaker during jet lag: East-west asymmetry and the effects of north-south travel. *J Theor Biol* 2018;437:261–285. | yes (citation) |
| Dean2009 | Dean DA, Forger DB, Klerman EB. Taking the lag out of jet lag through model-based schedule design. *PLoS Comput Biol* 2009;5(6):e1000418. | yes |
| Drake2013 | Drake C, Roehrs T, Shambroom J, Roth T. Caffeine effects on sleep taken 0, 3, or 6 hours before going to bed. *J Clin Sleep Med* 2013;9(11):1195–1200. PMC3805807 | yes (abstract) |
| Gardiner2023 | Gardiner C, Weakley J, Burke LM, Roach GD, Sargent C, Maniar N, Townshend A, Halson SL. The effect of caffeine on subsequent sleep: a systematic review and meta-analysis. *Sleep Med Rev* 2023;69:101764. | yes (abstract; volume, article number, 24 studies and ~45 min re-checked 2026-10-02) |
| Burke2015 | Burke TM, Markwald RR, McHill AW, Chinoy ED, Snider JA, Bessman SC, Jung CM, O'Neill JS, Wright KP Jr. Effects of caffeine on the human circadian clock in vivo and in vitro. *Sci Transl Med* 2015;7(305):305ra146. | yes |
| BrooksLack2006 | Brooks A, Lack L. A brief afternoon nap following nocturnal sleep restriction: which nap duration is most recuperative? *Sleep* 2006;29(6):831–840. | yes (abstract) |
| Rosekind1995 | Rosekind MR, Smith RM, Miller DL, et al. Alertness management: strategic naps in operational settings. *J Sleep Res* 1995;4(S2):62–66. | yes (citation) |

Some figures are widely quoted but I did **not** independently verify the primary paper, so this spec does not cite them as primary: DLMO→Tmin ≈ 7 h (usually attributed to Brown et al. 1997, Cagnacci et al. 1996 and Sharkey & Eastman 2002), and the "Tmin ≈ 3 h before wake" rule of thumb (usually attributed to Eastman & Burgess). Below they are labelled as a "widely used approximation".

---

## 1. Phase marker: estimating Tmin and DLMO from habitual sleep

The engine tracks one phase marker, **Tmin**: the core body temperature minimum. Every light, melatonin and timing rule is expressed relative to Tmin. **DLMO** (dim-light melatonin onset) is derived from Tmin.

Evidence:

- In young adults, Tmin falls at about 04:00 in morning types and about 06:00 in evening types. That is roughly the middle to second half of an 8 h sleep, and closer to wake in evening types (Baehr2000†). Tmin was about 0.5 h later in men than in women (Baehr2000). Sex is not an input; we ignore this.
- Morning types have a **longer** interval between circadian phase and habitual wake than evening types (Duffy1999).
- DLMO occurs about 2 h before habitual bedtime in people on their usual schedule (BurgessEastman2005†). DLMO occurs about 7 h before Tmin (widely used approximation; see §0). With an 8 h sleep, both approximations agree: DLMO = bed − 2 h, Tmin = DLMO + 7 h = bed + 5 h = wake − 3 h.
- Benloucif2005 found both markers stable within a person. Either one can anchor phase.

Model (all times are clock hours in the origin time zone; arithmetic is mod 24 unless stated):

```
D          = (W − B) mod 24                         // habitual sleep duration, hours
offset     = TMIN_BEFORE_WAKE[chronotype]           // early 3.5, intermediate 3.0, late 2.5
offset     = clamp(offset, 1.5, D / 2)              // keep Tmin between mid-sleep and 1.5 h before wake
TminClock  = W − offset
DLMOClock  = TminClock − DLMO_TO_TMIN               // 7 h
```

The ±0.5 h chronotype adjustment is a **DESIGN CHOICE**. Its direction comes from Duffy1999 and Baehr2000; the magnitude is our conservative reading. Chronotype mostly changes the clock times B and W, which the user already reports; the adjustment only nudges where Tmin sits inside the sleep period.

Expected error: the uncertainty in a Tmin estimated from sleep times is plausibly ±1–2 h per person. Every light window below therefore keeps a **1 h safety margin** away from Tmin (§2).

---

## 2. Light phase response curve (PRC)

Evidence:

- Light PRCs in humans are type 1. Light centred **before** Tmin causes phase **delays**, light centred **after** Tmin causes **advances**, and the crossover is at about Tmin (Khalsa2003: 6.7 h of ~10,000 lux, peak-to-trough amplitude 5.02 h; Minors1991; StHilaire2012). Khalsa2003 found no long "dead zone" during the subjective day, but shifts there are small.
- Duration response is non-linear. A 1 h pulse of ~8,000 lux produced a fitted peak-to-trough PRC of 2.20 h. That is a large share of the 6.7 h pulse's effect from about 15% of the duration (StHilaire2012). One to two hours of bright light inside the right window is worthwhile; four hours is not required.
- Ordinary room light matters at night. About 100 lux gives roughly half the phase-resetting effect of light ten times brighter (Zeitzer2000). "Avoid light" therefore means dim indoor light plus dark sunglasses outdoors. Ordinary indoor light is not enough.
- Field protocols that achieved advances used intermittent ~5,000 lux light on waking (Burgess2003, Eastman2005, Revell2006).

Windows used by the engine (h relative to the current Tmin estimate `t`; half-open intervals):

| Goal | seek_light | avoid_light |
|---|---|---|
| Advance | `[t + 1, t + 5)` | `[t − 5, t + 1)` |
| Delay | latest 4 h of waking time in `[t − 8, t − 1)` (= `[t − 5, t − 1)` when awake then) | `[t − 1, t + 4)` |

Rationale for the boundaries (**DESIGN CHOICE**, informed by the PRCs above):

- The 1 h margin around `t` lies on the **avoid** side in both directions. If Tmin is mis-estimated, light that falls on the wrong side of the crossover pushes the clock the wrong way (§4). Giving up some shift is cheaper than causing a wrong-way shift.
- Seek windows are 4 h long, and the rationale says "as much bright light as you can, ideally 1–2 h or more outdoors". This follows StHilaire2012.
- The 5 h avoid window before Tmin for advances covers the late-evening and early-night high-sensitivity delay region (Khalsa2003, Zeitzer2000).
- The 4 h avoid window after Tmin for delays covers the early-morning advance region.
- Delay seek light reaches back up to 8 h before Tmin (review fix). With a habitual bedtime about 5 h before Tmin, and pre-flight bedtimes moving later faster than the clock, `[t − 5, t − 1)` falls almost entirely inside planned sleep. The evening before bedtime is still in the light-PRC delay region (Khalsa2003 measured delays for light centred many hours before Tmin), so the engine keeps the **latest 4 h of waking time** in `[t − 8, t − 1)`.
- Which event a window serves: for an advance, morning light after Tmin_i drives the step from event i. For a delay, evening light before Tmin_i drives the step that lands at event i, so delay windows are emitted while the *previous* event was still above tolerance.
- Wording (review fix; a plain clock check, no solar model and no latitude). Every 15 minutes of the window is checked on the local clock where the traveller is:
  - Only a seek-light window that lies entirely inside **08:00–16:30** (`DAYLIGHT_CORE_HOURS`, daylight even in winter at mid latitudes) says "ideally daylight".
  - A window entirely outside **06:30–19:30** (`DAYLIGHT_HOURS`) is treated as dark. Seek light then says "bright indoor light or a light box", or on a plane "use the reading light or a bright screen" (no "open the window shade"). Avoid light then says "keep the lights dim and screens low", with no "wear sunglasses outside".
  - Anything in between says "get daylight while it's light out, otherwise bright indoor light or a light box".

Windows are clipped to waking time (sleep is already dark), and pieces shorter than 30 min are dropped.

---

## 3. Achievable shift rates

Evidence:

- **Untreated travellers:** the clock re-entrains at about 1.5 h/day after westward flights and about 1 h/day after eastward flights. Earlier estimates from travellers were ~92 min/day delays and ~57 min/day advances (CDCYellowBook†). The direction asymmetry is classic (Aschoff1975), and the usual explanation is an intrinsic period slightly longer than 24 h (CDCYellowBook; DiekmanBose2018).
- **Pre-flight advancing, lab-quality protocol, sleep moved 1 h earlier per day for 3 days:** DLMO advanced 0.6 h with dim light, 1.5 h with intermittent bright morning light and 2.1 h with continuous bright morning light (Burgess2003). That is about 0.2, 0.5 and 0.7 h/day.
- Adding afternoon melatonin to morning intermittent light gave 2.5 h (0.5 mg) and 2.6 h (3 mg) over 3 days, against 1.7 h with placebo (Revell2006), or about 0.8 h/day. 0.5 mg worked as well as 3 mg.
- Moving the sleep schedule **2 h/day** was not better than 1 h/day. The schedule outran the clock and subjects had trouble falling asleep (Eastman2005; 2 h/day group median ~1.9 h†).

Rates used (h/day, applied once per Tmin cycle):

| Phase | Advance | Delay | Basis |
|---|---|---|---|
| Pre-flight (at home, real-world adherence) | 0.5 (0.75 with melatonin) | 0.75 | Burgess2003 intermittent-light arm; Revell2006 for melatonin, discounted for home adherence. The delay value is a **DESIGN CHOICE / weak evidence**: no verified pre-flight delay trial, so it is extrapolated from "delays are easier". |
| After departure | 1.0 (1.25 with melatonin) | 1.5 | Traveller data (~57 and ~92 min/day). Following our light advice is assumed to *at least* match untreated rates; we do not claim more. The melatonin uplift is a **DESIGN CHOICE**: Revell2006 gives a ratio of about 1.47×, which we discount to 1.25×. |

We deliberately **do not** use the faster rates (2–3 h/day) that model-optimised light schedules report in silico (Dean2009). Those assume ideal light delivery and a validated oscillator model.

---

## 4. Antidromic re-entrainment (east trips of many hours)

Evidence:

- After large shifts the clock sometimes re-entrains "the long way round". It delays after eastward travel or advances after westward travel (Aschoff1975, where it appears as "partition" and directional effects; DaanLewy1984 proposed scheduled daylight to steer direction; DiekmanBose2018 models when it happens).
- After a large eastward flight, destination **morning** light falls *before* the traveller's still-home-based Tmin. That light delays the clock and fights the intended advance (DaanLewy1984; EastmanBurgess2009). A small pre-flight advance reduces this risk because it moves Tmin earlier, so more post-flight light lands in the advance zone (Eastman2005).
- Takahashi2002 studied an 11 h eastward trip (melatonin; we cite it only as an example of the >10 h east case).

Rule (**DESIGN CHOICE** derived from the §3 rates):

- With an advance rate of 1.0 h/day and a delay rate of 1.5 h/day, advancing `Δ` hours takes `Δ/1.0` days and delaying `24 − Δ` hours takes `(24 − Δ)/1.5` days. The two are equal at **Δ = 9.6 h**.
- **Threshold: an eastward zone delta of ≥ 10 h uses the delay strategy.** Use the post-flight rate *without* the melatonin uplift. Strategy must not depend on the melatonin preference, so that toggling a preference does not flip the plan's direction.
- **Risk band 8 ≤ Δ < 10 h east:** keep the advance, add the warning "large eastward shift: avoiding morning light in the first days matters", and rely on the Tmin-relative windows. These automatically put "avoid light" on the destination morning and "seek light" in the early afternoon in the first days.
- Westward trips are always delays (|Δ| < 12 by normalisation).

Evidence strength: **moderate for the phenomenon, weak for the exact threshold.** Published guidance quotes thresholds of roughly 8–12 h; we did not verify a specific empirical cut-off.

---

## 5. Melatonin (opt-in, `prefs.useMelatonin`)

Evidence:

- The melatonin PRC is roughly 12 h out of phase with the light PRC. Afternoon or evening melatonin advances the clock; morning melatonin delays it (Lewy1998, Burgess2008).
- For **0.5 mg**, maximum advances came when it was taken 2–4 h before DLMO, which is 9–11 h before sleep midpoint. Maximum delays came soon after wake time; the fitted magnitude and timing (~1.3 h over 3 days, ~13.6 h after DLMO) could not be verified from the abstract†. The delay portion was "not as distinct" (Burgess2010). Optimal timing is later for 0.5 mg than for 3 mg (Burgess2010).
- 0.5 mg added as much pre-flight advance as 3 mg (Revell2006).
- Cochrane: 0.5–5 mg at target bedtime at the destination for 2–5 days reduced jet lag, particularly for ≥5 time zones eastward. Taking it earlier in the day "might make jet lag worse" if mistimed (Herxheimer2002). The AASM review recommends melatonin for jet lag (Sack2007).

Engine rules:

- **Advance only.** Each Tmin event `t` with `|remaining| > ADAPTED_TOL` that is pre-adapting or post-departure gets a point window (`startUtc == endUtc`), 0.5 mg:
  1. `dlmo = t − 7h`; candidate time = `dlmo − 3h` (the middle of Burgess2010's 2–4 h).
  2. If the candidate is awake time (not strictly inside a sleep window), use it.
  3. Otherwise, if the start of the next planned sleep falls within `[dlmo − 6h, dlmo − 0.5h]`, dose at that bedtime. This is the Cochrane timing, kept only while it is still on the advance side.
  4. Otherwise, skip melatonin that day.
  - Limit post-departure doses to 5 (Herxheimer2002, 2–5 days). Pre-flight doses follow Revell2006.
- **Delay strategy: no melatonin windows.** Evidence for morning melatonin delays is weaker, the effect is small (~1.3 h over 3 days), and daytime drowsiness is a safety concern. Push the warning: "Melatonin isn't scheduled for this trip because evidence for using it to shift your clock later is limited."
- Rationale wording: "A low dose (0.5 mg) of melatonin at this time is commonly used to help shift the body clock earlier; it can make some people drowsy." No claims of treatment or efficacy.

Evidence strength: advance timing is **moderate to strong**. Delay use is **weak** and is not implemented.

---

## 6. Caffeine (`prefs.useCaffeine`, default true)

Evidence:

- 400 mg caffeine taken 0, 3 **or 6 h** before bedtime all disrupted sleep. At 6 h before bed, objectively measured total sleep was reduced by more than 1 h, and subjects did not notice (Drake2013).
- Meta-analysis of 24 studies: caffeine cut total sleep by about 45 min. To avoid lost sleep, a typical coffee (107 mg) should be taken ≥ 8.8 h before bed (Gardiner2023).
- Evening caffeine (a double-espresso equivalent 3 h before bed) delayed the melatonin rhythm by about 40 min (Burke2015; n = 5). This is a reason to avoid evening caffeine when advancing. It is **not** strong enough to recommend caffeine as a delay tool.
- Caffeine is a standard countermeasure for jet-lag sleepiness (Sack2010, Waterhouse2007).

Engine rules:

- `avoid_caffeine` = `[sleepStart − CAFFEINE_CUTOFF_H, sleepStart)` for each planned sleep (main and in-flight), clipped to waking time. `CAFFEINE_CUTOFF_H = 8`. This is a **DESIGN CHOICE**: Gardiner2023 rounded down; Drake2013 shows 6 h is not enough at higher doses.
- `caffeine_ok` = waking time from the end of one sleep to `nextSleepStart − 8h`, when that is ≥ 1 h. Emit only on day 0, on the **arrival day**, and on later days where `|remaining| ≥ 2`. The arrival day is the first day with at least `NAP_AFTER_ARRIVAL_H` of it left after landing: usually day 0, but day 1 after a date-line arrival two dates after departure (review fix: the arrival day after a red-eye was losing both its nap and its caffeine window). Rationale: "If you need it, caffeine now can help with daytime sleepiness without disturbing tonight's sleep."
- Never emit `caffeine_ok` overlapping `avoid_caffeine`.

---

## 7. Naps

Evidence:

- After restricted sleep, a 10 min afternoon nap gave the best overall benefit. 30 min naps produced post-nap impairment (sleep inertia) (BrooksLack2006).
- On transpacific flights, planned cockpit naps averaging ~26 min improved performance and alertness (Rosekind1995).

Engine rules:

- At most one `nap` window per day, 20 min long (`NAP_MIN = 20`), rationale "keep it short (10–20 min)". Exception: a multi-leg travel day can have one in-flight nap per leg (§7.1).
- Emit only on day 0 and the arrival day (after landing; see §6 for the arrival day) and on later days where `|remaining| ≥ 3`.
- Allowed region: waking time ∩ `[prevWake + 2h, nextSleepStart − NAP_BEFORE_BED_H)`, with `NAP_BEFORE_BED_H = 6`. **DESIGN CHOICE**: we found no verified study for an exact buffer; 6 h protects evening sleep pressure.
- Never place a nap inside a `seek_light` window, and never in the body-clock night or the first `NAP_AFTER_TMIN_H = 2` h after Tmin, i.e. outside `[t − (D − TminBeforeWake), t + 2h)` for every Tmin estimate `t`. Sleep inertia is worst near Tmin, and a short nap is hardest to keep short then (review fix: advance trips were getting a "07:30 nap" two hours after waking, just before Tmin). **DESIGN CHOICE.**
- Within the region, choose the slot closest to the body-clock early afternoon (`t + 10h`, the same anchor as §7.1). No slot → no nap. (v0 preferred the earliest slot inside `avoid_light`; that is what put naps next to Tmin.)
- At most one nap per day counts the in-flight nap below: a day that has one gets no ground nap.

### 7.1 In-flight nap on a long travel day

Evidence and rationale:

- On long-haul flights, a planned **40-min rest opportunity** (average ~26 min of sleep) improved pilots' subsequent performance and physiological alertness compared with no nap (Rosekind1995, NASA cockpit-nap study). This is the closest operational evidence for a deliberate in-flight nap and sets our default length.
- Naps of about 30 min and more carry sleep inertia on waking, and the shortest naps were the best overall after restricted sleep (BrooksLack2006). So the default stays at a 40-min *opportunity* (the traveller will usually sleep less), and the wording says to set an alarm.
- After a very long wake, the trade-off shifts: sleep pressure is high and a short nap restores little. A nap of about one NREM–REM cycle (~90 min, widely used approximation; not primary-verified here) lets the traveller wake near the end of a cycle rather than from deep sleep. **DESIGN CHOICE.**
- Timing: the body-clock early afternoon (Tmin + 10 h, ≈ 14:00 for a 04:00 Tmin) is the habitual post-lunch dip, when a nap comes easily, and it is far from the body-clock evening, so it costs the least of the next night's sleep pressure. **DESIGN CHOICE.**

Engine rule (extension of §11 step 10):

- For each leg: `awake = nextSleepStart − prevSleepEnd`, where `prevSleepEnd` is the last sleep that ends before landing (an in-flight sleep early on this leg counts) and `nextSleepStart` is the first sleep after landing; any sleep kind. Skip the leg when a sleep starts between `prevSleepEnd` and landing.
- If `awake ≥ INFLIGHT_NAP_AWAKE_H` (18 h, **DESIGN CHOICE**), add one `nap` of `INFLIGHT_NAP_MIN` (40 min); if `awake ≥ INFLIGHT_NAP_LONG_AWAKE_H` (22 h, **DESIGN CHOICE**), try `INFLIGHT_NAP_LONG_MIN` (90 min) first. If the longer one does not fit, fall back to 40 then 20 min.
- Allowed region: `[dep + 1h, arr − 1h]` (as for in-flight sleep) ∩ `[prevSleepEnd + FLIGHT_SLEEP_AFTER_WAKE_H (4 h), ∞)` (not in the first 4 h after waking, including waking from an in-flight sleep) ∩ `(−∞, nextSleepStart − CAFFEINE_CUTOFF_H (8 h)]` (not in the run-up to the next sleep, the same span in which caffeine is avoided to protect that sleep) ∩ awake − `seek_light`.
- Within the region, choose the slot whose centre is closest to a body-clock early afternoon (`t + 10h` for any Tmin event `t`), on the 5-min output grid. No slot → no nap.
- Rationale: "It's a long time awake today; a nap of up to 40 min on the plane now (set an alarm) helps you stay alert and still sleep tonight." / for 90 min: "…about one sleep cycle…, and waking after a full cycle limits grogginess."
- Regression: SFO → NRT 2026-11-12 19:00Z → 2026-11-13 06:30Z (default profile) gets no in-flight sleep and ~21 h awake → a 40-min nap at 23:10–23:50Z (15:10 Pacific, 08:10 Tokyo; ≈ 13:40–14:20 on the body clock, whose Tmin is now 05:30 Pacific after 1.5 h of pre-flight delay).

---

## 8. Short stays: stay on home time

Evidence: for short trips where adaptation would be limited, keeping home-based sleep hours is a standard option (CDCYellowBook†, Sack2010, Waterhouse2007). We found no verified exact day threshold.

Rule (**DESIGN CHOICE**):

- If `stayDays` is given and `stayDays ≤ 2` and `|Δ| ≥ 3`, use `stay_on_home_time`.
- If `stayDays ≤ 4` and the estimated days to adapt > `stayDays`, adapt anyway, but warn: "Short stay: you may only partly adapt before you return."

### 8.1 Return trips (`buildReturnInput`)

`buildReturnInput(outbound, returnLegs)` builds the return `TripInput`. It carries `sleep` and `prefs` unchanged and drops `stayDays`. The starting phase goes in the optional input field `startingBodyClockOffsetHours` (hours the body clock is **ahead** of the trip origin's local time; negative = behind; default 0; range ±12).

How `buildPlan` uses the offset `o`: the body clock reaches Tmin `o` hours earlier on the origin clock (`t0 = local(origin, depDate − nPre, TminClock − o)`), and the shift to plan is `normalise(delta − o)` instead of `delta` (same strategy rules, §4, §8). `zoneDeltaHours` still reports the zone difference. For stay on home time, `remainingShiftHours` is that planned shift.

Simplifying assumptions (**DESIGN CHOICE**):

- The usual bed and wake times are read on the return origin's (the outbound destination's) clock: we assume the traveller kept the same wall-clock sleep times there, which is what the outbound plan scheduled.
- The body clock moved exactly as the outbound plan's capped linear catch-up (§10) says. If the return departs before the outbound counted as adapted (i.e. the stay was shorter than the outbound `estimatedDaysToAdapt`), the body clock is **partly shifted**: `o = −remaining` at the return departure (rounded to 0.25 h). Once the outbound reaches `|remaining| ≤ ADAPTED_TOL`, it is taken as **fully adapted** (`o = 0`), since local light and sleep keep it there. The stay length in the outbound input only decides the strategy the traveller followed; the actual return departure decides how far the clock got.
- Stay-on-home-time outbound trips leave the body on the outbound origin's clock (`o = −delta`), so the return usually needs no plan. Outbound trips under 2 h (`none`) are treated as absorbed (`o = 0`).
- **No overlap with the outbound plan (review fix).** The return keeps `prefs.preAdapt`, but `prefs.maxPreDays` is capped by `returnStart(outbound, returnLegs)`:
  - If the outbound plan has not adapted the traveller by the return departure, the outbound plan is still running, so the cap is **0**. The offset `o` is then read at the return plan's first Tmin, on the morning of the departure date (usual wake on the return origin's clock, not later than departure), because that is where the return plan's `t0` sits.
  - Otherwise `o = 0` and the cap is the number of full local days strictly between the later of (outbound arrival, outbound adaptation) and the return departure date, at most `MAX_PRE_DAYS`.
  - Without this, a 3-day stay got 3 return pre-days that began before the outbound flight had even landed, with opposite advice for the same dates, and the starting offset was counted twice.
- The app clips an outbound plan where its return plan starts, so Today, the plan screen and reminders never show both.
- Partial adaptation in reality depends on what light the traveller actually got; we cannot observe that.

---

## 9. Pre-flight adaptation

Evidence: three days of moving sleep 1 h/day in the direction of travel, plus bright morning light, advanced DLMO 1.5–2.1 h, or ~2.5 h with afternoon melatonin (Burgess2003, Revell2006). 2 h/day is too fast (Eastman2005).

Rules:

- Eligible when `prefs.preAdapt` is true, the strategy is advance or delay, and `|planned| ≥ 3`.
- `nPre = min(clamp(maxPreDays ?? 3, 0, 3), ceil(|planned|) − 1)`. The hard cap of 3 matches the evidence base.
- On the night after pre-day `k` (`k = −nPre … −1`), sleep is moved by `s = (k + nPre + 1)` h in the direction of travel (earlier for advance, later for delay), in origin local time.
- Light and melatonin windows come from the simulated Tmin (§10), so morning light lands right after waking during an advance, as in the Eastman protocols.
- **Departure cap (delay only, review fix):** a later bedtime must still leave a full habitual night that ends by `depart − 2h`. If it does not, the night's shift is reduced (to a 15-min step, possibly to 0, i.e. usual bedtime), and that pre-flight event's rate is scaled by the fraction of the 1 h step actually taken. We never tell someone to go to bed later and then cut the night short for an early flight.

---

## 10. Day-to-day Tmin update

The body clock does not observe DST or time zones, so Tmin is iterated in **UTC**:

```
t_{i+1} = t_i + 24h − dir · step_i
step_i  = min(rate(phase_i), |remaining_i|)
remaining_{i+1} = remaining_i − dir · step_i
```

- `dir = +1` for advance and `−1` for delay.
- `phase_i` is `pre` if `t_i < departUtc`, otherwise `post`.
- Pre-flight rates apply only to the first `nPre` events (one per pre-day). Any other pre-departure event gets rate 0, including every one when not pre-adapting.

**Destination DST (review fix).** The target is the habitual Tmin on the destination's *local* clock. If the destination changes its UTC offset after arrival, the target moves with it: `remaining_i = base_i + (offset(dest, t_i) − offset(dest, arrive))`, where `base` is the catch-up against the target as it stood at arrival. Steps only go in the planned direction and stop when `|remaining| ≤ ADAPTED_TOL` against the *current* local target. (Origin DST changes during pre-flight days are not modelled.)

This is a "capped linear catch-up" model: the clock moves by the per-day maximum until it reaches the target. It assumes adherence and ignores sleep loss, light intensity actually received, individual period and age (§14).

---

## 11. ALGORITHM

Notation: `h(x)` means x hours as a duration. All instants are UTC. `local(tz, date, clockHours)` converts a local wall-clock time to UTC via IANA rules. On a DST gap, use the later valid instant. On an overlap, use the first occurrence. `offsetHours(tz, instant)` is the UTC offset in hours at that instant (fractional for half-hour zones).

```
function buildPlan(input):
  // ---------- 0. Validate ----------
  require legs.length ≥ 1                                    else TripInputError
  for each leg: departUtc < arriveUtc; valid IANA tz          else TripInputError
  for i ≥ 1: legs[i].departUtc ≥ legs[i-1].arriveUtc          else TripInputError
  if legs[i].from.tz ≠ legs[i-1].to.tz: warnings += "Leg airports don't connect; using the final destination." (do not throw)
  B, W = parseHHmm(sleep.usualBedtime), parseHHmm(sleep.usualWake)   else TripInputError
  D = (W − B) mod 24;  require 4 ≤ D ≤ 12                     else TripInputError
  if stayDays defined: require stayDays > 0                  else TripInputError

  origin = legs[0].from.tz;  dest = legs[last].to.tz
  depart = legs[0].departUtc; arrive = legs[last].arriveUtc

  // ---------- 1. Zone delta ----------
  x = offsetHours(dest, arrive) − offsetHours(origin, arrive)
  while x > 14:   x −= 24
  while x ≤ −12:  x += 24
  delta = x                                                  // zoneDeltaHours

  // ---------- 2. Phase estimate (origin clock) ----------
  off = clamp(TMIN_BEFORE_WAKE[chronotype], 1.5, D/2)
  TminClock = (W − off) mod 24
  o = startingBodyClockOffsetHours ?? 0                       // §8.1; body clock ahead of origin
  delta' = normalise(delta − o)                               // used for every strategy decision below

  // ---------- 3. Strategy ----------  (delta below means delta' when o ≠ 0)
  if |delta| < MIN_SHIFT_TO_PLAN:                            // 2 h
     return {strategy:'none', zoneDeltaHours:delta, plannedShiftHours:0,
             estimatedDaysToAdapt:0, days:[], warnings:[]}
  if stayDays defined and stayDays ≤ STAY_HOME_MAX_DAYS and |delta| ≥ 3:
     return stayOnHomeTimePlan(...)                          // §11.6
  if delta > 0 and delta ≥ ANTIDROMIC_EAST_THRESHOLD:        // 10 h
     strategy = 'delay'; planned = −(24 − delta)
     warnings += "Crossing ~{delta}h east: shifting your body clock later instead of earlier is usually faster."
  else if delta > 0:
     strategy = 'advance'; planned = delta
     if delta ≥ ANTIDROMIC_RISK_LOW:                         // 8 h
        warnings += "Large eastward shift: avoiding bright morning light for the first days matters."
  else:
     strategy = 'delay'; planned = delta                     // negative
  dir = sign(planned)
  if strategy == 'delay' and prefs.useMelatonin:
     warnings += "Melatonin isn't scheduled for this trip because evidence for using it to shift your clock later is limited."

  // ---------- 4. Pre-flight days ----------
  nPre = 0
  if prefs.preAdapt and |planned| ≥ PREADAPT_MIN:            // 3
     nPre = min(clamp(prefs.maxPreDays ?? 3, 0, MAX_PRE_DAYS), ceil(|planned|) − 1)
  depDate = localDate(origin, depart);  arrDate = localDate(dest, arrive)

  // ---------- 5. Simulate Tmin ----------
  mel = prefs.useMelatonin and dir == +1
  // pre-flight shifting applies to the FIRST nPre events only (one per pre-day); any further
  // event before departure (e.g. the morning of day 0) gets rate 0.
  rate(phase, i) = phase=='pre' ? (i < nPre ? (dir>0 ? (mel?PRE_ADV_RATE_MEL:PRE_ADV_RATE) : PRE_DEL_RATE) : 0)
                                : (dir>0 ? (mel?POST_ADV_RATE_MEL:POST_ADV_RATE) : POST_DEL_RATE)
  t = local(origin, depDate − nPre days, TminClock − o)      // Tmin on the morning of the first plan day
  remaining = planned; events = []; postCount = 0; i = 0
  horizonEnd = min(arrive + h(24·MAX_POST_DAYS), stayDays ? arrive + h(24·stayDays) : +∞)
  loop:
     phase = (t < depart) ? 'pre' : 'post'
     events.push({t, remaining, phase})
     if phase=='post': postCount++
     if phase=='post' and |remaining| ≤ ADAPTED_TOL: break
     if t > horizonEnd: break
     step = min(rate(phase, i), |remaining|)
     remaining −= dir·step
     t = t + h(24) − dir·h(step); i++
  estimatedDaysToAdapt = count(events where phase=='post' and |remaining| > ADAPTED_TOL)
  // if the horizon was hit before adaptation, warnings += "Plan covers the first {n} days; you may not be fully adapted by then."

  // ---------- 6. Sleep windows ----------
  sleeps = []
  for k in −nPre … −1:                                        // pre-flight nights
     s = (k + nPre + 1)·PRE_SLEEP_STEP                         // 1 h per night
     start = local(origin, depDate + k days, B) − dir·h(s)
     end   = start + h(D)                                      // W shifted by the same amount
     if end > depart − h(2): end = depart − h(2)               // leave for the airport
     add sleep(start, end) if end − start ≥ h(2)
  // in-flight sleep: only on legs long enough, overlapping destination night, and realistic
  bodyNight(t, m) = [t − h(D − TminBeforeWake + m), t + h(TminBeforeWake + m)]   // habitual sleep on the body clock
  realistic(w, woke) = w ∩ [woke + h(FLIGHT_SLEEP_AFTER_WAKE_H), ∞)               // 4 h
                         ∩ (⋃_t bodyNight(t, FLIGHT_SLEEP_BODY_MARGIN_H)          // 2 h either side
                            ∪ [woke + h(FLIGHT_SLEEP_PRESSURE_H), ∞))             // or 8 h awake
                       (longest piece ≥ h(1.5), else none)
  for each leg with (arrive − depart) ≥ h(MIN_FLIGHT_SLEEP_H):  // 4 h
     for each destination night N = [local(dest, d, B), local(dest, d, B) + h(D)] overlapping the leg:
        w = realistic([leg.departUtc + h(1), leg.arriveUtc − h(1)] ∩ N, end of the previous sleep)
        add sleep(w) if any
  // review fix: a destination night at body-clock midday right after a full night (LHR → LAX
  // 13:00–15:00Z, body clock ≈ 13:00) is not a sleep; the in-flight nap rule (§7.1) covers it.
  // night ends are wall-clock: a 23:00–07:00 night ends at 07:00 local even on a DST night
  // destination nights: habitual B/W on destination clock (DESIGN CHOICE: adopt local schedule on arrival)
  for each destination night N from the night containing/after arrival until the last event + 1 day:
     w = N ∩ [arrive + h(1), ∞)
     add sleep(w) if |w| ≥ h(2)
  // awake cap (extension, review fix): for each leg ≥ 4 h, prevEnd = last sleep ending before takeoff,
  // next = first sleep starting at or after takeoff (an in-flight sleep late in the leg counts as next,
  // not as relief for the hours before it). If next − prevEnd > h(MAX_AWAKE_H = 20):
  //    add the longest piece of bodyNight(t, 0) ∩ [dep + 1h, arr − 1h] ∩ [prevEnd + 4h, next] ≥ h(1.5)
  // then re-check every in-flight sleep with realistic(·, end of the sleep before it), trimming or
  // dropping it, so two in-flight sleeps are never minutes apart.
  // (v0 applied the cap only to legs with no in-flight sleep at all, so CDG → SYD was told to stay
  // awake 28 h, through its whole body-clock night on the plane, before a late in-flight sleep.)
  // the night before departure when nPre==0 is not shown

  awake = complement of sleeps over [planStart, planEnd]

  // ---------- 7. Light windows ----------
  for e (index i) in events:
     if e.phase=='pre' and nPre==0: continue
     driver = dir>0 ? e : events[i−1]            // delay: evening light lands at this Tmin
     if no driver or |driver.remaining| ≤ ADAPTED_TOL: continue
     if dir>0: seek = [e.t + h(1), e.t + h(5)); avoid = [e.t − h(5), e.t + h(1))
     else:     seek = latest 4 h of ([e.t − h(8), e.t − h(1)) ∩ awake); avoid = [e.t − h(1), e.t + h(4))
     if nPre==0: seek = seek ∩ [depart, ∞); avoid = avoid ∩ [depart, ∞)
     for piece in (seek ∩ awake):  add 'seek_light'  if |piece| ≥ h(MIN_WINDOW_H)   // 0.5 h
     for piece in (avoid ∩ awake): add 'avoid_light' if |piece| ≥ h(MIN_WINDOW_H)

  // ---------- 8. Melatonin (advance only) ----------
  if mel:
     postDoses = 0
     for e in events where |e.remaining| > ADAPTED_TOL and (e.phase=='post' or nPre>0):
        if e.phase=='post' and postDoses ≥ MELATONIN_MAX_POST_DOSES: break     // 5
        dlmo = e.t − h(DLMO_TO_TMIN)
        c = dlmo − h(MEL_BEFORE_DLMO_H)                        // 3 h
        if c is not strictly inside any sleep: dose at c
        else:
           b = start of the first sleep with start ≥ c − h(12)
           if b ∈ [dlmo − h(6), dlmo − h(0.5)]: dose at b
           else: skip
        if dosed: add 'melatonin' point window (startUtc == endUtc); if e.phase=='post': postDoses++

  // ---------- 9. Caffeine ----------
  if prefs.useCaffeine:
     for each sleep S (in time order):
        add 'avoid_caffeine' pieces of [S.start − h(8), S.start) ∩ awake
        prevEnd = end of the previous sleep (or planStart)
        okEnd = S.start − h(8)
        dayRemaining = remaining of the latest event ≤ okEnd
        if (okEnd − prevEnd ≥ h(1)) and (S starts in day 0 or later) and (S is in day 0 or the arrival day or |dayRemaining| ≥ 2):
           add 'caffeine_ok' [prevEnd, okEnd) ∩ awake

  // ---------- 10. Naps ----------
  in-flight nap on a long travel day: see §7.1 (at most one nap per day including it)
  for each day d with dayIndex ≥ 0 (after arrival) and (d is day 0 or the arrival day or |remaining at day start| ≥ 3) and no in-flight nap:
     region = awake ∩ [prevWake + h(2), nextSleepStart − h(6)) ∩ [arrive + h(1.5), ∞) − seek_light windows
              − ⋃_t [t − h(D − TminBeforeWake), t + h(NAP_AFTER_TMIN_H))        // body night through Tmin + 2 h
     slot = 20-min slot in region closest to a body-clock early afternoon t + h(10)
            (slots are placed on the 5-min output grid so they keep their exact length)
     add 'nap' if slot exists

  // ---------- 10b. Output rounding and merging (once, at output) ----------
  round every startUtc/endUtc to the nearest 5 min in UTC (OUTPUT_ROUND_MIN). All UTC offsets in use are
     whole multiples of 15 min, so this is also the 5-min grid of every local clock (no "nap 14:13").
     Rounding is monotone, so windows that did not overlap still do not, and nothing moves into a sleep.
     tz labels are taken at the unrounded start.
  merge same-kind windows that touch (end == start) when tz and rationale are identical.
     Pieces split at landing keep different wording (window shade vs sunglasses) and stay separate;
     the app can show them as one row with `groupContiguousWindows` (format.ts).
  drop windows that became empty, light windows < MIN_WINDOW_H and caffeine_ok < 1 h.

  // ---------- 11. Bucket into days ----------
  day k<0 : [local(origin, depDate+k, 0), local(origin, depDate+k+1, 0)), tz=origin, date=depDate+k
  F = arrDate > depDate + 1 ? arrDate : arrDate + 1           // first post-travel date
  day 0   : [local(origin, depDate, 0),   max(local(dest, F, 0), depart)), tz=origin, date=depDate
  day k≥1 : [end of day k−1,               local(dest, F+k, 0)),           tz=dest,   date=F+k−1
  // so a date-line arrival two dates later (LAX→SYD) gets its own day 1; the app shows a
  // date chip for any window whose local date differs from the day's date (formatWindowLocal.localDate)
  Assign each window to the day whose interval contains its startUtc, except: a ground sleep starting
     between 00:00 and 12:00 local belongs to the night of the previous date, so it is bucketed 12 h earlier
     (when that stays on the same side of the journey and inside the plan), together with the ground windows
     between that midnight and the sleep's start (review fix: with a 01:00 bedtime, the first pre-day had
     no night and the next had two). Sort by startUtc, then by kind.
  With stayDays: drop every window that starts after the end of the local date (destination clock) on
     which arrive + stayDays falls, and the days left empty (review fix: advice after the traveller left).
  window.tz = tz the traveller is in at startUtc: origin before legs[0] departs; legs[i].to.tz during leg i
              and any layover after it; dest after final arrival.
  day.remainingShiftHours = round1(remaining of the last event with t ≤ the day's usual wake time
                                   (local(day.tz, date, W), clamped into the day); if none, planned)
  Emit days from −nPre through the last day containing a window or an event with |remaining| > ADAPTED_TOL.
  Drop empty days except day 0.

  return {strategy, zoneDeltaHours: delta, plannedShiftHours: planned,
          estimatedDaysToAdapt, days, warnings}
```

### 11.6 `stayOnHomeTimePlan`

```
strategy = 'stay_on_home_time'; plannedShiftHours = 0; estimatedDaysToAdapt = 0
warnings += "Short stay: keeping close to home time is usually easier than adapting and re-adapting."
For each day from day 0 to ceil(stayDays):
  sleep  = habitual B/W in origin clock (converted to UTC); tz label = where the traveller is
  t      = home Tmin for that date (origin clock; does not move)
  avoid_light = [t − 4h, t + 4h) ∩ awake        // keep light away from both sides of Tmin so the clock stays put
  caffeine rules as in §6 against home-time sleep
  remainingShiftHours = delta (constant; the body intentionally stays on home time)
If home-time sleep overlaps fixed commitments the user must manage that; no nap or melatonin windows.
```

### 11.7 Rationale templates (one plain sentence; no medical claims)

| kind | rationale |
|---|---|
| seek_light (advance) | "Bright light now, ideally daylight, helps move your body clock earlier." |
| seek_light (delay) | "Bright light now, ideally daylight, helps move your body clock later." |
| avoid_light (advance) | "Light now would push your body clock the wrong way; keep it dim and wear sunglasses outside." |
| avoid_light (delay) | "Light now would pull your body clock earlier; keep it dim and wear sunglasses outside." |
| avoid_light (stay) | "Avoiding bright light now helps keep your body clock on home time." |
| seek_light, dusk/dawn (§2 wording) | "Bright light now helps move your body clock earlier/later; get daylight while it's light out, otherwise bright indoor light or a light box." |
| seek_light, dark | "…; it's likely dark outside, so use bright indoor light or a light box." / in flight: "…; it's likely dark outside, so use the reading light or a bright screen." |
| avoid_light, dark | "Light now would push your body clock the wrong way; keep the lights dim and screens low." (delay: "…would pull your body clock earlier; …") |
| sleep | "Sleeping now lines up with your plan for {destination or home} time." / in flight: "Try to sleep on the plane now; an eye mask and earplugs help." |
| nap | "If you're sleepy, a short nap (10–20 min) is fine now; keep it short so it doesn't affect tonight." |
| nap (in flight, §7.1) | "It's a long time awake today; a nap of up to 40 min on the plane now (set an alarm) helps you stay alert and still sleep tonight." / 90 min: "You'll be awake for about a day; a nap of up to 90 min (about one sleep cycle) on the plane now helps, and waking after a full cycle limits grogginess." |
| caffeine_ok | "If you need it, caffeine now can help with daytime sleepiness without disturbing tonight's sleep." |
| avoid_caffeine | "Skip caffeine from now until bedtime; it can disrupt sleep even hours later." |
| melatonin | "A low dose (0.5 mg) of melatonin at this time is commonly used to help shift the body clock earlier; it can make some people drowsy." |

---

## 12. PARAMETERS

| Name | Value | Source / status |
|---|---|---|
| TMIN_BEFORE_WAKE | early 3.5, intermediate 3.0, late 2.5 h | Baehr2000, Duffy1999 (direction); magnitude DESIGN CHOICE; 3.0 is the widely used approximation |
| TMIN clamp | [1.5 h, D/2] before wake | DESIGN CHOICE |
| DLMO_TO_TMIN | 7 h | Widely used approximation (not primary-verified here) |
| MIN_SHIFT_TO_PLAN | 2 h | DESIGN CHOICE |
| ANTIDROMIC_EAST_THRESHOLD | 10 h | Derived from rates (crossover 9.6 h); weak evidence |
| ANTIDROMIC_RISK_LOW | 8 h | DESIGN CHOICE |
| PRE_ADV_RATE / _MEL | 0.5 / 0.75 h/day | Burgess2003; Revell2006 (discounted) |
| PRE_DEL_RATE | 0.75 h/day | DESIGN CHOICE, weak evidence |
| POST_ADV_RATE / _MEL | 1.0 / 1.25 h/day | CDCYellowBook† (~57 min/day); melatonin uplift DESIGN CHOICE from Revell2006 |
| POST_DEL_RATE | 1.5 h/day | CDCYellowBook† (~92 min/day) |
| PRE_SLEEP_STEP | 1 h/night | Burgess2003, Eastman2005 |
| MAX_PRE_DAYS | 3 | Burgess2003, Eastman2005, Revell2006 (3-day protocols) |
| PREADAPT_MIN | 3 h | DESIGN CHOICE |
| LIGHT windows | adv: seek [t+1,t+5), avoid [t−5,t+1); delay: seek [t−5,t−1), avoid [t−1,t+4) | Khalsa2003, StHilaire2012, Minors1991; margins DESIGN CHOICE |
| MIN_WINDOW_H | 0.5 h | DESIGN CHOICE |
| ADAPTED_TOL | 1.0 h | DESIGN CHOICE (within estimate error) |
| MAX_POST_DAYS | 14 | DESIGN CHOICE |
| STAY_HOME_MAX_DAYS | 2 | DESIGN CHOICE; CDCYellowBook†/Sack2010 support the concept |
| MEL_DOSE | 0.5 mg | Burgess2010, Revell2006 |
| MEL_BEFORE_DLMO_H | 3 h (range 2–4) | Burgess2010 |
| MEL bedtime fallback range | [DLMO−6, DLMO−0.5] | Herxheimer2002 timing, limited to the advance side; DESIGN CHOICE |
| MELATONIN_MAX_POST_DOSES | 5 | Herxheimer2002 (2–5 days) |
| CAFFEINE_CUTOFF_H | 8 h before sleep | Gardiner2023 (8.8 h), Drake2013 (6 h insufficient at 400 mg) |
| CAFFEINE_OK threshold | day 0, the arrival day, or |remaining| ≥ 2 | DESIGN CHOICE |
| NAP_MIN | 20 min (advise 10–20) | BrooksLack2006, Rosekind1995 |
| NAP_BEFORE_BED_H | 6 h | DESIGN CHOICE |
| NAP threshold | day 0, the arrival day, or |remaining| ≥ 3 | DESIGN CHOICE |
| NAP_AFTER_TMIN_H | 2 h (no ground nap in the body night or before Tmin + 2 h) | DESIGN CHOICE (sleep inertia near Tmin) |
| INFLIGHT_NAP_AWAKE_H / _LONG_AWAKE_H | 18 h / 22 h awake | DESIGN CHOICE (§7.1) |
| INFLIGHT_NAP_MIN / _LONG_MIN / _SHORTEST_MIN | 40 / 90 / 20 min | Rosekind1995 (40-min opportunity); ~90-min sleep cycle widely used approximation; BrooksLack2006 |
| NAP_BODY_AFTERNOON_AFTER_TMIN_H | 10 h | DESIGN CHOICE (body-clock early afternoon) |
| OUTPUT_ROUND_MIN | 5 min | DESIGN CHOICE (display precision well inside the ±1–2 h phase error) |
| MAX_START_OFFSET_H | 12 h | Range of `startingBodyClockOffsetHours` |
| MIN_FLIGHT_SLEEP_H | 4 h leg duration | DESIGN CHOICE |
| In-flight sleep min | 1.5 h | DESIGN CHOICE |
| FLIGHT_SLEEP_AFTER_WAKE_H | 4 h (no in-flight sleep sooner after waking) | DESIGN CHOICE |
| FLIGHT_SLEEP_BODY_MARGIN_H | 2 h either side of the body-clock night | DESIGN CHOICE |
| FLIGHT_SLEEP_PRESSURE_H | 8 h awake makes in-flight sleep realistic at any body-clock time | DESIGN CHOICE |
| MAX_AWAKE_H | 20 h before the awake-cap body-night sleep is added | DESIGN CHOICE |
| DAYLIGHT_CORE_HOURS / DAYLIGHT_HOURS | 08:00–16:30 / 06:30–19:30 local, wording only | DESIGN CHOICE (no solar model) |

All parameters should live in one exported `PARAMS` object so they can be tuned and tested.

---

## 13. TEST SCENARIOS

Default profile unless stated: bed 23:00, wake 07:00, intermediate. Therefore home TminClock = 04:00 and DLMOClock = 21:00. Preferences: preAdapt true, maxPreDays 3, caffeine true, melatonin false. Dates are chosen after the Nov-2026 DST changes.

1. **Toronto → London, 5 h east.** YYZ 2026-11-10 21:00 EST (02:00Z 11-11) → LHR 08:50 GMT 2026-11-11, stay 10.
   - strategy `advance`, zoneDelta +5, planned +5, nPre 3. Pre-flight achieves 1.5 h, leaving 3.5 → **estimatedDaysToAdapt 3**. With preAdapt false: 4 days. The 4–5 day expectation holds without pre-adapting.
   - Pre-days: sleep moves to 22:00/06:00, 21:00/05:00, 20:00/04:00. Seek-light starts at wake each morning.
   - Tmin events (EST): 11-07 04:00, 11-08 03:30, 11-09 03:00, 11-10 02:30 (pre, step 0); then 11-11 07:30 GMT (rem 3.5), 11-12 06:30 (2.5), 11-13 05:30 (1.5), 11-14 04:30 (0.5, stop).
   - Arrival day (day 0, 11-11): seek light ≈ 08:50 (landing)–12:30 GMT. Day 1 (11-12): seek ≈ 07:30–11:30, avoid 07:00–07:30 (the rest of the 01:30–07:30 avoid window falls in sleep). No light window inside 23:00–07:00.
   - Morning seek windows move earlier each day; `remainingShiftHours` decreases monotonically to ≤ 1.
   - In-flight sleep ≈ 03:00–07:00 GMT (dep + 1 h … overlap with 23:00–07:00 London night).
2. **LA → Sydney.** LAX 2026-11-10 22:00 PST → SYD 2026-11-12 06:30 AEDT. Raw +19 → zoneDelta **−5**.
   - strategy `delay`, planned −5, nPre 3 (2.25 h pre-delay), leaving 2.75 → **estimatedDaysToAdapt 2** (rem 2.75, 1.25). Without pre-adapt: 3 (5, 3.5, 2).
   - Seek light in the destination **afternoon/evening**, avoid light in the early morning.
3. **NYC → Tokyo.** JFK 2026-11-10 12:00 EST → HND 2026-11-11 15:30 JST. zoneDelta **+14**.
   - strategy `delay`, planned **−10**, warning "Crossing ~14h east…". estimatedDaysToAdapt ≈ 5 with pre-adapt, ≈ 6 without.
   - First post event: Tmin 06:15 EST = 20:15 JST (home 04:00 + 2.25 h pre-delay). Seek light ≈ 15:15–19:15 JST; avoid ≈ 19:15–23:00 JST (clipped at bedtime). Both move ~1.5 h later each day.
   - Variant (EDT, departing 2026-10-01): zoneDelta +13 → planned −11, still delay.
   - With melatonin on: no melatonin windows, plus the melatonin warning.
4. **London → Singapore.** LHR 2026-11-10 21:00 GMT → SIN 2026-11-11 17:00 SGT. zoneDelta **+8**.
   - strategy `advance` with the large-eastward warning. estimatedDaysToAdapt ≈ 6 with pre-adapt (8 − 1.5 = 6.5 → 6).
   - First post Tmin is 02:30 GMT = 10:30 SGT, while in flight. Day 1 (11-12): Tmin 09:30 SGT, so **avoid light 07:00–10:30 SGT** (wake to Tmin+1) and seek light 10:30–14:30 SGT. Windows move ~1 h earlier each day.
   - Variant (BST, departing 2026-07-10): zoneDelta +7, no warning.
5. **Short 2-day stay.** Toronto → London as in scenario 1, but stayDays 2 → `stay_on_home_time`, planned 0, estimatedDaysToAdapt 0, remainingShiftHours +5 constant. Sleep windows are at 04:00–12:00 London. Avoid-light around home Tmin (London 05:00–13:00 clipped to waking). No melatonin or nap.
6. **No shift.** Toronto → New York (same zone) → `none`, days [].
7. **Small westward.** NYC → LA, −3 → `delay`, nPre 2, estimatedDaysToAdapt 1.
8. **Threshold boundaries** (property tests on delta): +9.5 → advance, +10 → delay, +12 → delay (planned −12), +14 → delay (−10), −11 → delay (−11).
9. **Melatonin on, scenario 1.** Pre-days: point doses ≈ DLMO − 3h, roughly 18:00 home time and getting earlier. After arrival: dose at the candidate or at the bedtime fallback, ≤ 5 post doses. estimatedDaysToAdapt ≤ the melatonin-off value. No dose inside a sleep window.
10. **Late chronotype.** Bed 01:00, wake 09:00, late → TminClock 06:30. Every window moves 2.5 h later than the default profile.
11. **Multi-leg.** Toronto → Frankfurt → Delhi (+10.5) → delay, planned −13.5. Window tz labels: Frankfurt during the layover, Asia/Kolkata after arrival. **Flag for review:** this falls in the uncertain antidromic band.
12. **DST during the plan** (e.g. Toronto → London departing 2026-10-30): Tmin progression is continuous in UTC (24 h ∓ step). Local-clock sleep windows follow DST. No window is duplicated or lost.

**Invariants (property tests over random valid inputs):**

- No `seek_light`, `avoid_light`, `nap`, `caffeine_ok` or `melatonin` window lies inside a `sleep` window.
- `seek_light` never overlaps `avoid_light`.
- `caffeine_ok` never overlaps `avoid_caffeine`.
- For non-point windows `startUtc < endUtc`. Melatonin windows have `startUtc == endUtc`.
- `|remainingShiftHours|` is non-increasing across days, and `sign(remaining) == sign(planned)` until adapted.
- `zoneDeltaHours` ∈ (−12, 14].
- `estimatedDaysToAdapt ≤ MAX_POST_DAYS`; it is 0 for `none` and `stay_on_home_time`.
- Strategy is independent of `useMelatonin` and `useCaffeine`.
- Melatonin only appears when `useMelatonin` is true and strategy is `advance`. No caffeine windows when `useCaffeine` is false.
- Days are ordered by dayIndex, with no gaps between the first and last emitted day except dropped empty days.
- Every boundary is on the 5-min grid (UTC and local). Same-kind windows with the same tz and rationale never touch.
- Ground naps are 20 min; in-flight naps are 20–90 min, inside the flight, and never overlap `avoid_caffeine`. At most one nap per day (a multi-leg travel day: one in-flight nap per leg).
- Over a grid of ~650 single-leg trips: no awake span over `MAX_AWAKE_H` leaves ≥ 1.5 h of in-flight body-clock night awake, and every awake span over 22 h within 48 h of arrival contains a nap.
- With `stayDays`, no window after the local date the stay ends. Return pre-days never start before the outbound plan has adapted the traveller.

---

## 14. LIMITATIONS

- **Not clinically validated.** This rule-based model has not been tested against measured DLMO in travellers. The rates and windows come from lab studies of mostly young, healthy adults (Burgess2003, Eastman2005, Revell2006, Khalsa2003). Outcomes for older adults, shift workers and people with sleep disorders may differ.
- **Phase estimate error.** A Tmin inferred from self-reported sleep times is uncertain by about ±1–2 h. The 1 h margins reduce the harm, but cannot eliminate wrong-side light exposure.
- **No light-dose model.** We tell people when to seek or avoid light, not how much they actually got. Real shift depends on intensity, duration, spectrum and prior light history (StHilaire2012, Zeitzer2000). Products built on mathematical oscillator models (Kronauer/Forger family, e.g. Dean2009) can optimise schedules and respond to partial adherence. Timeshifter states that its algorithm draws on Steven Lockley's circadian research and personalises by sleep pattern, chronotype, flight plan and preferences. Its model is proprietary and likely more sophisticated (e.g. continuous light-response modelling, in-flight specifics, adherence handling), so we cannot compare outputs directly.
- **Fixed rates.** Real rates vary by person (intrinsic period, chronotype, age) and trip. Our capped-linear catch-up ignores sleep deprivation, travel fatigue and non-photic cues (meals, exercise).
- **Antidromic threshold** (10 h) is derived from our own rate assumptions, not from an empirical cut-off.
- **Melatonin.** Product purity and dose vary (melatonin is unregulated as a supplement in some markets). We support advance timing only. Delay use is not implemented because evidence is weaker.
- **Short-stay threshold** and several buffers (nap 6 h, caffeine 8 h, minimum shift 2 h) are design choices.
- **Return trips** use a simplified starting phase (§8.1): the outbound catch-up model is assumed to have been followed, with no allowance for missed light or partial adherence.
- **In-flight nap thresholds** (18 h / 22 h awake) and the body-clock-afternoon timing are design choices.
- **Daylight wording** uses fixed local-clock bands, not sunrise and sunset. Windows that straddle dusk or dawn get hedged wording ("while it's light out"); summer evenings at high latitudes are lighter than the wording assumes.
- **Awake spans.** Some itineraries still mean 22–28 h between sleeps, with a nap (for example an early-morning arrival after a westward daytime flight). The engine never asks someone to stay awake through a body-clock night on the plane to get there.
- **Not modelled:** very long multi-stop itineraries treated as one adaptation, chained trips (one destination after another), polar latitudes (daylight availability), and individual commitments (meetings during "avoid light").
- **† items** were verified only from abstracts or secondary summaries because the sandbox blocked full text. Re-check them before any public claims.

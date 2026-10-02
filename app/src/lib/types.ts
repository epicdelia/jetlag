import type { Preferences, SleepProfile, TripInput } from '@jetlag/engine';

/** The traveller's defaults, set in onboarding and editable in Settings. */
export interface Profile {
  sleep: SleepProfile;
  prefs: Preferences;
}

export interface AppSettings {
  notificationsEnabled: boolean;
  /** Minutes before a window starts to send the reminder. */
  leadMinutes: number;
}

/** A leg as the user typed it: local wall-clock times at each airport. */
export interface LegDraft {
  fromTz: string;
  fromLabel: string;
  toTz: string;
  toLabel: string;
  departDate: string; // YYYY-MM-DD, local at origin
  departTime: string; // HH:mm, local at origin
  arriveDate: string; // YYYY-MM-DD, local at destination
  arriveTime: string; // HH:mm, local at destination
}

export interface Trip {
  id: string;
  name: string;
  createdAt: string;
  /** Exact engine input (UTC instants), snapshot of the profile at save time. */
  input: TripInput;
  /** What the user entered, kept for display/editing. */
  legsLocal: LegDraft[];
  /**
   * The profile as it was when the plan was built. `input.prefs` may differ from it (pre-flight
   * days already in the past are dropped), so "profile changed" compares against this.
   */
  profileAtSave?: Profile;
}

export const DEFAULT_PROFILE: Profile = {
  sleep: { usualBedtime: '23:00', usualWake: '07:00', chronotype: 'intermediate' },
  prefs: { useMelatonin: false, useCaffeine: true, preAdapt: true, maxPreDays: 3 },
};

export const DEFAULT_SETTINGS: AppSettings = {
  notificationsEnabled: true,
  leadMinutes: 10,
};

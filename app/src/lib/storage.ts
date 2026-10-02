import AsyncStorage from '@react-native-async-storage/async-storage';

import { DEFAULT_PROFILE, DEFAULT_SETTINGS, type AppSettings, type Profile, type Trip } from './types';

const KEYS = {
  profile: 'jetlag.profile.v1',
  settings: 'jetlag.settings.v1',
  trips: 'jetlag.trips.v1',
} as const;

export interface PersistedState {
  /** null until onboarding is completed. */
  profile: Profile | null;
  settings: AppSettings;
  trips: Trip[];
}

async function readJson<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

async function writeJson(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn(`[storage] failed to write ${key}`, e);
  }
}

export async function loadState(): Promise<PersistedState> {
  const [profile, settings, trips] = await Promise.all([
    readJson<Profile>(KEYS.profile),
    readJson<AppSettings>(KEYS.settings),
    readJson<Trip[]>(KEYS.trips),
  ]);
  return {
    profile: profile
      ? {
          sleep: { ...DEFAULT_PROFILE.sleep, ...profile.sleep },
          prefs: { ...DEFAULT_PROFILE.prefs, ...profile.prefs },
        }
      : null,
    settings: { ...DEFAULT_SETTINGS, ...(settings ?? {}) },
    trips: Array.isArray(trips) ? trips : [],
  };
}

export const saveProfile = (p: Profile | null) =>
  p ? writeJson(KEYS.profile, p) : AsyncStorage.removeItem(KEYS.profile).catch(() => {});
export const saveSettings = (s: AppSettings) => writeJson(KEYS.settings, s);
export const saveTrips = (t: Trip[]) => writeJson(KEYS.trips, t);

export async function clearAll(): Promise<void> {
  try {
    await AsyncStorage.multiRemove(Object.values(KEYS));
  } catch {
    // ignore
  }
}

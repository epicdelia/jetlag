import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { cancelAllReminders, syncReminders } from './notifications';
import { upcomingReminders } from './reminders';
import { clearAll, loadState, saveProfile, saveSettings, saveTrips } from './storage';
import { DEFAULT_SETTINGS, type AppSettings, type Profile, type Trip } from './types';

interface ReminderStatus {
  scheduled: number;
  at: number;
}

interface Store {
  ready: boolean;
  profile: Profile | null;
  settings: AppSettings;
  trips: Trip[];
  reminders: ReminderStatus | null;
  setProfile: (p: Profile) => void;
  setSettings: (s: AppSettings) => Promise<void>;
  /** Saves (adds or replaces) a trip and reschedules reminders, asking for permission if needed. */
  saveTrip: (t: Trip) => Promise<number>;
  deleteTrip: (id: string) => void;
  resync: (ask: boolean) => Promise<number>;
  resetAll: () => Promise<void>;
}

const Ctx = createContext<Store | null>(null);

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [profile, setProfileState] = useState<Profile | null>(null);
  const [settings, setSettingsState] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [reminders, setReminders] = useState<ReminderStatus | null>(null);
  const tripsRef = useRef<Trip[]>([]);
  const settingsRef = useRef<AppSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    let alive = true;
    loadState().then((s) => {
      if (!alive) return;
      setProfileState(s.profile);
      setSettingsState(s.settings);
      settingsRef.current = s.settings;
      setTrips(s.trips);
      tripsRef.current = s.trips;
      setReady(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  // Re-syncs run one at a time; when several are requested while one is running, only the
  // latest runs (it reads the current trips and settings), and every caller gets its result.
  // Two overlapping cancel-then-schedule passes would otherwise leave duplicate reminders.
  const syncChain = useRef<Promise<unknown>>(Promise.resolve());
  const syncGen = useRef(0);
  const pendingAsk = useRef(false);
  const latestSync = useRef<Promise<number>>(Promise.resolve(0));

  const resync = useCallback((ask: boolean): Promise<number> => {
    const gen = ++syncGen.current;
    pendingAsk.current = pendingAsk.current || ask;
    const run = async (): Promise<number | null> => {
      if (gen !== syncGen.current) return null; // superseded by a newer request
      const askNow = pendingAsk.current;
      pendingAsk.current = false;
      const s = settingsRef.current;
      if (!s.notificationsEnabled) {
        await cancelAllReminders();
        setReminders({ scheduled: 0, at: Date.now() });
        return 0;
      }
      const n = await syncReminders(upcomingReminders(tripsRef.current, s.leadMinutes), askNow);
      setReminders({ scheduled: n, at: Date.now() });
      return n;
    };
    const p = syncChain.current.then(run, run);
    syncChain.current = p.catch(() => undefined);
    const result: Promise<number> = p.then((n) => (n === null ? latestSync.current : n)).catch(() => 0);
    latestSync.current = result;
    return result;
  }, []);

  // Refresh pending reminders once per launch (windows in the past drop out; the
  // 60-notification cap rolls forward). Never prompts for permission here.
  useEffect(() => {
    if (ready) void resync(false);
  }, [ready, resync]);

  const setProfile = useCallback((p: Profile) => {
    setProfileState(p);
    void saveProfile(p);
  }, []);

  const setSettings = useCallback(
    async (s: AppSettings) => {
      setSettingsState(s);
      settingsRef.current = s;
      await saveSettings(s);
      await resync(s.notificationsEnabled);
    },
    [resync],
  );

  const commitTrips = useCallback((next: Trip[]) => {
    tripsRef.current = next;
    setTrips(next);
    void saveTrips(next);
  }, []);

  const saveTrip = useCallback(
    async (t: Trip) => {
      const cur = tripsRef.current;
      const i = cur.findIndex((x) => x.id === t.id);
      const next = i >= 0 ? cur.map((x) => (x.id === t.id ? t : x)) : [...cur, t];
      commitTrips(next);
      return resync(true);
    },
    [commitTrips, resync],
  );

  const deleteTrip = useCallback(
    (id: string) => {
      commitTrips(tripsRef.current.filter((x) => x.id !== id));
      void resync(false);
    },
    [commitTrips, resync],
  );

  const resetAll = useCallback(async () => {
    await cancelAllReminders();
    await clearAll();
    tripsRef.current = [];
    settingsRef.current = DEFAULT_SETTINGS;
    setTrips([]);
    setSettingsState(DEFAULT_SETTINGS);
    setProfileState(null);
    setReminders(null);
  }, []);

  const value = useMemo<Store>(
    () => ({
      ready,
      profile,
      settings,
      trips,
      reminders,
      setProfile,
      setSettings,
      saveTrip,
      deleteTrip,
      resync,
      resetAll,
    }),
    [ready, profile, settings, trips, reminders, setProfile, setSettings, saveTrip, deleteTrip, resync, resetAll],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppStore(): Store {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAppStore must be used inside AppStoreProvider');
  return v;
}

export function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

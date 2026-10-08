import { useSyncExternalStore } from 'react';

/**
 * One shared clock for the whole app, ticking every 30 s. Components subscribe to the narrowest
 * value they need (`useNowWithin`, `useNowIn`), so a tick re-renders only the few that change
 * (the "now" marker, the active row) instead of whole screens.
 */
const TICK_MS = 30000;
let current = Date.now();
const listeners = new Set<() => void>();
setInterval(() => {
  current = Date.now();
  for (const l of [...listeners]) l();
}, TICK_MS);

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

const getNow = () => current;
const noSubscribe = () => () => {};

/**
 * Current epoch ms, refreshed every 30 s. Re-renders the caller on every tick while `live`
 * (pass false for a screen that is not focused: it then catches up when it is focused again).
 */
export function useNow(live = true): number {
  return useSyncExternalStore(live ? subscribe : noSubscribe, getNow, getNow);
}

/** True while now is in [start, end). Re-renders the caller only when that flips. */
export function useNowWithin(start: number, end: number): boolean {
  const get = () => current >= start && current < end;
  return useSyncExternalStore(subscribe, get, get);
}

/** Now when it is in [start, end), else null. Re-renders the caller only while now is inside. */
export function useNowIn(start: number, end: number): number | null {
  const get = () => (current >= start && current < end ? current : null);
  return useSyncExternalStore(subscribe, get, get);
}

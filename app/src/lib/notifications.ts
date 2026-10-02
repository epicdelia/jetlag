/**
 * Native local notifications (iOS/Android). The web build resolves
 * notifications.web.ts instead, which is a no-op.
 */
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import type { Reminder } from './reminders';

export type PermissionState = 'granted' | 'denied' | 'undetermined' | 'unsupported';

let handlerSet = false;
function ensureHandler() {
  if (handlerSet) return;
  handlerSet = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

export const notificationsSupported = true;

export async function getPermission(): Promise<PermissionState> {
  try {
    const s = await Notifications.getPermissionsAsync();
    if (s.granted || s.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) return 'granted';
    return s.canAskAgain ? 'undetermined' : 'denied';
  } catch {
    return 'unsupported';
  }
}

/** Ask only if not yet decided; never nag after a denial. */
export async function requestPermission(): Promise<PermissionState> {
  const current = await getPermission();
  if (current !== 'undetermined') return current;
  try {
    const s = await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowSound: true, allowBadge: false },
    });
    return s.granted ? 'granted' : 'denied';
  } catch {
    return 'unsupported';
  }
}

/** Reminders due sooner than this after scheduling are dropped (iOS rejects non-positive intervals). */
const MIN_LEAD_MS = 5000;

/**
 * Replace every pending reminder with `reminders`. Returns how many were
 * scheduled (0 when permission is missing; never throws).
 *
 * Callers must not run two syncs at once (the store serialises them). Each reminder
 * carries a stable identifier, so even an overlapping sync replaces rather than duplicates.
 */
export async function syncReminders(reminders: Reminder[], ask: boolean): Promise<number> {
  ensureHandler();
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
    if (reminders.length === 0) return 0;
    const perm = ask ? await requestPermission() : await getPermission();
    if (perm !== 'granted') return 0;
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('plan', {
        name: 'Plan reminders',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }
  } catch (e) {
    console.warn('[notifications] setup failed', e);
    return 0;
  }
  // The permission dialog can stay open for any length of time: re-check against the clock now.
  const cutoff = Date.now() + MIN_LEAD_MS;
  let n = 0;
  for (const r of reminders) {
    if (r.at <= cutoff) continue;
    try {
      await Notifications.scheduleNotificationAsync({
        identifier: r.id,
        content: { title: r.title, body: r.body, data: { tripId: r.tripId } },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: new Date(r.at),
          channelId: 'plan',
        },
      });
      n++;
    } catch (e) {
      // One bad reminder must not stop the rest.
      console.warn('[notifications] could not schedule', r.id, e);
    }
  }
  return n;
}

export async function cancelAllReminders(): Promise<void> {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch {
    // ignore
  }
}

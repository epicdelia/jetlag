/** Web build: local notifications are not supported; everything is a no-op. */
import type { Reminder } from './reminders';

export type PermissionState = 'granted' | 'denied' | 'undetermined' | 'unsupported';

export const notificationsSupported = false;

export async function getPermission(): Promise<PermissionState> {
  return 'unsupported';
}

export async function requestPermission(): Promise<PermissionState> {
  return 'unsupported';
}

export async function syncReminders(_reminders: Reminder[], _ask: boolean): Promise<number> {
  return 0;
}

export async function cancelAllReminders(): Promise<void> {}

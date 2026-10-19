/**
 * Types and interfaces for Notification Service
 */

export interface NotificationPreferences {
  [prayerKey: string]: boolean; // e.g., { fajr: true, dhuhr: false }
}

/**
 * How a prayer's reminder arrives: with the phone's sound, quietly, or not at all. The Android app
 * also has 'adhan' (the full adhan), and its 'silent' vibrates without sound.
 */
export type ReminderMode = 'off' | 'sound' | 'silent' | 'adhan';

export interface NotificationSettings {
  enabled: boolean;
  advanceMinutes: number; // Minutes before prayer to notify (default: 5)
  /** Prayers with a reminder */
  preferences: NotificationPreferences;
  /** Of those, the ones that arrive without sound or vibration */
  silent?: NotificationPreferences;
  /** Android app: of the ones with sound, those that use the notification sound instead of the adhan */
  plainSound?: NotificationPreferences;
}

export interface ScheduledNotification {
  prayerKey: string;
  prayerName: string;
  scheduledTime: number; // Timestamp
  notificationId?: string;
}

export enum NotificationPermissionStatus {
  GRANTED = 'granted',
  DENIED = 'denied',
  PROMPT = 'default',
  NOT_SUPPORTED = 'not_supported'
}


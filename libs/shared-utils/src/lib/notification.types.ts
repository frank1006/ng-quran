/**
 * Types and interfaces for Notification Service
 */

export interface NotificationPreferences {
  [prayerKey: string]: boolean; // e.g., { fajr: true, dhuhr: false }
}

export interface NotificationSettings {
  enabled: boolean;
  advanceMinutes: number; // Minutes before prayer to notify (default: 5)
  preferences: NotificationPreferences;
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


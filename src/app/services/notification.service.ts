import { Injectable, signal, computed, inject, effect } from '@angular/core';
import { take } from 'rxjs/operators';
import { PrayerTimeData, PrayerTimings } from './prayer-time.types';
import {
  NotificationPreferences,
  NotificationSettings,
  ScheduledNotification,
  NotificationPermissionStatus
} from './notification.types';
import { DeviceDetectionService } from './device-detection.service';
import { PrayerTimeStore } from '../store/prayer-time.store';
import { UserStoreService } from './user-store.service';

@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  private readonly STORAGE_KEY = 'prayer_notification_settings';
  private readonly DEFAULT_ADVANCE_MINUTES = 0; // Notify at exact prayer time

  private readonly deviceDetection = inject(DeviceDetectionService);
  private readonly prayerTimeStore = inject(PrayerTimeStore);
  private readonly userStore = inject(UserStoreService);

  private readonly settings = signal<NotificationSettings>({
    enabled: false,
    advanceMinutes: this.DEFAULT_ADVANCE_MINUTES,
    preferences: {}
  });

  private readonly permissionStatus = signal<NotificationPermissionStatus>(
    this.checkPermissionStatus()
  );

  // Store active timeout IDs for cancellation
  private readonly notificationTimeouts = new Map<string, number>();
  
  // Store interval IDs for cleanup
  private dateRolloverInterval: number | null = null;
  
  // Store event listener handlers for cleanup
  private onlineHandler: (() => void) | null = null;
  private offlineHandler: (() => void) | null = null;

  readonly isPermissionGranted = computed(() =>
    this.permissionStatus() === NotificationPermissionStatus.GRANTED
  );

  readonly isNotificationEnabled = computed(() =>
    this.settings().enabled && this.isPermissionGranted()
  );

  readonly currentSettings = computed(() => this.settings());

  constructor() {
    this.loadSettings();
    this.checkPermissionStatus();

    // Check scheduled notifications on app load
    if (typeof window !== 'undefined') {
      this.checkScheduledNotifications();
      this.setupOfflineHandling();
      this.setupDateRolloverHandling();
    }
  }

  /**
   * Cleanup method to remove event listeners and intervals
   * Should be called when service is destroyed (though services are singletons)
   */
  cleanup(): void {
    // Clear date rollover interval
    if (this.dateRolloverInterval !== null) {
      clearInterval(this.dateRolloverInterval);
      this.dateRolloverInterval = null;
    }

    // Remove event listeners
    if (typeof window !== 'undefined') {
      if (this.onlineHandler) {
        window.removeEventListener('online', this.onlineHandler);
        this.onlineHandler = null;
      }
      if (this.offlineHandler) {
        window.removeEventListener('offline', this.offlineHandler);
        this.offlineHandler = null;
      }
    }

    // Clear all notification timeouts
    this.notificationTimeouts.forEach(timeoutId => clearTimeout(timeoutId));
    this.notificationTimeouts.clear();
  }

  /**
   * Setup offline notification handling
   */
  private setupOfflineHandling(): void {
    if (typeof window === 'undefined') {
      return;
    }

    // Store handlers for cleanup
    this.onlineHandler = () => {
      // When coming online, re-schedule notifications with latest data
      this.rescheduleNotificationsFromCache();
    };

    this.offlineHandler = () => {
      // When going offline, ensure notifications use cached data
      // Silent - no console log needed in production
    };

    // Listen for online/offline events
    window.addEventListener('online', this.onlineHandler);
    window.addEventListener('offline', this.offlineHandler);
  }

  /**
   * Setup date rollover handling
   */
  private setupDateRolloverHandling(): void {
    if (typeof window === 'undefined') {
      return;
    }

    // Check for date rollover on app load
    this.handleDateRollover();

    // Check periodically (every hour) for date rollover
    this.dateRolloverInterval = window.setInterval(() => {
      this.handleDateRollover();
    }, 60 * 60 * 1000) as unknown as number; // 1 hour
  }

  /**
   * Handle date rollover - re-schedule notifications for new date
   */
  private async handleDateRollover(): Promise<void> {
    const today = new Date();
    const todayKey = this.getDateKey(today);
    const cachedData = this.prayerTimeStore.getCachedPrayerTimes(todayKey);

    if (cachedData) {
      // Re-schedule notifications for today using cached data
      await this.scheduleNotificationsForDate(today, cachedData);
    } else {
      // If no cached data for today, try to get it
      // This will trigger a fetch if online, or use cache if offline
      // Use take(1) to auto-unsubscribe after first emission
      this.prayerTimeStore.getPrayerTimes(today)
        .pipe(take(1))
        .subscribe({
          next: (data) => {
            if (data) {
              this.scheduleNotificationsForDate(today, data);
            }
          },
          error: () => {
            // Silently handle errors - notifications are not critical
          }
        });
    }
  }

  /**
   * Re-schedule notifications from cache (offline mode)
   */
  private async rescheduleNotificationsFromCache(): Promise<void> {
    if (!this.isNotificationEnabled()) {
      return;
    }

    const today = new Date();
    const todayKey = this.getDateKey(today);
    const cachedData = this.prayerTimeStore.getCachedPrayerTimes(todayKey);

    if (cachedData) {
      await this.scheduleNotificationsForDate(today, cachedData);
    }
  }

  /**
   * Get date key in format YYYY-MM-DD
   */
  private getDateKey(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Request notification permission from user
   */
  async requestPermission(): Promise<NotificationPermissionStatus> {
    if (typeof window === 'undefined') {
      return NotificationPermissionStatus.NOT_SUPPORTED;
    }

    const deviceInfo = this.deviceDetection.deviceInfo();

    // Check if installation is required (iOS)
    if (deviceInfo.requiresInstallation) {
      throw new Error('INSTALLATION_REQUIRED');
    }

    // Check browser support
    if (!deviceInfo.supportsNotifications) {
      this.permissionStatus.set(NotificationPermissionStatus.NOT_SUPPORTED);
      return NotificationPermissionStatus.NOT_SUPPORTED;
    }

    if (Notification.permission === 'granted') {
      this.permissionStatus.set(NotificationPermissionStatus.GRANTED);
      return NotificationPermissionStatus.GRANTED;
    }

    if (Notification.permission === 'denied') {
      this.permissionStatus.set(NotificationPermissionStatus.DENIED);
      return NotificationPermissionStatus.DENIED;
    }

    try {
      const permission = await Notification.requestPermission();
      const status = permission as NotificationPermissionStatus;
      this.permissionStatus.set(status);
      return status;
    } catch (error) {
      console.error('Error requesting notification permission:', error);
      this.permissionStatus.set(NotificationPermissionStatus.DENIED);
      return NotificationPermissionStatus.DENIED;
    }
  }

  /**
   * Check current permission status
   */
  private checkPermissionStatus(): NotificationPermissionStatus {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return NotificationPermissionStatus.NOT_SUPPORTED;
    }

    switch (Notification.permission) {
      case 'granted':
        return NotificationPermissionStatus.GRANTED;
      case 'denied':
        return NotificationPermissionStatus.DENIED;
      default:
        return NotificationPermissionStatus.PROMPT;
    }
  }

  /**
   * Enable/disable notifications globally
   */
  async setNotificationsEnabled(enabled: boolean): Promise<void> {
    const currentSettings = this.settings();
    this.settings.set({
      ...currentSettings,
      enabled
    });
    this.saveSettings();

    if (enabled) {
      // Request permission if not already granted
      if (!this.isPermissionGranted()) {
        await this.requestPermission();
      }
    } else {
      // Cancel all scheduled notifications
      await this.cancelAllNotifications();
    }
  }

  /**
   * Toggle notification for a specific prayer
   */
  async togglePrayerNotification(
    prayerKey: string,
    enabled: boolean
  ): Promise<void> {
    if (!this.isPermissionGranted() && enabled) {
      const permission = await this.requestPermission();
      if (permission !== NotificationPermissionStatus.GRANTED) {
        throw new Error('Notification permission is required');
      }
    }

    const currentSettings = this.settings();
    const newPreferences = {
      ...currentSettings.preferences,
      [prayerKey]: enabled
    };

    this.settings.set({
      ...currentSettings,
      enabled: true, // Auto-enable if any prayer has notifications
      preferences: newPreferences
    });
    this.saveSettings();
  }

  /**
   * Check if notification is enabled for a specific prayer
   */
  isPrayerNotificationEnabled(prayerKey: string): boolean {
    const settings = this.settings();
    return (
      settings.enabled &&
      settings.preferences[prayerKey] === true &&
      this.isPermissionGranted()
    );
  }

  /**
   * Schedule notifications for a specific date
   * Works with both online and offline (uses cached data)
   */
  async scheduleNotificationsForDate(
    date: Date,
    prayerData: PrayerTimeData
  ): Promise<void> {
    if (!this.isNotificationEnabled()) {
      return;
    }

    // If offline and no data provided, try to get from cache
    if (!prayerData && !navigator.onLine) {
      const dateKey = this.getDateKey(date);
      const cachedData = this.prayerTimeStore.getCachedPrayerTimes(dateKey);
      if (cachedData) {
        prayerData = cachedData;
      } else {
        console.warn('No cached data available for notifications');
        return;
      }
    }

    if (!prayerData) {
      return;
    }

    const settings = this.settings();
    const timings = prayerData.timings;
    const prayerKeys: (keyof PrayerTimings)[] = [
      'fajr',
      'sunrise',
      'dhuhr',
      'asr',
      'maghrib',
      'isha'
    ];

    const prayerNames: Record<keyof PrayerTimings, string> = {
      fajr: 'Fajr',
      sunrise: 'Shuruq',
      dhuhr: 'Dhuhr',
      asr: 'Asr',
      maghrib: 'Maghrib',
      isha: 'Isha'
    };

    for (const prayerKey of prayerKeys) {
      const isEnabled = settings.preferences[prayerKey] === true;
      if (!isEnabled) {
        continue;
      }

      const timeString = timings[prayerKey];
      if (!timeString) {
        continue;
      }

      await this.schedulePrayerNotification(
        prayerKey,
        prayerNames[prayerKey],
        timeString,
        date,
        settings.advanceMinutes
      );
    }
  }

  /**
   * Schedule a single prayer notification
   * Notifies at exact prayer time (advanceMinutes can be set to notify before if needed)
   */
  private async schedulePrayerNotification(
    prayerKey: string,
    prayerName: string,
    timeString: string,
    date: Date,
    advanceMinutes: number
  ): Promise<void> {
    // Parse time string (format: "HH:mm" or "HH:mm AM/PM")
    const notificationTime = this.parseTimeString(timeString, date);
    if (!notificationTime) {
      console.warn(`Failed to parse time for ${prayerKey}: ${timeString}`);
      return;
    }

    // Calculate notification time (at exact prayer time, or advanceMinutes before if set)
    // Default advanceMinutes is 0, so notification will be at exact prayer time
    const notificationTimestamp =
      notificationTime.getTime() - advanceMinutes * 60 * 1000;
    const now = Date.now();

    // Only schedule if notification time is in the future
    if (notificationTimestamp <= now) {
      return;
    }

    // Cancel existing notification for this prayer if any
    await this.cancelPrayerNotification(prayerKey);

    // Schedule notification
    const delay = notificationTimestamp - now;

    // Use setTimeout for near-term notifications (within 24 hours)
    if (delay <= 24 * 60 * 60 * 1000) {
      const timeoutId = window.setTimeout(() => {
        this.showNotification(prayerName, timeString);
      }, delay);

      // Store timeout ID for cancellation
      this.storeNotificationTimeout(prayerKey, timeoutId);
    } else {
      // For notifications beyond 24 hours, store in localStorage
      await this.scheduleLongTermNotification(
        prayerKey,
        prayerName,
        timeString,
        notificationTimestamp
      );
    }
  }

  /**
   * Show a notification
   */
  private async showNotification(
    prayerName: string,
    prayerTime: string
  ): Promise<void> {
    if (!this.isPermissionGranted()) {
      return;
    }

    const deviceInfo = this.deviceDetection.deviceInfo();
    const options: NotificationOptions & { vibrate?: number[] } = {
      body: `Time for ${prayerName} prayer (${prayerTime})`,
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-96x96.png',
      tag: `prayer-${prayerName.toLowerCase()}`,
      requireInteraction: false,
      silent: false,
      data: {
        prayerName,
        prayerTime,
        url: '/prayer',
        type: 'prayer_notification'
      }
    };

    // Add vibration for mobile devices (if supported)
    if (deviceInfo.isMobile && 'vibrate' in navigator) {
      (options as any).vibrate = [200, 100, 200];
    }

    // Use Service Worker for notification (works when app is closed)
    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.ready;
        await registration.showNotification(`${prayerName} Prayer Time`, options);
        return;
      } catch (error) {
        console.warn(
          'Service Worker notification failed, falling back to regular notification:',
          error
        );
      }
    }

    // Fallback to regular notification API
    if ('Notification' in window) {
      const notification = new Notification(`${prayerName} Prayer Time`, options);
      
      // Handle click for regular notifications (when service worker not available)
      notification.onclick = (event) => {
        event.preventDefault();
        window.focus();
        // Navigate to prayer page if router is available
        if (window.location.pathname !== '/prayer') {
          window.location.href = '/prayer';
        }
      };
    }
  }

  /**
   * Cancel notification for a specific prayer
   */
  async cancelPrayerNotification(prayerKey: string): Promise<void> {
    const timeoutId = this.notificationTimeouts.get(prayerKey);
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
      this.notificationTimeouts.delete(prayerKey);
    }

    // Also remove from long-term scheduled notifications
    await this.removeScheduledNotification(prayerKey);
  }

  /**
   * Cancel all scheduled notifications
   */
  async cancelAllNotifications(): Promise<void> {
    const settings = this.settings();
    const prayerKeys = Object.keys(settings.preferences);

    for (const prayerKey of prayerKeys) {
      await this.cancelPrayerNotification(prayerKey);
    }
  }

  /**
   * Parse time string to Date object
   */
  private parseTimeString(timeString: string, date: Date): Date | null {
    const trimmed = timeString.trim();

    // Try 12-hour format first (e.g., "05:30 AM")
    const twelveHourMatch = trimmed.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (twelveHourMatch) {
      let hours = parseInt(twelveHourMatch[1], 10);
      const minutes = parseInt(twelveHourMatch[2], 10);
      const period = twelveHourMatch[3].toUpperCase();

      if (period === 'PM' && hours !== 12) {
        hours += 12;
      } else if (period === 'AM' && hours === 12) {
        hours = 0;
      }

      const result = new Date(date);
      result.setHours(hours, minutes, 0, 0);
      return result;
    }

    // Try 24-hour format (e.g., "05:30")
    const match = trimmed.match(/(\d{1,2}):(\d{2})/);
    if (match) {
      const hours = parseInt(match[1], 10);
      const minutes = parseInt(match[2], 10);
      const result = new Date(date);
      result.setHours(hours, minutes, 0, 0);
      return result;
    }

    return null;
  }

  /**
   * Store notification timeout ID
   */
  private storeNotificationTimeout(prayerKey: string, timeoutId: number): void {
    this.notificationTimeouts.set(prayerKey, timeoutId);
  }

  /**
   * Schedule notification for more than 24 hours in the future
   */
  private async scheduleLongTermNotification(
    prayerKey: string,
    prayerName: string,
    timeString: string,
    timestamp: number
  ): Promise<void> {
    const scheduled = this.getScheduledNotifications();
    scheduled.push({
      prayerKey,
      prayerName,
      scheduledTime: timestamp,
      notificationId: timeString
    });
    this.saveScheduledNotifications(scheduled);
  }

  /**
   * Get scheduled notifications from storage
   */
  private getScheduledNotifications(): ScheduledNotification[] {
    return this.userStore.prayerScheduledNotifications();
  }

  /**
   * Save scheduled notifications to storage
   */
  private saveScheduledNotifications(
    notifications: ScheduledNotification[]
  ): void {
    this.userStore.setPrayerScheduledNotifications(notifications);
  }

  /**
   * Remove a scheduled notification
   */
  private async removeScheduledNotification(prayerKey: string): Promise<void> {
    const scheduled = this.getScheduledNotifications();
    const filtered = scheduled.filter((n) => n.prayerKey !== prayerKey);
    this.saveScheduledNotifications(filtered);
  }

  /**
   * Check and trigger any due notifications (called on app load)
   */
  async checkScheduledNotifications(): Promise<void> {
    const scheduled = this.getScheduledNotifications();
    const now = Date.now();
    const due = scheduled.filter((n) => n.scheduledTime <= now);
    const future = scheduled.filter((n) => n.scheduledTime > now);

    // Trigger due notifications
    for (const notification of due) {
      await this.showNotification(notification.prayerName, notification.notificationId || '');
    }

    // Re-schedule future notifications
    this.saveScheduledNotifications(future);
    for (const notification of future) {
      const delay = notification.scheduledTime - now;
      if (delay <= 24 * 60 * 60 * 1000) {
        const timeoutId = window.setTimeout(() => {
          this.showNotification(notification.prayerName, notification.notificationId || '');
        }, delay);
        this.storeNotificationTimeout(notification.prayerKey, timeoutId);
      }
    }
  }

  /**
   * Load settings from localStorage
   */
  private loadSettings(): void {
    if (typeof localStorage === 'undefined') {
      return;
    }

    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        const settings = JSON.parse(stored) as NotificationSettings;
        this.settings.set(settings);
      }
    } catch (error) {
      console.warn('Failed to load notification settings:', error);
    }
  }

  /**
   * Save settings to localStorage
   */
  private saveSettings(): void {
    if (typeof localStorage === 'undefined') {
      return;
    }

    try {
      localStorage.setItem(
        this.STORAGE_KEY,
        JSON.stringify(this.settings())
      );
    } catch (error) {
      console.warn('Failed to save notification settings:', error);
    }
  }

  /**
   * Set advance minutes (how many minutes before prayer to notify)
   * Default is 0 (notify at exact prayer time)
   * Set to positive value to notify before prayer time
   */
  setAdvanceMinutes(minutes: number): void {
    const currentSettings = this.settings();
    this.settings.set({
      ...currentSettings,
      advanceMinutes: Math.max(0, Math.min(60, minutes)) // Clamp between 0-60 (0 = exact time)
    });
    this.saveSettings();
  }
}


import { Injectable, effect, inject, signal, untracked } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { SwPush } from '@angular/service-worker';
import { firstValueFrom } from 'rxjs';
import { NotificationService } from './notification.service';
import { SettingsService } from './settings.service';
import { PrayerTimeStore } from '../store/prayer-time.store';
import { Logger } from '../core/logger.util';
import { TimeFormat } from './time-format.types';

const SYNC_STORAGE_KEY = 'push-reminder-sync';
/** Re-send unchanged settings this often, so the server's copy never goes stale. */
const RESYNC_MS = 7 * 24 * 60 * 60 * 1000;
const SYNC_DEBOUNCE_MS = 1500;

interface SyncRecord {
  payload: string;
  at: number;
}

/**
 * Keeps the server's push reminders in step with the prayers the user has turned on,
 * so reminders arrive even when the app is closed. The in-app timers in
 * NotificationService stay as a backup; both use the same notification tag.
 */
@Injectable({ providedIn: 'root' })
export class PushReminderService {
  private readonly swPush = inject(SwPush);
  private readonly http = inject(HttpClient);
  private readonly notifications = inject(NotificationService);
  private readonly settings = inject(SettingsService);
  private readonly prayerStore = inject(PrayerTimeStore);

  /** True once the server has confirmed reminders for this device. */
  readonly active = signal(false);

  private syncTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    if (!this.swPush.isEnabled) return;

    effect(() => {
      // What the user chose, whatever the permission reads right now: only their own "all off"
      // removes this device from the server
      const { enabled, preferences, silent } = this.notifications.currentSettings();
      const prayers = enabled ? Object.keys(preferences).filter(key => preferences[key]) : [];
      const quiet = prayers.filter(key => silent?.[key]);
      const permitted = this.notifications.isPermissionGranted();
      const location = this.prayerStore.currentLocation();
      const method = this.settings.calcMethod();
      const school = this.settings.asrSchool();
      // The reminder's text is written on the server, so it needs the clock the person chose
      const hour12 = this.settings.currentTimeFormat() === TimeFormat.TWELVE_HOUR;

      untracked(() => {
        clearTimeout(this.syncTimer);
        this.syncTimer = setTimeout(() => this.sync(prayers, quiet, permitted, location, method, school, hour12), SYNC_DEBOUNCE_MS);
      });
    });
  }

  private async sync(
    prayers: string[],
    silent: string[],
    permitted: boolean,
    location: { latitude: number; longitude: number } | null,
    method: number | null,
    school: number,
    hour12: boolean
  ): Promise<void> {
    try {
      if (!prayers.length) {
        // Everything turned off: remove this device from the server and drop the subscription
        const existing = await firstValueFrom(this.swPush.subscription);
        if (existing) {
          await firstValueFrom(this.http.post('/api/push/subscribe', { subscription: existing.toJSON(), prayers: [] }));
          await this.swPush.unsubscribe();
        }
        this.active.set(false);
        this.writeRecord(null);
        return;
      }
      if (!permitted) {
        // Reminders are wanted but not allowed right now: keep the server's copy, so they carry
        // on if the permission was only misread, and nothing is lost if it comes back
        this.active.set(false);
        return;
      }
      if (!location) return; // wait for a location

      const subscription = await this.getSubscription();
      if (!subscription) return;

      const body = {
        subscription: subscription.toJSON(),
        lat: Math.round(location.latitude * 100) / 100,
        lng: Math.round(location.longitude * 100) / 100,
        method,
        school,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        prayers,
        silent,
        hour12,
      };
      const payload = JSON.stringify(body);
      const previous = this.readRecord();
      if (previous?.payload !== payload || Date.now() - previous.at >= RESYNC_MS) {
        await firstValueFrom(this.http.post('/api/push/subscribe', body));
        this.writeRecord({ payload, at: Date.now() });
      }
      this.active.set(true);
    } catch (error) {
      // Server not configured or offline: in-app reminders still work while the app is open
      this.active.set(false);
      Logger.warn('Push reminder sync failed:', error);
    }
  }

  /** The browser's push subscription, created if needed (requires notification permission). */
  private async getSubscription(): Promise<PushSubscription | null> {
    const existing = await firstValueFrom(this.swPush.subscription);
    if (existing) return existing;
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return null;

    const { key } = await firstValueFrom(this.http.get<{ key: string }>('/api/push/key'));
    return this.swPush.requestSubscription({ serverPublicKey: key });
  }

  private readRecord(): SyncRecord | null {
    try {
      return JSON.parse(localStorage.getItem(SYNC_STORAGE_KEY) ?? 'null');
    } catch {
      return null;
    }
  }

  private writeRecord(record: SyncRecord | null): void {
    try {
      if (record) localStorage.setItem(SYNC_STORAGE_KEY, JSON.stringify(record));
      else localStorage.removeItem(SYNC_STORAGE_KEY);
    } catch {
      // Storage unavailable: we'll just sync again next time
    }
  }
}

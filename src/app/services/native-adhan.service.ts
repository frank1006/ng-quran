import { Injectable, effect, inject, signal, untracked } from '@angular/core';
import { PRAYER_KEYS, PrayerKey, prayerTimes } from '../../../shared/prayer-times';
import { AdhanAlarm, AlarmStatus, LateRing, PrayerAlarm, isNativeApp } from '../core/native-app';
import { Logger } from '../core/logger.util';
import { PrayerTimeStore } from '../store/prayer-time.store';
import { NotificationService } from './notification.service';
import { SettingsService } from './settings.service';
import { TimeFormat } from './time-format.types';

/** How far ahead the phone gets its alarms; opening the app tops them up */
const DAYS_AHEAD = 30;
const SYNC_DEBOUNCE_MS = 800;
/**
 * Prayers from this long ago stay in the list: the phone may not have rung one yet (it can come
 * a little late), and the app opening right at prayer time must not drop it. The phone remembers
 * which have rung, so none rings twice (AlarmStore.MAX_LATE_MS, android/.../adhan).
 */
const KEEP_DUE_MS = 10 * 60_000;
/** Ishraq starts about this long after sunrise (same as the web reminders) */
const ISHRAQ_AFTER_SUNRISE_MIN = 20;

const PRAYER_NAMES: Record<PrayerKey, string> = {
  fajr: 'Fajr', sunrise: 'Shuruq', dhuhr: 'Dhuhr', asr: 'Asr', maghrib: 'Maghrib', isha: 'Isha',
};

/**
 * In the Android app, hands the prayers the person turned on to the phone's own alarms (the
 * web push reminders are off there). Each prayer arrives as its bell is set: the full adhan, the
 * phone's notification sound, or vibrating without sound (Shuruq has no adhan).
 */
@Injectable({ providedIn: 'root' })
export class NativeAdhanService {
  private readonly notifications = inject(NotificationService);
  private readonly settings = inject(SettingsService);
  private readonly prayerStore = inject(PrayerTimeStore);

  /** False when Android may ring late because "Alarms & reminders" isn't allowed (Android 12+) */
  readonly ringsOnTime = signal(true);
  /** False while the phone may pause QuranFlow to save battery (the adhan can then come late) */
  readonly batteryUnrestricted = signal(true);
  /**
   * A reminder that rang late, for the prayer screen's note. Nothing asks about battery up front:
   * alarms are alarm clocks, which ring on time almost everywhere; this speaks up only when the
   * phone actually held one back.
   */
  readonly lateRing = signal<LateRing | null>(null);

  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    if (!isNativeApp) return;

    effect(() => {
      // Read here so a change to any of them hands the phone a new set
      this.notifications.currentSettings();
      this.notifications.isPermissionGranted();
      this.prayerStore.currentLocation();
      this.settings.calcMethod();
      this.settings.asrSchool();
      this.settings.currentTimeFormat();
      untracked(() => this.syncSoon());
    });

    // Back in the app (also the next day): keep a full month of alarms ahead
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') this.syncSoon();
    });
  }

  /** Plays the adhan now so the person can hear it and set the volume (Fajr has its own) */
  testAdhan(prayer: 'fajr' | 'dhuhr'): Promise<void> {
    return AdhanAlarm.test({ prayer });
  }

  /** Plays the notification sound once, or vibrates once, as that reminder would */
  preview(kind: 'sound' | 'vibrate'): Promise<void> {
    return AdhanAlarm.preview({ kind });
  }

  /** Stops an adhan that is playing (a test, or one at prayer time) */
  stopAdhan(): Promise<void> {
    return AdhanAlarm.stop();
  }

  /** QuranFlow's page in the phone's settings, to set its battery use to Unrestricted */
  openBatterySettings(): Promise<void> {
    return AdhanAlarm.openBatterySettings();
  }

  /** The note about a late reminder is closed (or its settings opened): it doesn't come back for that one */
  async dismissLateRing(): Promise<void> {
    this.lateRing.set(null);
    try {
      this.apply(await AdhanAlarm.dismissLateRing());
    } catch (error) {
      Logger.warn('Could not dismiss the late reminder note:', error);
    }
  }

  /** Opens the phone's "Alarms & reminders" setting for the app */
  openAlarmSettings(): Promise<void> {
    return AdhanAlarm.openExactAlarmSettings();
  }

  private syncSoon(): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.sync(), SYNC_DEBOUNCE_MS);
  }

  private async sync(): Promise<void> {
    try {
      const alarms = this.alarms();
      if (!alarms) return; // no location yet: keep what the phone has
      this.apply(alarms.length ? await AdhanAlarm.schedule({ alarms }) : await AdhanAlarm.cancelAll().then(() => AdhanAlarm.status()));
    } catch (error) {
      Logger.warn('Could not set the prayer alarms:', error);
    }
  }

  private apply(status: AlarmStatus): void {
    this.ringsOnTime.set(status.exactAlarms);
    this.batteryUnrestricted.set(status.batteryUnrestricted);
    this.lateRing.set(status.lateRing ?? null);
  }

  /** The alarms for the next month, or null while the place isn't known */
  private alarms(): PrayerAlarm[] | null {
    const { enabled, preferences } = this.notifications.currentSettings();
    const chosen = PRAYER_KEYS.filter(key => preferences[key] === true);
    if (!enabled || !chosen.length || !this.notifications.isPermissionGranted()) return [];

    const location = this.prayerStore.currentLocation();
    if (!location) return null;
    const method = this.settings.calcMethod();
    const school = this.settings.asrSchool();
    const clock = new Intl.DateTimeFormat('en', this.settings.currentTimeFormat() === TimeFormat.TWELVE_HOUR
      ? { hour: 'numeric', minute: '2-digit', hourCycle: 'h12' }
      : { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

    const now = Date.now();
    const today = new Date();
    const alarms: PrayerAlarm[] = [];
    for (let i = 0; i < DAYS_AHEAD; i++) {
      const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
      const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
      const times = prayerTimes(location.latitude, location.longitude, day, method, school);
      for (const key of chosen) {
        const at = times[key].getTime();
        if (Number.isNaN(at) || at < now - KEEP_DUE_MS) continue;
        const name = PRAYER_NAMES[key];
        const time = clock.format(at);
        const reminder = this.notifications.prayerMode(key);
        const mode = reminder === 'silent' ? 'vibrate' : reminder === 'adhan' ? 'adhan' : 'sound';
        alarms.push(key === 'sunrise'
          ? {
            id: `${day}|${key}`, at, prayer: key, mode,
            title: `${name} · Sunrise ${time}`,
            body: `Fajr time has ended. Ishraq can be prayed from about ${clock.format(at + ISHRAQ_AFTER_SUNRISE_MIN * 60_000)}.`,
          }
          : {
            id: `${day}|${key}`, at, prayer: key, mode,
            title: `${name} Prayer Time`,
            body: `Time for ${name} prayer (${time})`,
          });
      }
    }
    return alarms;
  }
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

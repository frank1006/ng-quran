import { Injectable, inject } from '@angular/core';
import { firstValueFrom, timeout } from 'rxjs';
import { PrayerTimeStore } from '../../store/prayer-time.store';
import { SettingsService, CALCULATION_METHODS } from '../../services/settings.service';
import { QiblaService } from '../qibla/services/qibla.service';
import { formatTime } from '../../services/time-format.util';
import { PrayerTimings } from '../../services/prayer-time.types';

/** Mirrors AppContext in api/_lib/app-tools.ts */
export interface QFlowAppContext {
  place?: { city?: string; country?: string; lat?: number; lng?: number };
  prayers?: {
    date: string;
    times: Record<string, string>;
    current?: string;
    next?: { name: string; at: string; inMinutes: number };
    tomorrowFajr?: string;
    method?: string;
    asrSchool?: string;
  };
  qibla?: { bearing: number; direction: string; distanceKm: number };
  units?: { temperature: 'C' | 'F'; distance: 'km' | 'mi' };
  now?: string;
}

const KAABA = { latitude: 21.4225, longitude: 39.8262 };
const DIRECTIONS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
/** Prayer starts in order; Sunrise ends Fajr's time */
const ORDER: { key: keyof PrayerTimings; name: string }[] = [
  { key: 'fajr', name: 'Fajr' },
  { key: 'sunrise', name: 'Sunrise' },
  { key: 'dhuhr', name: 'Dhuhr' },
  { key: 'asr', name: 'Asr' },
  { key: 'maghrib', name: 'Maghrib' },
  { key: 'isha', name: 'Isha' },
];
/** Longer than the store's once-a-session GPS re-check (5s), which warmUp() usually covers */
const WAIT_MS = 6000;

/**
 * The person's day as the app has it, sent with each QuranFlow AI question so it can answer
 * "when is the next prayer?", "which way is the Qibla?" or "masjids near me?" from the app's own
 * data and settings. Uses only a location the app already has (never asks for one), and is
 * best-effort: anything not ready in time is left out.
 */
@Injectable({ providedIn: 'root' })
export class QFlowAppContextService {
  private readonly prayerStore = inject(PrayerTimeStore);
  private readonly settings = inject(SettingsService);
  private readonly qibla = inject(QiblaService);

  /**
   * Called when QuranFlow AI opens: gets today's and tomorrow's times (and the session's location
   * re-check) going, so they're ready by the time a question is sent.
   */
  warmUp(): void {
    if (!this.prayerStore.currentLocation()) return;
    const now = new Date();
    void this.times(now);
    void this.times(new Date(now.getTime() + 86_400_000));
  }

  async build(): Promise<QFlowAppContext> {
    const format = this.settings.currentTimeFormat();
    const now = new Date();
    const context: QFlowAppContext = {
      units: { temperature: this.settings.temperatureUnit(), distance: this.settings.distanceUnit() },
      now: `${now.toLocaleDateString('en', { weekday: 'short' })} ${formatTime(hhmm(now), format)}`,
    };

    const location = this.prayerStore.currentLocation();
    if (!location) return context;
    const { latitude, longitude } = location;

    const bearing = this.qibla.calculateQiblaBearing(latitude, longitude);
    context.qibla = {
      bearing: Math.round(bearing),
      direction: DIRECTIONS[Math.round(bearing / 45) % 8],
      distanceKm: Math.round(distanceKm(location, KAABA)),
    };

    const tomorrow = new Date(now.getTime() + 86_400_000);
    const [info, today, next] = await Promise.all([
      this.qibla.getLocationInfo(latitude, longitude).catch(() => null),
      this.times(now),
      this.times(tomorrow),
    ]);
    context.place = { city: info?.city, country: info?.country, lat: latitude, lng: longitude };

    if (today) {
      const school = this.settings.asrSchool();
      context.prayers = {
        date: today.date,
        times: Object.fromEntries(ORDER.map(p => [p.name, formatTime(today.timings[p.key], format)])),
        ...currentAndNext(today.timings, now, format, next?.timings.fajr),
        tomorrowFajr: next ? formatTime(next.timings.fajr, format) : undefined,
        // null = Automatic: the local authority for the location
        method: CALCULATION_METHODS.find(m => m.id === this.settings.calcMethod())?.name ?? 'Automatic (local authority for this location)',
        asrSchool: school === 1 ? 'Hanafi (later Asr)' : 'Standard (Shafi, Maliki, Hanbali)',
      };
    }
    return context;
  }

  /** From the app's cache (it keeps a few days around today); left out if not ready in time */
  private times(date: Date) {
    return firstValueFrom(this.prayerStore.getPrayerTimes(date).pipe(timeout(WAIT_MS))).catch(() => null);
  }
}

function currentAndNext(timings: PrayerTimings, now: Date, format: Parameters<typeof formatTime>[1], tomorrowFajr?: string) {
  const minutes = now.getHours() * 60 + now.getMinutes();
  const starts = ORDER.map(p => ({ ...p, at: toMinutes(timings[p.key]) })).filter(p => !isNaN(p.at));
  const started = starts.filter(p => p.at <= minutes);
  const last = started.at(-1);
  // Before Fajr it's still Isha's time; between Sunrise and Dhuhr there's no prayer due
  const current = !last ? 'Isha' : last.key === 'sunrise' ? undefined : last.name;

  const upcoming = starts.find(p => p.at > minutes && p.key !== 'sunrise');
  if (upcoming) {
    return { current, next: { name: upcoming.name, at: formatTime(timings[upcoming.key], format), inMinutes: upcoming.at - minutes } };
  }
  if (tomorrowFajr) {
    const at = toMinutes(tomorrowFajr);
    return { current, next: { name: 'Fajr (tomorrow)', at: formatTime(tomorrowFajr, format), inMinutes: 24 * 60 - minutes + at } };
  }
  return { current };
}

function toMinutes(time24: string): number {
  const [h, m] = (time24 ?? '').split(':').map(Number);
  return h * 60 + m;
}

function hhmm(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function distanceKm(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const rad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * rad;
  const dLng = (b.longitude - a.longitude) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

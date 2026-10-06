import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { HijriMethod, sightingProfileFor } from './hijri-countries';
import { HIJRI_MONTH_NAMES, ISLAMIC_EVENTS, IslamicEvent, isWhiteDay } from './islamic-events';

export interface HijriDate {
  day: number;
  /** 1 = Muharram … 12 = Dhu al-Hijjah */
  month: number;
  year: number;
  monthName: string;
}

export interface DatedEvent {
  event: IslamicEvent;
  date: Date;
  hijri: HijriDate;
}

/** User's moon-sighting choice: null = automatic for their country */
export type HijriOffset = -1 | 0 | 1;

const OFFSET_KEY = 'hijri-offset';
const COUNTRY_KEY = 'hijri-country';
const COUNTRY_NAME_KEY = 'hijri-country-name';
const SHOW_VARIED_KEY = 'hijri-show-varied';
const MONTH_CACHE_PREFIX = 'hijri-month:';

/** Aladhan's month calendar response, reduced to what we use */
interface AladhanCalendarDay {
  gregorian: { date: string }; // DD-MM-YYYY
  hijri: { day: string; month: { number: number }; year: string };
}

/**
 * The one source of Hijri dates for the whole app (Prayer header, calendar, events).
 *
 * Dates come from Aladhan's month calendars for the region's method (fetched once per month and
 * kept on the device), then shifted by the moon-sighting offset: automatic for the country,
 * or the user's own choice. Until a month is fetched, or offline, the phone's built-in
 * Umm al-Qura calendar fills in.
 */
@Injectable({ providedIn: 'root' })
export class HijriCalendarService {
  private readonly http = inject(HttpClient);

  private readonly countryCode = signal<string | null>(read(COUNTRY_KEY));
  private readonly countryName = signal<string | null>(read(COUNTRY_NAME_KEY));
  /** The user's own offset; null = automatic */
  readonly userOffset = signal<HijriOffset | null>(parseOffset(read(OFFSET_KEY)));
  /** Show Mawlid and Shab-e-Barat */
  readonly showVaried = signal<boolean>(read(SHOW_VARIED_KEY) !== 'false');

  readonly profile = computed(() => sightingProfileFor(this.countryCode()));
  readonly offset = computed<HijriOffset>(() => this.userOffset() ?? this.profile().offset);
  readonly method = computed<HijriMethod>(() => this.profile().method);
  readonly isAutomatic = computed(() => this.userOffset() === null);

  /** "Pakistan · local moon sighting, usually a day after Saudi Arabia" */
  readonly automaticLabel = computed(() => {
    const country = this.countryName();
    const description = this.profile().description;
    return country ? `${country} · ${description}` : description;
  });

  /** Bumped when a month arrives from Aladhan, so dates shown recompute */
  private readonly loaded = signal(0);
  /** method:YYYY-MM → (gregorian YYYY-MM-DD → Hijri) */
  private readonly months = new Map<string, Map<string, HijriDate>>();
  private readonly pending = new Map<string, Promise<void>>();
  /** Months are fetched one at a time; Aladhan turns away bursts of requests */
  private queue: Promise<void> = Promise.resolve();

  /** Set from the location lookup (Nominatim's ISO country code) */
  setCountry(code: string | null | undefined, name?: string | null): void {
    if (name && name !== 'Unknown Country' && name !== this.countryName()) {
      this.countryName.set(name);
      write(COUNTRY_NAME_KEY, name);
    }
    if (!code) return;
    const normalized = code.toLowerCase();
    if (normalized === this.countryCode()) return;
    this.countryCode.set(normalized);
    write(COUNTRY_KEY, normalized);
  }

  setUserOffset(offset: HijriOffset | null): void {
    this.userOffset.set(offset);
    write(OFFSET_KEY, offset === null ? null : String(offset));
  }

  setShowVaried(show: boolean): void {
    this.showVaried.set(show);
    write(SHOW_VARIED_KEY, String(show));
  }

  /** Hijri date for a Gregorian day, with the moon-sighting offset applied */
  toHijri(date: Date): HijriDate {
    this.loaded(); // recompute when months arrive
    const shifted = addDays(startOfDay(date), this.offset());
    const method = this.method();
    const month = this.months.get(monthKey(method, shifted)) ?? this.restoreMonth(method, shifted);
    const fromAladhan = month?.get(dayKey(shifted));
    if (!month && worthFetching(method, shifted)) void this.ensureMonth(shifted);
    return fromAladhan ?? umAlQura(shifted);
  }

  /** "25 Rabi' al-Thani 1448 AH" */
  format(date: Date): string {
    const h = this.toHijri(date);
    return `${h.day} ${h.monthName} ${h.year} AH`;
  }

  /** Events on a Gregorian day (honours the Mawlid / Shab-e-Barat setting) */
  eventsOn(date: Date): IslamicEvent[] {
    const h = this.toHijri(date);
    return this.visibleEvents().filter(e => e.month === h.month && e.day === h.day);
  }

  isWhiteDay(date: Date): boolean {
    const h = this.toHijri(date);
    return isWhiteDay(h.month, h.day);
  }

  /** Events from `from` (inclusive) over the next `days` days, in date order */
  upcoming(from: Date, days = 400): DatedEvent[] {
    const events = this.visibleEvents();
    const result: DatedEvent[] = [];
    const start = startOfDay(from);
    for (let i = 0; i < days; i++) {
      const date = addDays(start, i);
      const hijri = this.toHijri(date);
      for (const event of events) {
        if (event.month === hijri.month && event.day === hijri.day) result.push({ event, date, hijri });
      }
    }
    return result;
  }

  /** Fetch a Gregorian month's Hijri dates (for the region's method) once and keep them */
  ensureMonth(date: Date): Promise<void> {
    const method = this.method();
    const key = monthKey(method, date);
    if (this.months.has(key)) return Promise.resolve();
    const existing = this.pending.get(key);
    if (existing) return existing;

    const url = `https://api.aladhan.com/v1/gToHCalendar/${date.getMonth() + 1}/${date.getFullYear()}?calendarMethod=${method}`;
    const request = this.queue
      .then(() => firstValueFrom(this.http.get<{ data: AladhanCalendarDay[] }>(url)))
      .then(response => {
        const month = new Map<string, HijriDate>();
        for (const d of response.data ?? []) {
          const [dd, mm, yyyy] = d.gregorian.date.split('-');
          month.set(`${yyyy}-${mm}-${dd}`, hijriOf(Number(d.hijri.day), d.hijri.month.number, Number(d.hijri.year)));
        }
        if (month.size === 0) return;
        this.months.set(key, month);
        write(MONTH_CACHE_PREFIX + key, JSON.stringify([...month]));
        this.loaded.update(n => n + 1);
      })
      .catch(() => { /* offline or unavailable: the built-in calendar stays in use */ })
      .finally(() => this.pending.delete(key));
    this.queue = request;
    this.pending.set(key, request);
    return request;
  }

  private visibleEvents(): IslamicEvent[] {
    return this.showVaried() ? ISLAMIC_EVENTS : ISLAMIC_EVENTS.filter(e => e.kind !== 'varied');
  }

  private restoreMonth(method: HijriMethod, date: Date): Map<string, HijriDate> | undefined {
    const key = monthKey(method, date);
    const raw = read(MONTH_CACHE_PREFIX + key);
    if (!raw) return undefined;
    try {
      const month = new Map<string, HijriDate>(JSON.parse(raw));
      this.months.set(key, month);
      return month;
    } catch {
      return undefined;
    }
  }
}

/**
 * Aladhan's sighting corrections (HJCoSA) only exist around the current month; further out its
 * calendar is the Umm al-Qura calculation the phone already has. So only nearby months are
 * fetched. Diyanet's calendar differs from Umm al-Qura, so its months are fetched within a year.
 */
function worthFetching(method: HijriMethod, date: Date): boolean {
  const now = new Date();
  const monthsAway = (date.getFullYear() - now.getFullYear()) * 12 + date.getMonth() - now.getMonth();
  return method === 'DIYANET' ? monthsAway >= -2 && monthsAway <= 13 : monthsAway >= -2 && monthsAway <= 2;
}

function hijriOf(day: number, month: number, year: number): HijriDate {
  return { day, month, year, monthName: HIJRI_MONTH_NAMES[month - 1] ?? '' };
}

/** The phone's built-in Umm al-Qura calendar, used until Aladhan's month is available */
const umAlQuraFormat = (() => {
  try {
    return new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn', { day: 'numeric', month: 'numeric', year: 'numeric' });
  } catch {
    return null;
  }
})();

function umAlQura(date: Date): HijriDate {
  const parts = umAlQuraFormat?.formatToParts(date) ?? [];
  const get = (type: string) => Number(parts.find(p => p.type === type)?.value ?? NaN);
  const day = get('day');
  const month = get('month');
  const year = Number(String(parts.find(p => p.type === 'year')?.value ?? '').replace(/\D/g, ''));
  return hijriOf(day || 1, month || 1, year || 0);
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function monthKey(method: HijriMethod, date: Date): string {
  return `${method}:${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

function parseOffset(value: string | null): HijriOffset | null {
  return value === '-1' || value === '0' || value === '1' ? (Number(value) as HijriOffset) : null;
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // storage unavailable (private mode): the choice lasts for this session
  }
}

import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { HijriCalendarService } from '../../calendar/hijri-calendar.service';
import { AuthService } from '../../core/auth.service';
import { QFlowAppContextService } from './qflow-app-context';
import { isWhiteDay } from '../../calendar/islamic-events';

/** Mirrors api/_lib/qflow.ts */
export interface QFlowAyah {
  ref: string;
  surah: number;
  ayah: number;
  surahName: string;
  surahNameArabic: string;
  ar: string;
  en: string;
  ur: string;
}

export interface QFlowAnswer {
  mode: 'ai' | 'search-only';
  answer: string | null;
  ayahs: QFlowAyah[];
  /** Questions left today (the server's count) */
  quota?: QFlowQuota;
  /** Buttons under the answer that open part of the app (e.g. the Qibla compass) */
  actions?: QFlowAction[];
  /** Du'as the answer cites (Quran and Sunnah, with sources) */
  duas?: QFlowDua[];
  /** Names of Allah the answer cites */
  names?: QFlowName[];
  /** Hadith the answer cites */
  hadiths?: QFlowHadith[];
}

/** Mirrors HadithTranslationText in api/_lib/hadith.ts: one language of HadeethEnc.com's, verbatim */
export interface QFlowHadithTranslationText {
  text: string;
  grade?: string;
  attribution?: string;
}

/** Mirrors HadithTranslation in api/_lib/hadith.ts */
export interface QFlowHadithTranslation {
  source: 'HadeethEnc';
  id: string;
  en?: QFlowHadithTranslationText;
  ur?: QFlowHadithTranslationText;
}

/** Mirrors Hadith in api/_lib/hadith.ts */
export interface QFlowHadith {
  ref: string;
  book: string;
  bookName: string;
  number: string;
  /** The Arabic (public domain) */
  ar: string;
  /** Only when HadeethEnc has this hadith; the collection's own translations aren't shown */
  translation?: QFlowHadithTranslation;
  grades: { grader: string; grade: string }[];
  collectionGrade?: string;
  /** Only part of the text was sent; QFlowService.fullHadith has all of it */
  shortened?: boolean;
}

export type QFlowHadithText = Pick<QFlowHadith, 'ref' | 'ar' | 'translation'>;

/** Mirrors NameOfAllah in api/_lib/names.ts */
export interface QFlowName {
  number: number;
  arabic: string;
  transliteration: string;
  english: string;
  meaning: string;
}

/** Mirrors Dua in api/_lib/duas.ts */
export interface QFlowDua {
  id: number;
  title: string;
  arabic: string;
  transliteration: string;
  translation: string;
  source: string;
  repeat: number;
}

export interface QFlowAction {
  label: string;
  route: string;
  query?: Record<string, string>;
  /** Surah number: the button starts its recitation */
  play?: number;
}

/** The daily question limit (api/_lib/qflow-limit.ts) */
export interface QFlowQuota {
  /** null when there's no daily limit (QFLOW_DAILY_LIMIT=0) */
  limit: number | null;
  used: number;
  remaining: number | null;
  resetsAt: string;
  /** The whole app has used today's questions (the global cap) */
  busyToday?: boolean;
}

export interface QFlowTurn {
  role: 'user' | 'assistant';
  content: string;
}

const DAY_MS = 86_400_000;
/** Recent and coming events QFlow can talk about: a full Hijri year ahead, so every event has a date */
const EVENTS_FROM_DAYS = -30;
const EVENTS_TO_DAYS = 400;

/**
 * Talks to /api/qflow/ask, signed in (the API answers signed-in users only), sending the
 * person's day as the app has it (QFlowAppContextService: place, prayer times, Qibla). Dates are worked out here by the app's own HijriCalendarService
 * (with the user's moon-sighting setting and hidden events), so QFlow never calculates them.
 */
@Injectable({ providedIn: 'root' })
export class QFlowService {
  private readonly http = inject(HttpClient);
  private readonly hijri = inject(HijriCalendarService);
  private readonly auth = inject(AuthService);
  private readonly appContext = inject(QFlowAppContextService);

  async ask(question: string, history: QFlowTurn[]): Promise<QFlowAnswer> {
    const [headers, app] = await Promise.all([this.authHeaders(), this.appContext.build()]);
    return firstValueFrom(
      this.http.post<QFlowAnswer>(
        '/api/qflow/ask',
        { question, history, calendar: this.calendar(), app, timeZone: timeZone() },
        { headers },
      ),
    );
  }

  /** All of a hadith an answer showed shortened (uses no question) */
  async fullHadith(ref: string): Promise<QFlowHadithText> {
    return firstValueFrom(
      this.http.get<QFlowHadithText>('/api/qflow/hadith', { params: { ref }, headers: await this.authHeaders() }),
    );
  }

  /** Questions left today, without using one */
  async quota(): Promise<QFlowQuota> {
    return firstValueFrom(
      this.http.get<QFlowQuota>('/api/qflow/quota', { params: { tz: timeZone() }, headers: await this.authHeaders() }),
    );
  }

  private async authHeaders(): Promise<Record<string, string>> {
    const token = await this.auth.accessToken();
    return token ? { authorization: `Bearer ${token}` } : {};
  }

  private calendar() {
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const hijriToday = this.hijri.toHijri(today);
    const from = new Date(today.getTime() + EVENTS_FROM_DAYS * DAY_MS);
    const events = this.hijri.upcoming(from, EVENTS_TO_DAYS - EVENTS_FROM_DAYS).map(({ event, date, hijri }) => ({
      name: event.name,
      date: isoDate(date),
      hijri: `${hijri.day} ${hijri.monthName} ${hijri.year} AH`,
      daysFromToday: Math.round((startOfDay(date) - startOfDay(today)) / DAY_MS),
      description: event.description,
    }));
    return {
      today: {
        date: isoDate(today),
        weekday: today.toLocaleDateString('en', { weekday: 'long' }),
        hijri: this.hijri.format(today),
        whiteDay: isWhiteDay(hijriToday.month, hijriToday.day),
      },
      sighting: this.hijri.isAutomatic()
        ? this.hijri.automaticLabel()
        : `Adjusted by the user (${this.hijri.offset() > 0 ? '+' : ''}${this.hijri.offset()} day)`,
      events,
    };
  }
}

/** The user's time zone: the daily limit resets at their own midnight */
function timeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

function isoDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

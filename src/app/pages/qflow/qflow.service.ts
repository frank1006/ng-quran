import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { HijriCalendarService } from '../../calendar/hijri-calendar.service';
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
}

export interface QFlowTurn {
  role: 'user' | 'assistant';
  content: string;
}

const DAY_MS = 86_400_000;
/** Recent and coming events QFlow can talk about */
const EVENTS_FROM_DAYS = -30;
const EVENTS_TO_DAYS = 200;

/**
 * Talks to /api/qflow/ask. Dates are worked out here by the app's own HijriCalendarService
 * (with the user's moon-sighting setting and hidden events), so QFlow never calculates them.
 */
@Injectable({ providedIn: 'root' })
export class QFlowService {
  private readonly http = inject(HttpClient);
  private readonly hijri = inject(HijriCalendarService);

  ask(question: string, history: QFlowTurn[]): Promise<QFlowAnswer> {
    return firstValueFrom(
      this.http.post<QFlowAnswer>('/api/qflow/ask', { question, history, calendar: this.calendar() }),
    );
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

function isoDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

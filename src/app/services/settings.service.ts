import { Injectable, signal, computed } from '@angular/core';

export enum TimeFormat {
  TWELVE_HOUR = '12h',
  TWENTY_FOUR_HOUR = '24h'
}

const TIME_FORMAT_KEY = 'app_time_format';

@Injectable({
  providedIn: 'root'
})
export class SettingsService {
  private readonly timeFormat = signal<TimeFormat>(this.loadTimeFormat());
  readonly currentTimeFormat = computed(() => this.timeFormat());

  constructor() {
    const savedFormat = this.loadTimeFormat();
    if (savedFormat) {
      this.timeFormat.set(savedFormat);
    }
  }

  setTimeFormat(format: TimeFormat): void {
    this.timeFormat.set(format);
    this.saveTimeFormat(format);
  }

  private loadTimeFormat(): TimeFormat {
    if (typeof localStorage === 'undefined') {
      return TimeFormat.TWENTY_FOUR_HOUR;
    }

    try {
      const stored = localStorage.getItem(TIME_FORMAT_KEY);
      if (stored === TimeFormat.TWELVE_HOUR || stored === TimeFormat.TWENTY_FOUR_HOUR) {
        return stored as TimeFormat;
      }
    } catch (e) {
      console.warn('Failed to load time format from localStorage', e);
    }

    return TimeFormat.TWENTY_FOUR_HOUR;
  }

  private saveTimeFormat(format: TimeFormat): void {
    if (typeof localStorage === 'undefined') {
      return;
    }

    try {
      localStorage.setItem(TIME_FORMAT_KEY, format);
    } catch (e) {
      console.warn('Failed to save time format to localStorage', e);
    }
  }
}


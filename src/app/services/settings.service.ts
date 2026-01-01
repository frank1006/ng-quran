import { Injectable, signal, computed } from '@angular/core';

/**
 * Time format options
 */
export enum TimeFormat {
  TWELVE_HOUR = '12h',
  TWENTY_FOUR_HOUR = '24h'
}

/**
 * Local storage key for time format preference
 */
const TIME_FORMAT_KEY = 'app_time_format';

@Injectable({
  providedIn: 'root'
})
export class SettingsService {
  private readonly timeFormat = signal<TimeFormat>(this.loadTimeFormat());

  /**
   * Current time format preference
   */
  readonly currentTimeFormat = computed(() => this.timeFormat());

  constructor() {
    // Load from localStorage on initialization
    const savedFormat = this.loadTimeFormat();
    if (savedFormat) {
      this.timeFormat.set(savedFormat);
    }
  }

  /**
   * Set time format preference
   */
  setTimeFormat(format: TimeFormat): void {
    this.timeFormat.set(format);
    this.saveTimeFormat(format);
  }

  /**
   * Load time format from localStorage
   */
  private loadTimeFormat(): TimeFormat {
    if (typeof localStorage === 'undefined') {
      return TimeFormat.TWENTY_FOUR_HOUR; // Default to 24-hour
    }

    try {
      const stored = localStorage.getItem(TIME_FORMAT_KEY);
      if (stored === TimeFormat.TWELVE_HOUR || stored === TimeFormat.TWENTY_FOUR_HOUR) {
        return stored as TimeFormat;
      }
    } catch (e) {
      console.warn('Failed to load time format from localStorage', e);
    }

    return TimeFormat.TWENTY_FOUR_HOUR; // Default to 24-hour
  }

  /**
   * Save time format to localStorage
   */
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


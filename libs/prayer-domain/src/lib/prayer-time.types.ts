/**
 * Types and interfaces for Prayer Time Service
 */

export interface LocationCoordinates {
  latitude: number;
  longitude: number;
}

export interface PrayerTimings {
  fajr: string;
  sunrise: string;
  dhuhr: string;
  asr: string;
  maghrib: string;
  isha: string;
}

export interface HijriDate {
  date: string;
  format: string;
  day: string;
  weekday: {
    en: string;
    ar: string;
  };
  month: {
    number: number;
    en: string;
    ar: string;
    days: number;
  };
  year: string;
  designation: {
    abbreviated: string;
    expanded: string;
  };
  holidays: any[];
  adjustedHolidays: any[];
  method: string;
}

export interface PrayerTimeData {
  date: string;
  timings: PrayerTimings;
  location: LocationCoordinates;
  hijriDate?: HijriDate;
}

export interface AladhanTimings {
  Fajr: string;
  Sunrise: string;
  Dhuhr: string;
  Asr: string;
  Maghrib: string;
  Isha: string;
}

export interface AladhanTimingData {
  timings: AladhanTimings;
  date: {
    readable: string;
    timestamp: string;
    hijri?: {
      date: string;
      format: string;
      day: string;
      weekday: {
        en: string;
        ar: string;
      };
      month: {
        number: number;
        en: string;
        ar: string;
        days: number;
      };
      year: string;
      designation: {
        abbreviated: string;
        expanded: string;
      };
      holidays: any[];
      adjustedHolidays: any[];
      method: string;
    };
    gregorian?: any;
  };
}

export interface AladhanApiResponse {
  code: number;
  status: string;
  data: AladhanTimingData;
}

export type ServiceState = 'idle' | 'loading' | 'success' | 'error';

export interface PrayerTimeState {
  state: ServiceState;
  data?: PrayerTimeData;
  error?: string;
}

export interface LocationError {
  code: number;
  message: string;
}


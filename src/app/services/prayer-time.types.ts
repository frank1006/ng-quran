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

export interface PrayerTimeData {
  date: string;
  timings: PrayerTimings;
  location: LocationCoordinates;
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


import { Injectable, signal } from '@angular/core';
import { Logger } from '../core/logger.util';

/**
 * Current weather from Open-Meteo (https://open-meteo.com): free for non-commercial use,
 * no API key, data under CC BY 4.0 (credited in Profile > About).
 */
export type WeatherCondition = 'clear' | 'partly' | 'cloudy' | 'fog' | 'rain' | 'snow' | 'storm';

export interface CurrentWeather {
  temperatureC: number;
  condition: WeatherCondition;
  isDay: boolean;
  /** When it was fetched (ms) */
  at: number;
  /** Rounded location it belongs to, "lat,lng" */
  place: string;
}

const API_URL = 'https://api.open-meteo.com/v1/forecast';
const STORAGE_KEY = 'weather-current';
const MAX_AGE_MS = 30 * 60 * 1000;
/** After this the last reading is too old to show at all (e.g. offline for hours) */
const STALE_MS = 3 * 60 * 60 * 1000;

const LABELS: Record<WeatherCondition, string> = {
  clear: 'Clear', partly: 'Partly cloudy', cloudy: 'Cloudy', fog: 'Fog', rain: 'Rain', snow: 'Snow', storm: 'Thunderstorm',
};

/** WMO weather codes grouped into the few looks the app shows. */
export function conditionFromCode(code: number): WeatherCondition {
  if (code === 0) return 'clear';
  if (code <= 2) return 'partly';
  if (code === 3) return 'cloudy';
  if (code === 45 || code === 48) return 'fog';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if (code >= 95) return 'storm';
  return 'rain'; // drizzle, rain, freezing rain, showers
}

export function conditionLabel(condition: WeatherCondition, isDay: boolean): string {
  return condition === 'clear' && !isDay ? 'Clear night' : LABELS[condition];
}

@Injectable({ providedIn: 'root' })
export class WeatherService {
  private readonly current = signal<CurrentWeather | null>(this.readStored());
  readonly weather = this.current.asReadonly();
  private inFlight: string | null = null;

  /** Fetches the weather for a location unless a recent reading for the same place exists. */
  async refresh(latitude: number, longitude: number): Promise<void> {
    const place = `${latitude.toFixed(1)},${longitude.toFixed(1)}`;
    const existing = this.current();
    if (existing && existing.place !== place) {
      this.current.set(null); // don't show another city's weather
    } else if (existing && Date.now() - existing.at < MAX_AGE_MS) {
      return;
    }
    if (this.inFlight === place || !navigator.onLine) return;

    this.inFlight = place;
    try {
      const params = new URLSearchParams({
        latitude: latitude.toFixed(2),
        longitude: longitude.toFixed(2),
        current: 'temperature_2m,weather_code,is_day',
        timezone: 'auto',
      });
      const response = await fetch(`${API_URL}?${params}`, { signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error(`Weather HTTP ${response.status}`);
      const data = await response.json();
      const reading: CurrentWeather = {
        temperatureC: Number(data.current.temperature_2m),
        condition: conditionFromCode(Number(data.current.weather_code)),
        isDay: data.current.is_day === 1,
        at: Date.now(),
        place,
      };
      if (!Number.isFinite(reading.temperatureC)) throw new Error('Weather data incomplete');
      this.current.set(reading);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(reading));
      } catch {
        // Storage unavailable: keep it for this session only
      }
    } catch (error) {
      // Weather is decoration: keep the last reading (if any) and stay quiet
      Logger.warn('Weather update failed:', error);
    } finally {
      this.inFlight = null;
    }
  }

  private readStored(): CurrentWeather | null {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as CurrentWeather | null;
      return stored && Date.now() - stored.at < STALE_MS ? stored : null;
    } catch {
      return null;
    }
  }
}

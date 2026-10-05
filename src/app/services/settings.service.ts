import { Injectable, computed, inject, signal } from '@angular/core';
import { UserStoreService } from './user-store.service';
import { TimeFormat } from './time-format.types';
import {
  DistanceUnit, TemperatureUnit, defaultDistanceUnit, defaultTemperatureUnit,
} from './units';

export { TimeFormat } from './time-format.types';

/** Asr juristic school as used by the Aladhan API (0 = Standard/Shafi, 1 = Hanafi). */
export type AsrSchool = 0 | 1;

export interface PrayerCalcSettings {
  /** Aladhan method id, or null to let the API pick the local authority. */
  method: number | null;
  /** Asr school, or null to use the regional default. */
  school: AsrSchool | null;
}

/** Common Aladhan calculation methods offered in Settings. */
export const CALCULATION_METHODS: { id: number; name: string }[] = [
  { id: 1, name: 'University of Islamic Sciences, Karachi' },
  { id: 2, name: 'Islamic Society of North America (ISNA)' },
  { id: 3, name: 'Muslim World League' },
  { id: 4, name: 'Umm Al-Qura, Makkah' },
  { id: 5, name: 'Egyptian General Authority of Survey' },
  { id: 8, name: 'Gulf Region' },
  { id: 13, name: 'Diyanet, Turkey' },
  { id: 15, name: 'Moonsighting Committee Worldwide' },
  { id: 16, name: 'Dubai' },
  { id: 17, name: 'JAKIM, Malaysia' },
  { id: 20, name: 'KEMENAG, Indonesia' },
];

/** Regions where the Hanafi Asr is the common practice, keyed by IANA time zone prefix. */
const HANAFI_TIME_ZONES = [
  'Asia/Karachi', 'Asia/Kolkata', 'Asia/Calcutta', 'Asia/Dhaka', 'Asia/Kabul',
  'Europe/Istanbul', 'Asia/Tashkent', 'Asia/Samarkand', 'Asia/Dushanbe', 'Asia/Almaty', 'Asia/Bishkek',
];

const CALC_STORAGE_KEY = 'prayer-calc-settings';
const UNITS_STORAGE_KEY = 'unit-settings';

interface UnitSettings {
  distance: DistanceUnit | null;
  temperature: TemperatureUnit | null;
}

export function defaultAsrSchool(timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone): AsrSchool {
  return HANAFI_TIME_ZONES.includes(timeZone) ? 1 : 0;
}

@Injectable({
  providedIn: 'root'
})
export class SettingsService {
  private readonly userStore = inject(UserStoreService);
  private readonly calcSettings = signal<PrayerCalcSettings>(this.loadCalcSettings());
  private readonly unitSettings = signal<UnitSettings>(this.loadUnitSettings());

  /** km or mi (stored choice, otherwise from the phone's region). */
  readonly distanceUnit = computed<DistanceUnit>(() => this.unitSettings().distance ?? defaultDistanceUnit());

  /** °C or °F (stored choice, otherwise from the phone's region). */
  readonly temperatureUnit = computed<TemperatureUnit>(() => this.unitSettings().temperature ?? defaultTemperatureUnit());

  readonly currentTimeFormat = computed(() => {
    const storedFormat = this.userStore.timeFormat();
    // Return stored format or default to 24-hour format
    return storedFormat ?? TimeFormat.TWENTY_FOUR_HOUR;
  });

  /** Selected method id, or null for automatic (by location). */
  readonly calcMethod = computed(() => this.calcSettings().method);

  /** Effective Asr school (stored choice or regional default). */
  readonly asrSchool = computed<AsrSchool>(() => this.calcSettings().school ?? defaultAsrSchool());

  setTimeFormat(format: TimeFormat): void {
    this.userStore.setTimeFormat(format);
  }

  setCalcMethod(method: number | null): void {
    this.saveCalcSettings({ ...this.calcSettings(), method });
  }

  setAsrSchool(school: AsrSchool): void {
    this.saveCalcSettings({ ...this.calcSettings(), school });
  }

  setDistanceUnit(distance: DistanceUnit): void {
    this.saveUnitSettings({ ...this.unitSettings(), distance });
  }

  setTemperatureUnit(temperature: TemperatureUnit): void {
    this.saveUnitSettings({ ...this.unitSettings(), temperature });
  }

  private loadUnitSettings(): UnitSettings {
    try {
      const parsed = JSON.parse(localStorage.getItem(UNITS_STORAGE_KEY) ?? 'null');
      return {
        distance: parsed?.distance === 'km' || parsed?.distance === 'mi' ? parsed.distance : null,
        temperature: parsed?.temperature === 'C' || parsed?.temperature === 'F' ? parsed.temperature : null,
      };
    } catch {
      return { distance: null, temperature: null };
    }
  }

  private saveUnitSettings(settings: UnitSettings): void {
    this.unitSettings.set(settings);
    try {
      localStorage.setItem(UNITS_STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Storage unavailable: the setting still applies for this session
    }
  }

  private loadCalcSettings(): PrayerCalcSettings {
    try {
      const parsed = JSON.parse(localStorage.getItem(CALC_STORAGE_KEY) ?? 'null');
      const method = Number.isInteger(parsed?.method) ? parsed.method : null;
      const school = parsed?.school === 0 || parsed?.school === 1 ? parsed.school : null;
      return { method, school };
    } catch {
      return { method: null, school: null };
    }
  }

  private saveCalcSettings(settings: PrayerCalcSettings): void {
    this.calcSettings.set(settings);
    try {
      localStorage.setItem(CALC_STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Storage unavailable: the setting still applies for this session
    }
  }
}

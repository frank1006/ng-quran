import { Injectable } from '@angular/core';
import { Observable, from, throwError } from 'rxjs';
import { map, catchError, switchMap } from 'rxjs/operators';

import { locationDeniedMessage } from '../core/location-help';
import {
  LocationCoordinates,
  PrayerTimings,
  PrayerTimeData,
  AladhanApiResponse,
  LocationError,
  AladhanTimings,
  HijriDate
} from './prayer-time.types';

export type LocationPermission = PermissionState | 'unknown' | 'unsupported';

export interface PrayerCalcParams {
  method: number | null;
  school: 0 | 1;
}

@Injectable({
  providedIn: 'root'
})
export class PrayerTimeService {
  private readonly baseUrl = 'https://api.aladhan.com/v1';

  /**
   * Whether location is already allowed, asked without showing a prompt. 'prompt' means reading
   * the location now would make the phone ask (an iPhone Home Screen app asks again every time
   * it is opened); 'unknown' is a browser that can't say.
   */
  async locationPermission(): Promise<LocationPermission> {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return 'unsupported';
    try {
      return (await navigator.permissions.query({ name: 'geolocation' })).state;
    } catch {
      return 'unknown';
    }
  }

  getCurrentLocation(overrides?: PositionOptions): Observable<LocationCoordinates> {
    return new Observable<LocationCoordinates>((observer) => {
      if (!navigator.geolocation) {
        observer.error({
          code: 0,
          message: 'Geolocation is not supported by your browser'
        } as LocationError);
        return;
      }

      const options: PositionOptions = {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
        ...overrides
      };

      navigator.geolocation.getCurrentPosition(
        (position: GeolocationPosition) => {
          observer.next({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
          });
          observer.complete();
        },
        (error: GeolocationPositionError) => {
          let errorMessage = 'Unable to retrieve your location';
          
          switch (error.code) {
            case error.PERMISSION_DENIED:
              errorMessage = locationDeniedMessage();
              break;
            case error.POSITION_UNAVAILABLE:
              errorMessage = 'Your location isn\'t available right now. Check that location is turned on, then tap Try again.';
              break;
            case error.TIMEOUT:
              errorMessage = 'Finding your location took too long. Move somewhere with a clearer signal, then tap Try again.';
              break;
          }

          observer.error({
            code: error.code,
            message: errorMessage
          } as LocationError);
        },
        options
      );
    });
  }

  getPrayerTimesByCoordinates(
    latitude: number,
    longitude: number,
    date?: Date,
    calc: PrayerCalcParams = { method: null, school: 0 }
  ): Observable<PrayerTimeData> {
    const targetDate = date || new Date();
    const dateStr = `${targetDate.getDate()}-${targetDate.getMonth() + 1}-${targetDate.getFullYear()}`;

    // Without a method the API picks the nearest local authority (e.g. Karachi for Pakistan)
    const methodParam = calc.method !== null ? `&method=${calc.method}` : '';
    const url = `${this.baseUrl}/timings/${dateStr}?latitude=${latitude}&longitude=${longitude}${methodParam}&school=${calc.school}`;

    return from(fetch(url)).pipe(
      switchMap((response: Response) => {
        if (!response.ok) {
          return throwError(() => new Error(`API request failed: ${response.status} ${response.statusText}`));
        }
        return from(response.json()) as Observable<AladhanApiResponse>;
      }),
      map((apiResponse: AladhanApiResponse) => {
        if (apiResponse.code !== 200 || !apiResponse.data) {
          throw new Error(apiResponse.status || 'Invalid API response');
        }
        const timingData = apiResponse.data;
        const timings = this.convertTimings(timingData.timings);
        const hijriDate = timingData.date.hijri ? this.convertHijriDate(timingData.date.hijri) : undefined;
        
        return {
          date: timingData.date.readable,
          timings,
          location: { latitude, longitude },
          hijriDate
        } as PrayerTimeData;
      }),
      catchError((error: Error) => {
        const errorMessage = error.message || 'Failed to fetch prayer times. Please check your internet connection.';
        return throwError(() => new Error(errorMessage));
      })
    );
  }

  getTodayPrayerTimes(): Observable<PrayerTimeData> {
    return this.getCurrentLocation().pipe(
      switchMap((location: LocationCoordinates) => {
        return this.getPrayerTimesByCoordinates(location.latitude, location.longitude);
      }),
      catchError((error: Error | LocationError) => {
        const errorMessage = error instanceof Error 
          ? error.message 
          : (error as LocationError).message || 'Failed to get prayer times';
        return throwError(() => new Error(errorMessage));
      })
    );
  }

  private convertTimings(apiTimings: AladhanTimings): PrayerTimings {
    const extractTime = (timeString: string): string => {
      const match = timeString.match(/(\d{2}:\d{2})/);
      return match ? match[1] : timeString.split(' ')[0];
    };

    return {
      fajr: extractTime(apiTimings.Fajr || ''),
      sunrise: extractTime(apiTimings.Sunrise || ''),
      dhuhr: extractTime(apiTimings.Dhuhr || ''),
      asr: extractTime(apiTimings.Asr || ''),
      maghrib: extractTime(apiTimings.Maghrib || ''),
      isha: extractTime(apiTimings.Isha || '')
    };
  }

  private convertHijriDate(apiHijri: any): HijriDate {
    return {
      date: apiHijri.date || '',
      format: apiHijri.format || '',
      day: apiHijri.day || '',
      weekday: {
        en: apiHijri.weekday?.en || '',
        ar: apiHijri.weekday?.ar || ''
      },
      month: {
        number: apiHijri.month?.number || 0,
        en: apiHijri.month?.en || '',
        ar: apiHijri.month?.ar || '',
        days: apiHijri.month?.days || 0
      },
      year: apiHijri.year || '',
      designation: {
        abbreviated: apiHijri.designation?.abbreviated || 'AH',
        expanded: apiHijri.designation?.expanded || 'Anno Hegirae'
      },
      holidays: apiHijri.holidays || [],
      adjustedHolidays: apiHijri.adjustedHolidays || [],
      method: apiHijri.method || ''
    };
  }
}


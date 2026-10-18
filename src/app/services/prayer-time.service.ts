import { Injectable } from '@angular/core';
import { Observable, defer, of, throwError } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';

import { clockTime, prayerTimes } from '../../../shared/prayer-times';
import { locationDeniedMessage } from '../core/location-help';
import {
  LocationCoordinates,
  PrayerTimeData,
  LocationError
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

  /** Worked out on the phone (shared/prayer-times.ts): works offline, no API call */
  getPrayerTimesByCoordinates(
    latitude: number,
    longitude: number,
    date?: Date,
    calc: PrayerCalcParams = { method: null, school: 0 }
  ): Observable<PrayerTimeData> {
    return defer(() => {
      const targetDate = date || new Date();
      const day = `${targetDate.getFullYear()}-${pad(targetDate.getMonth() + 1)}-${pad(targetDate.getDate())}`;
      // Without a method, the nearest local authority's (e.g. Karachi for Pakistan)
      const times = prayerTimes(latitude, longitude, day, calc.method, calc.school);
      return of({
        date: targetDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
        timings: {
          fajr: clockTime(times.fajr),
          sunrise: clockTime(times.sunrise),
          dhuhr: clockTime(times.dhuhr),
          asr: clockTime(times.asr),
          maghrib: clockTime(times.maghrib),
          isha: clockTime(times.isha)
        },
        location: { latitude, longitude }
      });
    });
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
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

import { Injectable, signal, computed, DestroyRef, inject } from '@angular/core';
import { Observable, of, forkJoin, from } from 'rxjs';
import { map, catchError, tap, switchMap } from 'rxjs/operators';
import { PrayerTimeService, PrayerCalcParams } from '../services/prayer-time.service';
import { SettingsService } from '../services/settings.service';
import { PrayerTimeData, LocationCoordinates } from '../services/prayer-time.types';
import { Logger } from '../core/logger.util';

interface PrayerTimeCache {
  [dateKey: string]: PrayerTimeData;
}

interface StoredCacheData {
  cache: PrayerTimeCache;
  currentLocation: LocationCoordinates | null;
  lastFetchDate: string | null;
  /** Location + calculation settings the cached times were computed for. */
  context?: string | null;
  version: string;
}

interface StoreState {
  cache: PrayerTimeCache;
  loading: boolean;
  error: string | null;
  currentLocation: LocationCoordinates | null;
  lastFetchDate: Date | null;
  context: string | null;
}

/** Distance in km that counts as "moved" and triggers new prayer times. */
const LOCATION_CHANGE_KM = 5;

function distanceKm(a: LocationCoordinates, b: LocationCoordinates): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const x = toRad(b.longitude - a.longitude) * Math.cos(toRad((a.latitude + b.latitude) / 2));
  const y = toRad(b.latitude - a.latitude);
  return Math.sqrt(x * x + y * y) * 6371;
}

@Injectable({
  providedIn: 'root'
})
export class PrayerTimeStore {
  private readonly CACHE_RANGE = 3; // 3 days before and after
  private readonly STORAGE_KEY = 'prayer-time-cache';
  private readonly CACHE_VERSION = '1.1.0'; // 1.1.0: method/school aware cache
  private readonly CACHE_EXPIRY_DAYS = 7; // Cache expires after 7 days
  private readonly destroyRef = inject(DestroyRef);
  private saveTimeout: number | null = null;
  private readonly SAVE_DEBOUNCE_MS = 500;
  private readonly settings = inject(SettingsService);
  /** Whether the stored location has been re-checked with GPS during this app session. */
  private locationVerified = false;
  
  private readonly state = signal<StoreState>({
    cache: {},
    loading: false,
    error: null,
    currentLocation: null,
    lastFetchDate: null,
    context: null
  });

  constructor(private prayerTimeService: PrayerTimeService) {
    this.loadFromLocalStorage();
  }

  // Public readonly signals
  readonly loading = computed(() => this.state().loading);
  readonly error = computed(() => this.state().error);
  readonly currentLocation = computed(() => this.state().currentLocation);

  getPrayerTimes(date: Date): Observable<PrayerTimeData | null> {
    if (!this.state().currentLocation) {
      return this.initializeLocationAndFetch(date);
    }

    return this.resolveLocation().pipe(
      switchMap(location => {
        this.ensureContext(location);
        const cached = this.getCachedPrayerTimes(this.getDateKey(date));
        return cached ? of(cached) : this.fetchPrayerTimesForDate(date, location);
      })
    );
  }

  preloadPrayerTimes(centerDate: Date): Observable<PrayerTimeData[]> {
    if (!this.state().currentLocation) {
      return this.initializeLocationAndPreload(centerDate);
    }

    return this.resolveLocation().pipe(
      switchMap(location => this.fetchPrayerTimesRange(centerDate, location))
    );
  }

  /** Gets a fresh GPS fix now (user asked for it) and stores it. Errors are passed on. */
  refreshLocation(): Observable<LocationCoordinates> {
    return this.prayerTimeService.getCurrentLocation({ enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }).pipe(
      tap(location => {
        this.locationVerified = true;
        this.updateState({ currentLocation: location, error: null });
      })
    );
  }

  /** Makes the next load re-check GPS (e.g. the app was in the background for a while). */
  markLocationStale(): void {
    this.locationVerified = false;
  }

  /**
   * Returns the stored location, re-checking GPS once per app session so that
   * travellers get times for where they are now. Falls back to the stored location.
   * The re-check is silent: it only runs when location is already allowed, so a phone that
   * would ask again (an iPhone Home Screen app does on every launch) keeps the stored place
   * until the user taps to update it.
   */
  private resolveLocation(): Observable<LocationCoordinates> {
    const stored = this.state().currentLocation!;
    if (this.locationVerified) {
      return of(stored);
    }

    return from(this.prayerTimeService.locationPermission()).pipe(
      switchMap(permission => (permission === 'granted' ? this.recheckLocation(stored) : of(stored)))
    );
  }

  private recheckLocation(stored: LocationCoordinates): Observable<LocationCoordinates> {
    return this.prayerTimeService
      .getCurrentLocation({ enableHighAccuracy: false, timeout: 5000, maximumAge: 10 * 60 * 1000 })
      .pipe(
        map(fresh => {
          this.locationVerified = true;
          if (distanceKm(stored, fresh) > LOCATION_CHANGE_KM) {
            this.updateState({ currentLocation: fresh });
            return fresh;
          }
          return stored;
        }),
        catchError(() => {
          this.locationVerified = true;
          return of(stored);
        })
      );
  }

  private calcParams(): PrayerCalcParams {
    return { method: this.settings.calcMethod(), school: this.settings.asrSchool() };
  }

  /** Drops cached times computed for a different place or calculation setting. */
  private ensureContext(location: LocationCoordinates): void {
    const { method, school } = this.calcParams();
    const context = `${method ?? 'auto'}|${school}|${location.latitude.toFixed(1)}|${location.longitude.toFixed(1)}`;
    if (this.state().context !== context) {
      this.updateState({ cache: {}, context });
    }
  }

  private initializeLocationAndPreload(centerDate: Date): Observable<PrayerTimeData[]> {
    this.setLoading(true);
    
    return this.prayerTimeService.getCurrentLocation().pipe(
      tap(location => {
        this.locationVerified = true;
        this.updateState({ currentLocation: location });
      }),
      switchMap(location => this.fetchPrayerTimesRange(centerDate, location)),
      catchError((error: Error) => {
        this.updateState({ 
          loading: false, 
          error: error.message || 'Failed to get location' 
        });
        return of([]);
      })
    );
  }

  private initializeLocationAndFetch(date: Date): Observable<PrayerTimeData | null> {
    this.setLoading(true);
    
    return this.prayerTimeService.getCurrentLocation().pipe(
      tap(location => {
        this.locationVerified = true;
        this.updateState({ currentLocation: location });
      }),
      switchMap(location => this.fetchPrayerTimesForDate(date, location)),
      catchError((error: Error) => {
        this.updateState({ 
          loading: false, 
          error: error.message || 'Failed to get location' 
        });
        return of(null);
      })
    );
  }

  private fetchPrayerTimesRange(
    centerDate: Date, 
    location: LocationCoordinates
  ): Observable<PrayerTimeData[]> {
    this.setLoading(true);
    this.updateState({ error: null });
    this.ensureContext(location);
    const calc = this.calcParams();

    const dates: Date[] = [];
    const today = new Date(centerDate);

    for (let i = -this.CACHE_RANGE; i <= this.CACHE_RANGE; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() + i);
      dates.push(date);
    }

    const datesToFetch = dates.filter(date => {
      const dateKey = this.getDateKey(date);
      const cached = this.getCachedPrayerTimes(dateKey);
      return !cached;
    });

    if (datesToFetch.length === 0) {
      this.setLoading(false);
      return of(this.getPrayerTimesArray(dates));
    }

    const fetchRequests = datesToFetch.map(date =>
      this.prayerTimeService.getPrayerTimesByCoordinates(
        location.latitude,
        location.longitude,
        date,
        calc
      ).pipe(
        tap(data => this.setCachedPrayerTimes(this.getDateKey(date), data)),
        catchError((error: Error) => {
          Logger.error(`Failed to fetch prayer times for ${this.getDateKey(date)}:`, error);
          return of(null);
        })
      )
    );

    return forkJoin(fetchRequests).pipe(
      map(results => {
        const validResults = results.filter((r): r is PrayerTimeData => r !== null);
        this.setLoading(false);
        this.updateState({ lastFetchDate: new Date() });
        return this.getPrayerTimesArray(dates);
      }),
      catchError((error: Error) => {
        this.updateState({ 
          loading: false, 
          error: error.message || 'Failed to load prayer times' 
        });
        return of(this.getPrayerTimesArray(dates));
      })
    );
  }

  private fetchPrayerTimesForDate(
    date: Date, 
    location: LocationCoordinates
  ): Observable<PrayerTimeData | null> {
    this.setLoading(true);
    this.updateState({ error: null });
    this.ensureContext(location);

    const dateKey = this.getDateKey(date);

    return this.prayerTimeService.getPrayerTimesByCoordinates(
      location.latitude,
      location.longitude,
      date,
      this.calcParams()
    ).pipe(
      tap(data => {
        this.setCachedPrayerTimes(dateKey, data);
        this.setLoading(false);
        this.updateState({ lastFetchDate: new Date() });
      }),
      catchError((error: Error) => {
        this.updateState({ 
          loading: false, 
          error: error.message || 'Failed to load prayer times' 
        });
        return of(null);
      })
    );
  }

  private getPrayerTimesArray(dates: Date[]): PrayerTimeData[] {
    return dates
      .map(date => this.getCachedPrayerTimes(this.getDateKey(date)))
      .filter((data): data is PrayerTimeData => data !== null);
  }

  getCachedPrayerTimes(dateKey: string): PrayerTimeData | null {
    return this.state().cache[dateKey] || null;
  }

  private setCachedPrayerTimes(dateKey: string, data: PrayerTimeData): void {
    const currentCache = this.state().cache;
    const newCache = { ...currentCache, [dateKey]: data };
    this.updateState({ cache: newCache });
    this.saveToLocalStorage();
  }

  private getDateKey(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private updateState(partial: Partial<StoreState>): void {
    const newState = { ...this.state(), ...partial };
    this.state.set(newState);
    
    if (partial.currentLocation !== undefined || partial.cache !== undefined || partial.context !== undefined) {
      this.saveToLocalStorage();
    }
  }

  private setLoading(loading: boolean): void {
    this.updateState({ loading });
  }

  private loadFromLocalStorage(): void {
    try {
      if (!this.isLocalStorageAvailable()) {
        Logger.warn('Local storage is not available');
        return;
      }

      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (!stored) {
        return;
      }

      const data: StoredCacheData = JSON.parse(stored);
      
      if (data.version !== this.CACHE_VERSION) {
        this.clearLocalStorage();
        return;
      }

      if (data.lastFetchDate) {
        const lastFetch = new Date(data.lastFetchDate);
        const daysSinceFetch = (Date.now() - lastFetch.getTime()) / (1000 * 60 * 60 * 24);
        
        if (daysSinceFetch > this.CACHE_EXPIRY_DAYS) {
          this.clearLocalStorage();
          return;
        }
      }

      const cleanedCache = this.cleanExpiredCache(data.cache);
      
      this.state.set({
        cache: cleanedCache,
        loading: false,
        error: null,
        currentLocation: data.currentLocation,
        lastFetchDate: data.lastFetchDate ? new Date(data.lastFetchDate) : null,
        context: data.context ?? null
      });
    } catch (error) {
      Logger.error('Error loading from local storage:', error);
      this.clearLocalStorage();
    }
  }

  private saveToLocalStorage(): void {
    // Debounce localStorage writes to improve performance
    if (this.saveTimeout !== null) {
      clearTimeout(this.saveTimeout);
    }

    this.saveTimeout = window.setTimeout(() => {
      try {
        if (!this.isLocalStorageAvailable()) {
          return;
        }

        const state = this.state();
        const dataToStore: StoredCacheData = {
          cache: state.cache,
          currentLocation: state.currentLocation,
          lastFetchDate: state.lastFetchDate ? state.lastFetchDate.toISOString() : null,
          context: state.context,
          version: this.CACHE_VERSION
        };

        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(dataToStore));
      } catch (error) {
        Logger.error('Error saving to local storage:', error);
        if (error instanceof DOMException && error.name === 'QuotaExceededError') {
          this.clearOldCache();
        }
      }
    }, this.SAVE_DEBOUNCE_MS);
  }

  private cleanExpiredCache(cache: PrayerTimeCache): PrayerTimeCache {
    const cleaned: PrayerTimeCache = {};
    const now = new Date();
    const maxAge = this.CACHE_EXPIRY_DAYS * 24 * 60 * 60 * 1000;

    for (const [dateKey, data] of Object.entries(cache)) {
      try {
        const [year, month, day] = dateKey.split('-').map(Number);
        const cacheDate = new Date(year, month - 1, day);
        const age = now.getTime() - cacheDate.getTime();

        if (age <= maxAge && age >= -maxAge) {
          cleaned[dateKey] = data;
        }
      } catch (error) {
        Logger.warn(`Invalid date key in cache: ${dateKey}`);
      }
    }

    return cleaned;
  }

  private clearOldCache(): void {
    const state = this.state();
    const now = new Date();
    const keepDays = 3;
    const cleaned: PrayerTimeCache = {};

    for (const [dateKey, data] of Object.entries(state.cache)) {
      try {
        const [year, month, day] = dateKey.split('-').map(Number);
        const cacheDate = new Date(year, month - 1, day);
        const daysDiff = Math.floor((now.getTime() - cacheDate.getTime()) / (1000 * 60 * 60 * 24));

        if (Math.abs(daysDiff) <= keepDays) {
          cleaned[dateKey] = data;
        }
      } catch (error) {
        // Skip invalid entries
      }
    }

    this.updateState({ cache: cleaned });
  }

  private isLocalStorageAvailable(): boolean {
    try {
      const test = '__localStorage_test__';
      localStorage.setItem(test, test);
      localStorage.removeItem(test);
      return true;
    } catch {
      return false;
    }
  }

  private clearLocalStorage(): void {
    try {
      localStorage.removeItem(this.STORAGE_KEY);
    } catch (error) {
      Logger.error('Error clearing local storage:', error);
    }
  }

  clearCache(): void {
    this.updateState({ cache: {} });
    this.clearLocalStorage();
  }

  clearError(): void {
    this.updateState({ error: null });
  }

  hasDataForRange(centerDate: Date): boolean {
    const today = new Date(centerDate);
    for (let i = -this.CACHE_RANGE; i <= this.CACHE_RANGE; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() + i);
      const dateKey = this.getDateKey(date);
      if (!this.getCachedPrayerTimes(dateKey)) {
        return false;
      }
    }
    return true;
  }
}


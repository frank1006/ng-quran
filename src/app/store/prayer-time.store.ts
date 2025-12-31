import { Injectable, signal, computed } from '@angular/core';
import { Observable, of, forkJoin } from 'rxjs';
import { map, catchError, tap, switchMap } from 'rxjs/operators';
import { PrayerTimeService } from '../services/prayer-time.service';
import { PrayerTimeData, LocationCoordinates } from '../services/prayer-time.types';

interface PrayerTimeCache {
  [dateKey: string]: PrayerTimeData;
}

interface StoredCacheData {
  cache: PrayerTimeCache;
  currentLocation: LocationCoordinates | null;
  lastFetchDate: string | null;
  version: string;
}

interface StoreState {
  cache: PrayerTimeCache;
  loading: boolean;
  error: string | null;
  currentLocation: LocationCoordinates | null;
  lastFetchDate: Date | null;
}

@Injectable({
  providedIn: 'root'
})
export class PrayerTimeStore {
  private readonly CACHE_RANGE = 3; // 3 days before and after
  private readonly STORAGE_KEY = 'prayer-time-cache';
  private readonly CACHE_VERSION = '1.0.0';
  private readonly CACHE_EXPIRY_DAYS = 7; // Cache expires after 7 days
  
  private readonly state = signal<StoreState>({
    cache: {},
    loading: false,
    error: null,
    currentLocation: null,
    lastFetchDate: null
  });

  constructor(private prayerTimeService: PrayerTimeService) {
    this.loadFromLocalStorage();
  }

  // Public readonly signals
  readonly loading = computed(() => this.state().loading);
  readonly error = computed(() => this.state().error);
  readonly currentLocation = computed(() => this.state().currentLocation);

  /**
   * Get prayer times for a specific date
   * Returns from cache if available, otherwise fetches from API
   */
  getPrayerTimes(date: Date): Observable<PrayerTimeData | null> {
    const dateKey = this.getDateKey(date);
    const cached = this.getCachedPrayerTimes(dateKey);

    if (cached) {
      return of(cached);
    }

    // Check if we have location
    const location = this.state().currentLocation;
    if (!location) {
      // Fetch location first, then get prayer times
      return this.initializeLocationAndFetch(date);
    }

    return this.fetchPrayerTimesForDate(date, location);
  }

  /**
   * Preload prayer times for 3 days before and after the given date
   */
  preloadPrayerTimes(centerDate: Date): Observable<PrayerTimeData[]> {
    const location = this.state().currentLocation;
    
    if (!location) {
      return this.initializeLocationAndPreload(centerDate);
    }

    return this.fetchPrayerTimesRange(centerDate, location);
  }

  /**
   * Initialize location and preload prayer times
   */
  private initializeLocationAndPreload(centerDate: Date): Observable<PrayerTimeData[]> {
    this.setLoading(true);
    
    return this.prayerTimeService.getCurrentLocation().pipe(
      tap(location => {
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

  /**
   * Initialize location and fetch prayer times for a single date
   */
  private initializeLocationAndFetch(date: Date): Observable<PrayerTimeData | null> {
    this.setLoading(true);
    
    return this.prayerTimeService.getCurrentLocation().pipe(
      tap(location => {
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

  /**
   * Fetch prayer times for a range of dates (3 days before and after)
   */
  private fetchPrayerTimesRange(
    centerDate: Date, 
    location: LocationCoordinates
  ): Observable<PrayerTimeData[]> {
    this.setLoading(true);
    this.updateState({ error: null });

    const dates: Date[] = [];
    const today = new Date(centerDate);

    // Add dates: 3 days before, center date, and 3 days after
    for (let i = -this.CACHE_RANGE; i <= this.CACHE_RANGE; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() + i);
      dates.push(date);
    }

    // Filter out dates we already have cached
    const datesToFetch = dates.filter(date => {
      const dateKey = this.getDateKey(date);
      const cached = this.getCachedPrayerTimes(dateKey);
      return !cached;
    });

    if (datesToFetch.length === 0) {
      // All dates are already cached, no need to fetch
      this.setLoading(false);
      return of(this.getPrayerTimesArray(dates));
    }

    console.log(`Fetching ${datesToFetch.length} missing dates, ${dates.length - datesToFetch.length} already cached`);

    // Fetch all missing dates in parallel
    const fetchRequests = datesToFetch.map(date =>
      this.prayerTimeService.getPrayerTimesByCoordinates(
        location.latitude,
        location.longitude,
        date
      ).pipe(
        tap(data => this.setCachedPrayerTimes(this.getDateKey(date), data)),
        catchError((error: Error) => {
          console.error(`Failed to fetch prayer times for ${this.getDateKey(date)}:`, error);
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

  /**
   * Fetch prayer times for a single date
   */
  private fetchPrayerTimesForDate(
    date: Date, 
    location: LocationCoordinates
  ): Observable<PrayerTimeData | null> {
    this.setLoading(true);
    this.updateState({ error: null });

    const dateKey = this.getDateKey(date);

    return this.prayerTimeService.getPrayerTimesByCoordinates(
      location.latitude,
      location.longitude,
      date
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

  /**
   * Get prayer times array for given dates (from cache)
   */
  private getPrayerTimesArray(dates: Date[]): PrayerTimeData[] {
    return dates
      .map(date => this.getCachedPrayerTimes(this.getDateKey(date)))
      .filter((data): data is PrayerTimeData => data !== null);
  }

  /**
   * Get cached prayer times by date key
   */
  getCachedPrayerTimes(dateKey: string): PrayerTimeData | null {
    return this.state().cache[dateKey] || null;
  }

  /**
   * Set cached prayer times for a date key
   */
  private setCachedPrayerTimes(dateKey: string, data: PrayerTimeData): void {
    const currentCache = this.state().cache;
    const newCache = { ...currentCache, [dateKey]: data };
    this.updateState({
      cache: newCache
    });
    this.saveToLocalStorage();
  }

  /**
   * Get date key string (YYYY-MM-DD format)
   */
  private getDateKey(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Update store state
   */
  private updateState(partial: Partial<StoreState>): void {
    const newState = { ...this.state(), ...partial };
    this.state.set(newState);
    
    // Save to local storage when location or cache changes
    if (partial.currentLocation !== undefined || partial.cache !== undefined) {
      this.saveToLocalStorage();
    }
  }

  /**
   * Set loading state
   */
  private setLoading(loading: boolean): void {
    this.updateState({ loading });
  }

  /**
   * Load cache from local storage
   */
  private loadFromLocalStorage(): void {
    try {
      if (!this.isLocalStorageAvailable()) {
        console.warn('Local storage is not available');
        return;
      }

      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (!stored) {
        return;
      }

      const data: StoredCacheData = JSON.parse(stored);
      
      // Validate cache version
      if (data.version !== this.CACHE_VERSION) {
        console.log('Cache version mismatch, clearing old cache');
        this.clearLocalStorage();
        return;
      }

      // Check if cache is expired
      if (data.lastFetchDate) {
        const lastFetch = new Date(data.lastFetchDate);
        const daysSinceFetch = (Date.now() - lastFetch.getTime()) / (1000 * 60 * 60 * 24);
        
        if (daysSinceFetch > this.CACHE_EXPIRY_DAYS) {
          console.log('Cache expired, clearing');
          this.clearLocalStorage();
          return;
        }
      }

      // Validate and clean cache (remove expired dates)
      const cleanedCache = this.cleanExpiredCache(data.cache);
      
      // Restore state from local storage
      this.state.set({
        cache: cleanedCache,
        loading: false,
        error: null,
        currentLocation: data.currentLocation,
        lastFetchDate: data.lastFetchDate ? new Date(data.lastFetchDate) : null
      });

      console.log(`Loaded ${Object.keys(cleanedCache).length} prayer times from local storage`);
    } catch (error) {
      console.error('Error loading from local storage:', error);
      this.clearLocalStorage();
    }
  }

  /**
   * Save cache to local storage
   */
  private saveToLocalStorage(): void {
    try {
      if (!this.isLocalStorageAvailable()) {
        return;
      }

      const state = this.state();
      const dataToStore: StoredCacheData = {
        cache: state.cache,
        currentLocation: state.currentLocation,
        lastFetchDate: state.lastFetchDate ? state.lastFetchDate.toISOString() : null,
        version: this.CACHE_VERSION
      };

      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(dataToStore));
    } catch (error) {
      console.error('Error saving to local storage:', error);
      // Handle quota exceeded error
      if (error instanceof DOMException && error.name === 'QuotaExceededError') {
        console.warn('Local storage quota exceeded, clearing old cache');
        this.clearOldCache();
      }
    }
  }

  /**
   * Clean expired cache entries (older than 7 days)
   */
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
        console.warn(`Invalid date key in cache: ${dateKey}`);
      }
    }

    return cleaned;
  }

  /**
   * Clear old cache entries to free up space
   */
  private clearOldCache(): void {
    const state = this.state();
    const now = new Date();
    const keepDays = 3; // Keep only last 3 days
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

  /**
   * Check if local storage is available
   */
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

  /**
   * Clear local storage
   */
  private clearLocalStorage(): void {
    try {
      localStorage.removeItem(this.STORAGE_KEY);
    } catch (error) {
      console.error('Error clearing local storage:', error);
    }
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.updateState({ cache: {} });
    this.clearLocalStorage();
  }

  /**
   * Clear error
   */
  clearError(): void {
    this.updateState({ error: null });
  }

  /**
   * Check if we have data for a date range
   */
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


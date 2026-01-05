import { Injectable, inject } from '@angular/core';
import { PrayerTimeStore } from '../store/prayer-time.store';
import { PrayerTimeService } from './prayer-time.service';
import { LocationCoordinates } from './prayer-time.types';

/**
 * Service to handle background synchronization of prayer times
 * Updates cached data even when app is closed
 */
@Injectable({
  providedIn: 'root'
})
export class BackgroundSyncService {
  private readonly prayerTimeStore = inject(PrayerTimeStore);
  private readonly prayerTimeService = inject(PrayerTimeService);
  private readonly SYNC_TAG = 'prayer-times-sync';
  private readonly SYNC_INTERVAL_HOURS = 24; // Sync once per day
  private syncRegistration: ServiceWorkerRegistration | null = null;
  private onlineHandler: (() => void) | null = null;

  constructor() {
    this.initializeBackgroundSync();
  }

  /**
   * Initialize background sync
   */
  private async initializeBackgroundSync(): Promise<void> {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    try {
      // Check if Background Sync API is supported
      if ('sync' in (ServiceWorkerRegistration.prototype as any)) {
        this.syncRegistration = await navigator.serviceWorker.ready;
        this.registerPeriodicSync();
        this.registerOneTimeSync();
      } else {
        console.warn('Background Sync API not supported, using fallback');
        this.setupFallbackSync();
      }
    } catch (error) {
      console.error('Failed to initialize background sync:', error);
      this.setupFallbackSync();
    }
  }

  /**
   * Register periodic background sync (updates every 24 hours)
   */
  private async registerPeriodicSync(): Promise<void> {
    if (!this.syncRegistration) {
      return;
    }

    // Check if Periodic Background Sync API is supported
    const hasPeriodicSync = 
      'periodicSync' in navigator.serviceWorker &&
      'periodicSync' in (this.syncRegistration as any) &&
      typeof (this.syncRegistration as any).periodicSync === 'object' &&
      (this.syncRegistration as any).periodicSync !== null;

    if (!hasPeriodicSync) {
      // Periodic Sync API is not supported
      // Fall back to one-time sync (handled by registerOneTimeSync)
      return;
    }

    try {
      const periodicSync = (this.syncRegistration as any).periodicSync;
      
      // Check if getStatus method exists before calling it
      if (typeof periodicSync.getStatus !== 'function') {
        // getStatus is not available, but periodicSync exists
        // Try to register directly (some browsers may not have getStatus)
        try {
          await periodicSync.register(this.SYNC_TAG, {
            minInterval: this.SYNC_INTERVAL_HOURS * 60 * 60 * 1000 // 24 hours in ms
          });
          console.log('Periodic background sync registered');
        } catch (registerError) {
          // Registration failed, fall back silently
          console.warn('Periodic sync registration failed, using one-time sync');
        }
        return;
      }

      // getStatus is available, check permission first
      const status = await periodicSync.getStatus();
      if (status === 'granted') {
        await periodicSync.register(this.SYNC_TAG, {
          minInterval: this.SYNC_INTERVAL_HOURS * 60 * 60 * 1000 // 24 hours in ms
        });
        console.log('Periodic background sync registered');
      } else {
        console.warn('Periodic sync permission not granted, using one-time sync');
      }
    } catch (error) {
      // Silently fall back to one-time sync - this is expected in many browsers
      // The fallback to one-time sync will handle the sync functionality
      // No need to log this error as it's expected behavior when periodicSync is not available
    }
  }

  /**
   * Register one-time background sync (triggers when online)
   */
  private async registerOneTimeSync(): Promise<void> {
    if (!this.syncRegistration) {
      return;
    }

    try {
      await (this.syncRegistration as any).sync.register(this.SYNC_TAG);
    } catch (error) {
      console.warn('Failed to register one-time sync:', error);
    }
  }

  /**
   * Setup fallback sync using service worker messages
   */
  private setupFallbackSync(): void {
    // Use service worker message-based sync as fallback
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then((registration) => {
        // Send sync message to service worker
        registration.active?.postMessage({
          type: 'SYNC_PRAYER_TIMES',
          timestamp: Date.now()
        });
      });
    }
  }

  /**
   * Manually trigger background sync
   */
  async syncPrayerTimes(): Promise<void> {
    const location = this.prayerTimeStore.currentLocation();
    if (!location) {
      console.warn('Cannot sync: location not available');
      return;
    }

    await this.updatePrayerTimesCache(location);
  }

  /**
   * Update prayer times cache for next 3 days
   */
  private async updatePrayerTimesCache(location: LocationCoordinates): Promise<void> {
    const today = new Date();
    
    // Use the store's preload method which handles caching
    // This will fetch and cache today + 3 days before/after (7 days total)
    this.prayerTimeStore.preloadPrayerTimes(today).subscribe({
      next: () => {
        console.log('Background sync: Prayer times updated');
      },
      error: (error) => {
        console.error('Background sync failed:', error);
      }
    });
  }

  /**
   * Check if current date is greater than last cached date
   */
  checkDateRollover(): boolean {
    const lastFetchDate = this.getLastFetchDate();
    if (!lastFetchDate) {
      return true; // No cache, need to fetch
    }

    const today = new Date();
    const lastFetch = new Date(lastFetchDate);
    
    // Reset time to compare dates only
    today.setHours(0, 0, 0, 0);
    lastFetch.setHours(0, 0, 0, 0);

    // If today is after last fetch date, we have a rollover
    return today > lastFetch;
  }

  /**
   * Get last fetch date from cache
   */
  private getLastFetchDate(): string | null {
    try {
      const stored = localStorage.getItem('prayer-time-cache');
      if (stored) {
        const data = JSON.parse(stored);
        return data.lastFetchDate || null;
      }
    } catch (error) {
      console.error('Error reading last fetch date:', error);
    }
    return null;
  }

  /**
   * Handle date rollover - update cache for new date
   */
  async handleDateRollover(): Promise<void> {
    if (!this.checkDateRollover()) {
      return;
    }

    // Date rollover detected, update cache
    await this.syncPrayerTimes();
  }

  /**
   * Get date key in format YYYY-MM-DD
   */
  private getDateKey(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Setup automatic sync on app load
   */
  setupAutoSync(): void {
    // Check for date rollover on app load
    if (this.checkDateRollover()) {
      this.handleDateRollover();
    }

    // Register sync for when app comes online
    if (typeof window !== 'undefined') {
      this.onlineHandler = () => {
        this.syncPrayerTimes();
      };
      window.addEventListener('online', this.onlineHandler);
    }
  }

  /**
   * Cleanup method to remove event listeners
   */
  cleanup(): void {
    if (typeof window !== 'undefined' && this.onlineHandler) {
      window.removeEventListener('online', this.onlineHandler);
      this.onlineHandler = null;
    }
  }
}


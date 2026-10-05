import { Component, OnInit, OnDestroy, signal, computed, DestroyRef, inject, effect, isDevMode } from '@angular/core';
import { CommonModule } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PrayerTimeStore } from '../../store/prayer-time.store';
import { PrayerTimeData, PrayerTimings } from '../../services/prayer-time.types';
import { SettingsService, TimeFormat } from '../../services/settings.service';
import { formatTime } from '../../services/time-format.util';
import { HeroHeaderComponent } from '../../shared/components/hero-header/hero-header.component';
import { PrayerTrajectoryComponent } from './components/trajectory/prayer-trajectory.component';
import { DateHeaderComponent } from './components/date-header/date-header.component';
import { PrayerListComponent } from './components/prayer-list/prayer-list.component';
import { MasjidListComponent } from './components/masjid-list/masjid-list.component';
import { RadiusFilterComponent } from './components/radius-filter/radius-filter.component';
import { PrayerTrajectoryService } from './services/prayer-trajectory.service';
import { TrajectoryData } from './components/trajectory/prayer-trajectory.types';
import { NetworkStatusService } from '../../services/network-status.service';
import { QiblaService } from '../qibla/services/qibla.service';
import { NotificationService } from '../../services/notification.service';
import { BackgroundSyncService } from '../../services/background-sync.service';
import { MasjidService } from '../../services/masjid.service';

interface PrayerItem {
  name: string;
  time: string;
  key: keyof PrayerTimings;
  isActive: boolean;
  /** Earlier today than the current prayer (shown muted) */
  hasPassed?: boolean;
}

const TIME_UPDATE_INTERVAL_MS = 1000;

@Component({
  selector: 'app-prayer',
  standalone: true,
  imports: [
    CommonModule,
    HeroHeaderComponent,
    PrayerTrajectoryComponent,
    DateHeaderComponent,
    PrayerListComponent,
    MasjidListComponent,
    RadiusFilterComponent
  ],
  providers: [PrayerTrajectoryService],
  templateUrl: './prayer.component.html',
  styleUrl: './prayer.component.css'
})
export class PrayerComponent implements OnInit, OnDestroy {
  protected readonly loading = computed(() => this.prayerTimeStore.loading());
  protected readonly error = computed(() => this.prayerTimeStore.error());
  protected readonly prayerData = signal<PrayerTimeData | null>(null);
  protected readonly currentDate = signal<Date>(new Date());
  protected readonly cityName = signal<string>('Current Location');
  protected readonly quadrant = signal<string>('');
  protected readonly showMasjidList = signal<boolean>(false);
  protected readonly masjidSearchRadius = signal<number>(1);
  protected readonly masjidListRefreshTrigger = signal<number>(0);
  private readonly destroyRef = inject(DestroyRef);
  private readonly networkStatus = inject(NetworkStatusService);
  private readonly qiblaService = inject(QiblaService);
  private readonly notificationService = inject(NotificationService);
  private readonly backgroundSync = inject(BackgroundSyncService);
  private readonly masjidService = inject(MasjidService);
  private timeInterval: number | null = null;
  private locationInfoLoaded = false;

  constructor(
    private prayerTimeStore: PrayerTimeStore,
    private trajectoryService: PrayerTrajectoryService,
    private settingsService: SettingsService
  ) {
    // Load last selected radius from localStorage
    const lastRadius = this.loadLastSelectedRadius();
    this.masjidSearchRadius.set(lastRadius);
    // Show offline banner when there's a network error but we have cached data
    effect(() => {
      const error = this.error();
      const prayers = this.prayers();
      
      if (error && prayers.length > 0) {
        // Check if it's a network error
        const errorMessage = error || '';
        const isNetworkError = errorMessage.includes('No internet connection') ||
                              errorMessage.includes('network') ||
                              errorMessage.includes('connection') ||
                              errorMessage.includes('Failed to fetch') ||
                              !navigator.onLine;
        
        if (isNetworkError) {
          // Show offline banner when we have cached data but network request failed
          this.networkStatus.showOfflineBanner();
        }
      }
    });

    // Show offline banner when navigation buttons are disabled (no cached data available)
    effect(() => {
      const canNavigatePrev = this.canNavigatePrevious();
      const canNavigateNext = this.canNavigateNext();
      
      // If either button is disabled and we're offline, show the banner
      if ((!canNavigatePrev || !canNavigateNext) && !navigator.onLine) {
        this.networkStatus.showOfflineBanner();
      }
    });

    // Schedule notifications when prayer data or date changes
    effect(() => {
      const data = this.prayerData();
      const date = this.currentDate();
      
      if (data && date) {
        this.updateNotifications(data, date);
      }
    });
  }

  /**
   * Update notifications for current prayer data and date
   */
  private async updateNotifications(data: PrayerTimeData, date: Date): Promise<void> {
    try {
      // Only schedule for today's date
      const today = new Date();
      const isToday = 
        date.getDate() === today.getDate() &&
        date.getMonth() === today.getMonth() &&
        date.getFullYear() === today.getFullYear();

      if (isToday) {
        await this.notificationService.scheduleNotificationsForDate(date, data);
      }
    } catch (error) {
      // Silently fail - notifications are not critical
      if (isDevMode()) {
        console.warn('Failed to update notifications:', error);
      }
    }
  }

  private createPrayerList(data: PrayerTimeData, timeFormat: TimeFormat): PrayerItem[] {
    return [
      { name: 'Fajr', key: 'fajr', time: formatTime(data.timings.fajr || '', timeFormat), isActive: false },
      { name: 'Shuruq', key: 'sunrise', time: formatTime(data.timings.sunrise || '', timeFormat), isActive: false },
      { name: 'Dhuhr', key: 'dhuhr', time: formatTime(data.timings.dhuhr || '', timeFormat), isActive: false },
      { name: 'Asr', key: 'asr', time: formatTime(data.timings.asr || '', timeFormat), isActive: false },
      { name: 'Maghrib', key: 'maghrib', time: formatTime(data.timings.maghrib || '', timeFormat), isActive: false },
      { name: 'Isha', key: 'isha', time: formatTime(data.timings.isha || '', timeFormat), isActive: false }
    ];
  }

  private isToday(date: Date): boolean {
    return this.isTodayDate(date);
  }

  private isTodayDate(date: Date): boolean {
    const today = new Date();
    return (
      date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear()
    );
  }

  private parseTimeToMinutes(timeString: string): number {
    const trimmed = timeString.trim();
    const twelveHourMatch = trimmed.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (twelveHourMatch) {
      let hours = parseInt(twelveHourMatch[1], 10);
      const minutes = parseInt(twelveHourMatch[2], 10);
      const period = twelveHourMatch[3].toUpperCase();
      
      if (period === 'PM' && hours !== 12) {
        hours += 12;
      } else if (period === 'AM' && hours === 12) {
        hours = 0;
      }
      
      return hours * 60 + minutes;
    }
    
    const match = trimmed.match(/(\d{1,2}):(\d{2})/);
    if (!match) return -1;
    const hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    return hours * 60 + minutes;
  }

  private findLastPassedPrayer(prayers: PrayerItem[], currentMinutes: number): PrayerItem | null {
    for (let i = prayers.length - 1; i >= 0; i--) {
      const prayerMinutes = this.parseTimeToMinutes(prayers[i].time);
      if (prayerMinutes >= 0 && currentMinutes >= prayerMinutes) {
        return prayers[i];
      }
    }
    return null;
  }

  protected readonly prayers = computed<PrayerItem[]>(() => {
    const data = this.prayerData();
    const timeFormat = this.settingsService.currentTimeFormat();
    if (!data?.timings) return [];

    const prayerList = this.createPrayerList(data, timeFormat);

    if (!this.isToday(this.currentDate())) {
      return prayerList;
    }

    const todayPrayers = this.getTodayPrayerTimes();
    if (todayPrayers.length === 0) return prayerList;

    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const lastPassedPrayer = this.findLastPassedPrayer(todayPrayers, currentMinutes);

    if (lastPassedPrayer) {
      const displayIndex = prayerList.findIndex(p => p.name === lastPassedPrayer.name);
      if (displayIndex >= 0) {
        prayerList[displayIndex].isActive = true;
        prayerList.slice(0, displayIndex).forEach(p => (p.hasPassed = true));
      }
    } else {
      if (prayerList.length > 0) {
        prayerList[prayerList.length - 1].isActive = true;
      }
    }

    return prayerList;
  });

  protected readonly currentPrayer = computed<PrayerItem | null>(() => {
    const todayPrayers = this.getTodayPrayerTimes();
    if (todayPrayers.length === 0) {
      const list = this.prayers();
      return list[0] || null;
    }

    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const lastPassedPrayer = this.findLastPassedPrayer(todayPrayers, currentMinutes);
    return lastPassedPrayer || todayPrayers[todayPrayers.length - 1];
  });

  private getTodayPrayerTimes(): PrayerItem[] {
    const today = new Date();
    const todayData = this.prayerTimeStore.getCachedPrayerTimes(this.getDateKey(today));

    if (!todayData?.timings) return [];

    const timeFormat = this.settingsService.currentTimeFormat();
    return this.createPrayerList(todayData, timeFormat);
  }

  private getNextTodayPrayer(): PrayerItem | null {
    const todayPrayers = this.getTodayPrayerTimes();
    if (todayPrayers.length === 0) return null;

    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    for (const prayer of todayPrayers) {
      const prayerMinutes = this.parseTimeToMinutes(prayer.time);
      if (prayerMinutes >= 0 && currentMinutes < prayerMinutes) {
        return prayer;
      }
    }

    return { name: 'Fajr', key: 'fajr', time: todayPrayers[0].time, isActive: false };
  }

  private formatTimeUntil(hours: number, minutes: number, prayerName: string): string {
    const parts: string[] = [];

    if (hours > 0) {
      parts.push(`${hours} ${hours === 1 ? 'hr' : 'hrs'}`);
    }

    if (minutes > 0 || parts.length === 0) {
      parts.push(`${minutes} ${minutes === 1 ? 'min' : 'mins'}`);
    }

    return `${parts.join(' ')} until ${prayerName}`;
  }

  protected readonly timeUntilNext = computed<string>(() => {
    const next = this.getNextTodayPrayer();
    if (!next?.time) return 'Loading...';

    const now = new Date();
    const prayerMinutes = this.parseTimeToMinutes(next.time);
    if (prayerMinutes < 0) return '';

    const hours = Math.floor(prayerMinutes / 60);
    const minutes = prayerMinutes % 60;

    const nextTime = new Date(now);
    nextTime.setHours(hours, minutes, 0, 0);

    if (nextTime < now) {
      nextTime.setDate(nextTime.getDate() + 1);
    }

    const diff = nextTime.getTime() - now.getTime();
    const diffHours = Math.floor(diff / (1000 * 60 * 60));
    const diffMinutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    return this.formatTimeUntil(diffHours, diffMinutes, next.name);
  });

  protected readonly prayerTrajectory = computed<TrajectoryData | null>(() => {
    // Other dates: draw that day's arc without the live "now" marker and progress
    const viewingToday = this.isToday(this.currentDate());
    const sourcePrayers = viewingToday ? this.getTodayPrayerTimes() : this.prayers();
    if (sourcePrayers.length === 0) return null;

    const prayersForTrajectory = sourcePrayers.map(p => ({
      name: p.name,
      time: p.time,
      key: p.key,
      isActive: p.isActive
    }));

    return this.trajectoryService.calculateTrajectory(prayersForTrajectory, viewingToday);
  });

  protected readonly formattedDate = computed<string>(() => {
    const date = this.currentDate();
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

    const dayName = days[date.getDay()];
    const day = date.getDate();
    const month = months[date.getMonth()];
    const year = date.getFullYear();

    const daySuffix = day === 1 || day === 21 || day === 31 ? 'st' :
                      day === 2 || day === 22 ? 'nd' :
                      day === 3 || day === 23 ? 'rd' : 'th';

    return `${dayName} ${day}${daySuffix} ${month}`;
  });

  protected readonly canNavigatePrevious = computed<boolean>(() => {
    // When online, always allow navigation (can fetch new data)
    if (navigator.onLine) {
      return true;
    }
    
    // When offline, only allow if cached data exists
    const currentDate = this.currentDate();
    const previousDate = new Date(currentDate);
    previousDate.setDate(previousDate.getDate() - 1);
    const previousDateKey = this.getDateKey(previousDate);
    return this.prayerTimeStore.getCachedPrayerTimes(previousDateKey) !== null;
  });

  protected readonly canNavigateNext = computed<boolean>(() => {
    // When online, always allow navigation (can fetch new data)
    if (navigator.onLine) {
      return true;
    }
    
    // When offline, only allow if cached data exists
    const currentDate = this.currentDate();
    const nextDate = new Date(currentDate);
    nextDate.setDate(nextDate.getDate() + 1);
    const nextDateKey = this.getDateKey(nextDate);
    return this.prayerTimeStore.getCachedPrayerTimes(nextDateKey) !== null;
  });

  protected readonly hijriDate = computed<string>(() => {
    const data = this.prayerData();
    if (!data?.hijriDate) return '';

    const hijri = data.hijriDate;
    const monthName = hijri.month?.en || '';
    const day = hijri.day || '';
    const year = hijri.year || '';

    if (monthName && day && year) {
      return `${monthName} ${day}, ${year} ${hijri.designation?.abbreviated || 'AH'}`;
    }

    return '';
  });

  protected readonly isCurrentDateToday = computed<boolean>(() => {
    return this.isTodayDate(this.currentDate());
  });

  protected readonly locationName = computed<string>(() => {
    const quadrant = this.quadrant();
    const city = this.cityName();
    
    // Show quadrant if available, otherwise show city
    if (quadrant && quadrant !== city) {
      return `${quadrant}, ${city}`;
    }
    return city;
  });

  ngOnInit(): void {
    this.loadPrayerTimes();
    this.loadLocationInfo();
    this.timeInterval = window.setInterval(() => {
      this.trajectoryService.updateCurrentTime();
    }, TIME_UPDATE_INTERVAL_MS) as unknown as number;

    // Check for date rollover and sync if needed
    this.backgroundSync.handleDateRollover();
  }

  private async loadLocationInfo(): Promise<void> {
    if (this.locationInfoLoaded) {
      return;
    }

    const location = this.prayerTimeStore.currentLocation();
    if (!location) {
      // Wait a bit for location to be available, then try again
      setTimeout(() => {
        const retryLocation = this.prayerTimeStore.currentLocation();
        if (retryLocation && !this.locationInfoLoaded) {
          this.fetchLocationInfo(retryLocation);
        }
      }, 1000);
      return;
    }

    await this.fetchLocationInfo(location);
  }

  private async fetchLocationInfo(location: { latitude: number; longitude: number }): Promise<void> {
    try {
      const locationInfo = await this.qiblaService.getLocationInfo(location.latitude, location.longitude);
      this.cityName.set(locationInfo.city);
      this.quadrant.set(locationInfo.quadrant || '');
      this.locationInfoLoaded = true;
    } catch (error) {
      // Keep default "Current Location" if geocoding fails
      if (isDevMode()) {
        console.warn('Failed to load location info:', error);
      }
    }
  }

  ngOnDestroy(): void {
    if (this.timeInterval !== null) {
      window.clearInterval(this.timeInterval);
      this.timeInterval = null;
    }
  }

  protected loadPrayerTimes(): void {
    const today = new Date();
    this.prayerTimeStore.preloadPrayerTimes(today)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.updatePrayerDataForDate(today),
        error: (err) => {
          // Errors are already handled by the store's error signal
          if (isDevMode()) {
            console.warn('Failed to preload prayer times:', err);
          }
        }
      });
  }

  private updatePrayerDataForDate(date: Date): void {
    const dateKey = this.getDateKey(date);
    const cachedData = this.prayerTimeStore.getCachedPrayerTimes(dateKey);

    if (cachedData?.timings) {
      this.prayerData.set(cachedData);
      return;
    }

    this.prayerTimeStore.getPrayerTimes(date)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => {
          if (data?.timings) {
            this.prayerData.set(data);
          }
        },
        error: (err) => {
          // Errors are already handled by the store's error signal
          if (isDevMode()) {
            console.warn('Failed to get prayer times:', err);
          }
        }
      });
  }

  private getDateKey(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  navigateDate(days: number): void {
    const newDate = new Date(this.currentDate());
    newDate.setDate(newDate.getDate() + days);
    
    // When offline, check if cached data exists before navigating
    if (!navigator.onLine) {
      const newDateKey = this.getDateKey(newDate);
      const hasCachedData = this.prayerTimeStore.getCachedPrayerTimes(newDateKey) !== null;

      // If trying to navigate to a date without cached data while offline, show banner and prevent navigation
      if (!hasCachedData) {
        this.networkStatus.showOfflineBanner();
        return;
      }
    }

    // When online or when offline with cached data, allow navigation
    this.currentDate.set(newDate);

    if (days !== 0) {
      this.loadPrayerTimesForDate(newDate);
    }
  }

  private loadPrayerTimesForDate(date: Date): void {
    const dateKey = this.getDateKey(date);
    const cachedData = this.prayerTimeStore.getCachedPrayerTimes(dateKey);

    if (cachedData) {
      this.updatePrayerDataForDate(date);
      return;
    }

    if (!this.prayerTimeStore.hasDataForRange(date)) {
      this.prayerTimeStore.preloadPrayerTimes(date)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: () => this.updatePrayerDataForDate(date),
          error: (err) => {
            // Errors are already handled by the store's error signal
            if (isDevMode()) {
              console.warn('Failed to preload prayer times for date:', err);
            }
          }
        });
    } else {
      this.updatePrayerDataForDate(date);
    }
  }

  protected goToToday(): void {
    const today = new Date();
    this.currentDate.set(today);
    this.loadPrayerTimesForDate(today);
  }

  /**
   * Display masjid list view
   * Force refresh to get latest data
   */
  protected displayMasjidList(): void {
    // Prevent click if masjid list is already active
    if (this.showMasjidList()) {
      return;
    }
    
    this.showMasjidList.set(true);
    // Force refresh to get latest data
    this.masjidListRefreshTrigger.set(Date.now());
  }

  /**
   * Show prayer list view
   */
  protected showPrayerList(): void {
    this.showMasjidList.set(false);
  }

  /**
   * Handle radius change from masjid list
   */
  protected onMasjidRadiusChange(radius: number): void {
    this.masjidSearchRadius.set(radius);
    this.saveLastSelectedRadius(radius);
  }

  /**
   * Load last selected radius from localStorage
   */
  private loadLastSelectedRadius(): number {
    try {
      if (typeof localStorage === 'undefined') {
        return 1; // Default
      }

      // Try to load from new unified masjid-cache structure
      const cacheStored = localStorage.getItem('masjid-cache');
      if (cacheStored) {
        try {
          const cache: { lastRadius?: number; searchCache?: any; version?: string } = JSON.parse(cacheStored);
          if (cache.lastRadius !== undefined) {
            const radius = parseInt(cache.lastRadius.toString(), 10);
            // Validate radius is within acceptable range (1-50)
            if (radius >= 1 && radius <= 50) {
              return radius;
            }
          }
        } catch (error) {
          // Invalid cache structure, continue to migration check
        }
      }

      // Migration: Check for old key and migrate to new structure
      const oldStored = localStorage.getItem('masjid-last-radius');
      if (oldStored) {
        const radius = parseInt(oldStored, 10);
        // Validate radius is within acceptable range (1-50)
        if (radius >= 1 && radius <= 50) {
          // Migrate to new structure
          this.saveLastSelectedRadius(radius);
          // Remove old key
          localStorage.removeItem('masjid-last-radius');
          return radius;
        }
      }
    } catch (error) {
      if (isDevMode()) {
        console.warn('Error loading last selected radius:', error);
      }
    }
    return 1; // Default
  }

  /**
   * Save last selected radius to localStorage
   */
  private saveLastSelectedRadius(radius: number): void {
    try {
      if (typeof localStorage !== 'undefined') {
        // Load existing unified cache or create new
        let cache: { version?: string; lastRadius?: number; searchCache?: any } = {};
        const cacheStored = localStorage.getItem('masjid-cache');
        if (cacheStored) {
          try {
            cache = JSON.parse(cacheStored);
          } catch (error) {
            // Invalid cache, create new
            cache = {};
          }
        }

        // Preserve version and searchCache if they exist
        if (!cache.version) {
          cache.version = '1.0.0';
        }

        // Update cache
        cache.lastRadius = radius;
        
        // Save to masjid-cache (preserves searchCache if it exists)
        localStorage.setItem('masjid-cache', JSON.stringify(cache));
      }
    } catch (error) {
      if (isDevMode()) {
        console.warn('Error saving last selected radius:', error);
      }
    }
  }

  /**
   * Get current location coordinates for masjid search
   */
  protected readonly currentLocation = computed(() => {
    const location = this.prayerTimeStore.currentLocation();
    return location ? { latitude: location.latitude, longitude: location.longitude } : null;
  });
}

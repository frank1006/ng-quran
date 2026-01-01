import { Component, OnInit, OnDestroy, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PrayerTimeStore } from '../../store/prayer-time.store';
import { PrayerTimeData, PrayerTimings } from '../../services/prayer-time.types';
import { SettingsService, TimeFormat } from '../../services/settings.service';
import { formatTime } from '../../services/time-format.util';
import { HeroSectionComponent } from './components/hero-section/hero-section.component';
import { PrayerTrajectoryComponent } from './components/trajectory/prayer-trajectory.component';
import { DateHeaderComponent } from './components/date-header/date-header.component';
import { PrayerListComponent } from './components/prayer-list/prayer-list.component';
import { PrayerTrajectoryService } from './services/prayer-trajectory.service';
import { TrajectoryData } from './components/trajectory/prayer-trajectory.types';

/**
 * Represents a prayer item with its display information
 */
interface PrayerItem {
  name: string;
  time: string;
  key: keyof PrayerTimings;
  isActive: boolean;
}

/**
 * Constants
 */
const TIME_UPDATE_INTERVAL_MS = 1000;

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    CommonModule,
    HeroSectionComponent,
    PrayerTrajectoryComponent,
    DateHeaderComponent,
    PrayerListComponent
  ],
  providers: [PrayerTrajectoryService],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css'
})
export class HomeComponent implements OnInit, OnDestroy {
  protected readonly loading = computed(() => this.prayerTimeStore.loading());
  protected readonly error = computed(() => this.prayerTimeStore.error());
  protected readonly prayerData = signal<PrayerTimeData | null>(null);
  protected readonly currentDate = signal<Date>(new Date());
  private timeInterval: number | null = null;

  constructor(
    private prayerTimeStore: PrayerTimeStore,
    private trajectoryService: PrayerTrajectoryService,
    private settingsService: SettingsService
  ) {}

  /**
   * Get prayer list from current prayer data
   */
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

  /**
   * Check if a date is today
   */
  private isToday(date: Date): boolean {
    const today = new Date();
    return (
      date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear()
    );
  }

  /**
   * Parse time string to minutes from midnight
   */
  private parseTimeToMinutes(timeString: string): number {
    const trimmed = timeString.trim();
    const match = trimmed.match(/(\d{1,2}):(\d{2})/);
    if (!match) return -1;
    const hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    return hours * 60 + minutes;
  }

  /**
   * Find the last prayer that has passed for a given time
   */
  private findLastPassedPrayer(prayers: PrayerItem[], currentMinutes: number): PrayerItem | null {
    for (let i = prayers.length - 1; i >= 0; i--) {
      const prayerMinutes = this.parseTimeToMinutes(prayers[i].time);
      if (prayerMinutes >= 0 && currentMinutes >= prayerMinutes) {
        return prayers[i];
      }
    }
    return null;
  }

  /**
   * Prayer list with active state based on current time
   */
  protected readonly prayers = computed<PrayerItem[]>(() => {
    const data = this.prayerData();
    const timeFormat = this.settingsService.currentTimeFormat(); // React to time format changes
    if (!data?.timings) return [];

    const prayerList = this.createPrayerList(data, timeFormat);

    // Only show active prayer if viewing today's date
    if (!this.isToday(this.currentDate())) {
      return prayerList;
    }

    // Determine active prayer based on today's prayer times
    const todayPrayers = this.getTodayPrayerTimes();
    if (todayPrayers.length === 0) return prayerList;

    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const lastPassedPrayer = this.findLastPassedPrayer(todayPrayers, currentMinutes);

    // Mark active prayer in display list
    if (lastPassedPrayer) {
      const displayIndex = prayerList.findIndex(p => p.name === lastPassedPrayer.name);
      if (displayIndex >= 0) {
        prayerList[displayIndex].isActive = true;
      }
    } else {
      // If no prayer has passed yet, activate last prayer from yesterday (Isha)
      if (prayerList.length > 0) {
        prayerList[prayerList.length - 1].isActive = true;
      }
    }

    return prayerList;
  });

  /**
   * Current prayer being displayed in hero section (always uses today's date)
   */
  protected readonly currentPrayer = computed<PrayerItem | null>(() => {
    const todayPrayers = this.getTodayPrayerTimes();
    if (todayPrayers.length === 0) {
      const list = this.prayers();
      return list[0] || null;
    }

    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const lastPassedPrayer = this.findLastPassedPrayer(todayPrayers, currentMinutes);

    // Return the last passed prayer, or the last prayer from yesterday if none passed
    return lastPassedPrayer || todayPrayers[todayPrayers.length - 1];
  });

  /**
   * Get today's prayer times for calculating time until next prayer
   * Always uses today's date, not the selected date
   * Includes Shuruq for accurate timing calculation
   */
  private getTodayPrayerTimes(): PrayerItem[] {
    const today = new Date();
    const todayData = this.prayerTimeStore.getCachedPrayerTimes(this.getDateKey(today));

    if (!todayData?.timings) return [];

    const timeFormat = this.settingsService.currentTimeFormat();
    return this.createPrayerList(todayData, timeFormat);
  }

  /**
   * Get the next upcoming prayer for today
   */
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

    // If all today's prayers passed, return tomorrow's first prayer (Fajr)
    return { name: 'Fajr', key: 'fajr', time: todayPrayers[0].time, isActive: false };
  }

  /**
   * Format time difference as human-readable string
   */
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

  /**
   * Time remaining until next prayer (always calculated for today)
   */
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

    // If the prayer time has passed today, it's for tomorrow
    if (nextTime < now) {
      nextTime.setDate(nextTime.getDate() + 1);
    }

    const diff = nextTime.getTime() - now.getTime();
    const diffHours = Math.floor(diff / (1000 * 60 * 60));
    const diffMinutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    return this.formatTimeUntil(diffHours, diffMinutes, next.name);
  });

  /**
   * Prayer trajectory data for visualization (uses trajectory service)
   */
  protected readonly prayerTrajectory = computed<TrajectoryData | null>(() => {
    const todayPrayers = this.getTodayPrayerTimes();
    if (todayPrayers.length === 0) return null;

    // Convert PrayerItem to format expected by trajectory service
    const prayersForTrajectory = todayPrayers.map(p => ({
      name: p.name,
      time: p.time,
      key: p.key,
      isActive: p.isActive
    }));

    return this.trajectoryService.calculateTrajectory(prayersForTrajectory);
  });

  /**
   * Formatted date string
   */
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

  /**
   * Hijri date string
   */
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

  ngOnInit(): void {
    this.loadPrayerTimes();

    // Update current time every second for smooth progress animation
    this.timeInterval = window.setInterval(() => {
      this.trajectoryService.updateCurrentTime();
    }, TIME_UPDATE_INTERVAL_MS) as unknown as number;
  }

  ngOnDestroy(): void {
    if (this.timeInterval !== null) {
      window.clearInterval(this.timeInterval);
      this.timeInterval = null;
    }
  }

  /**
   * Load prayer times for today and preload surrounding dates
   */
  protected loadPrayerTimes(): void {
    const today = new Date();

    // Preload prayer times for 3 days before and after today
    this.prayerTimeStore.preloadPrayerTimes(today).subscribe({
      next: () => {
        // Set today's prayer data
        this.updatePrayerDataForDate(today);
      },
      error: () => {
        // Error is already handled by the store
      }
    });
  }

  /**
   * Update prayer data for a specific date (uses cache when available)
   */
  private updatePrayerDataForDate(date: Date): void {
    const dateKey = this.getDateKey(date);
    const cachedData = this.prayerTimeStore.getCachedPrayerTimes(dateKey);

    if (cachedData?.timings) {
      // Use cached data immediately
      this.prayerData.set(cachedData);
      return;
    }

    // Not in cache, fetch from API (this should rarely happen after initial load)
    this.prayerTimeStore.getPrayerTimes(date).subscribe({
      next: (data) => {
        if (data?.timings) {
          this.prayerData.set(data);
        }
      },
      error: () => {
        // Error is already handled by the store
      }
    });
  }

  /**
   * Get date key for caching
   */
  private getDateKey(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Navigate to previous/next date
   */
  navigateDate(days: number): void {
    const newDate = new Date(this.currentDate());
    newDate.setDate(newDate.getDate() + days);
    this.currentDate.set(newDate);

    if (days !== 0) {
      this.loadPrayerTimesForDate(newDate);
    }
  }

  /**
   * Load prayer times for a specific date
   */
  private loadPrayerTimesForDate(date: Date): void {
    const dateKey = this.getDateKey(date);
    const cachedData = this.prayerTimeStore.getCachedPrayerTimes(dateKey);

    if (cachedData) {
      // Date is cached, just update the display
      this.updatePrayerDataForDate(date);
      return;
    }

    // Date not cached, check if we need to preload a range
    if (!this.prayerTimeStore.hasDataForRange(date)) {
      // Preload only missing dates in the range
      this.prayerTimeStore.preloadPrayerTimes(date).subscribe({
        next: () => {
          this.updatePrayerDataForDate(date);
        },
        error: () => {
          // Error is already handled by the store
        }
      });
    } else {
      // Shouldn't happen, but just in case
      this.updatePrayerDataForDate(date);
    }
  }
}

import { Component, OnInit, OnDestroy, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PrayerTimeStore } from '../../store/prayer-time.store';
import { PrayerTimeData, PrayerTimings } from '../../services/prayer-time.types';
import { SettingsService, TimeFormat } from '../../services/settings.service';
import { formatTime } from '../../services/time-format.util';
import { HeroHeaderComponent } from '../../shared/components/hero-header/hero-header.component';
import { PrayerTrajectoryComponent } from './components/trajectory/prayer-trajectory.component';
import { DateHeaderComponent } from './components/date-header/date-header.component';
import { PrayerListComponent } from './components/prayer-list/prayer-list.component';
import { PrayerTrajectoryService } from './services/prayer-trajectory.service';
import { TrajectoryData } from './components/trajectory/prayer-trajectory.types';

interface PrayerItem {
  name: string;
  time: string;
  key: keyof PrayerTimings;
  isActive: boolean;
}

const TIME_UPDATE_INTERVAL_MS = 1000;

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    CommonModule,
    HeroHeaderComponent,
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
    const todayPrayers = this.getTodayPrayerTimes();
    if (todayPrayers.length === 0) return null;

    const prayersForTrajectory = todayPrayers.map(p => ({
      name: p.name,
      time: p.time,
      key: p.key,
      isActive: p.isActive
    }));

    return this.trajectoryService.calculateTrajectory(prayersForTrajectory);
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

  protected loadPrayerTimes(): void {
    const today = new Date();
    this.prayerTimeStore.preloadPrayerTimes(today).subscribe({
      next: () => this.updatePrayerDataForDate(today),
      error: () => {}
    });
  }

  private updatePrayerDataForDate(date: Date): void {
    const dateKey = this.getDateKey(date);
    const cachedData = this.prayerTimeStore.getCachedPrayerTimes(dateKey);

    if (cachedData?.timings) {
      this.prayerData.set(cachedData);
      return;
    }

    this.prayerTimeStore.getPrayerTimes(date).subscribe({
      next: (data) => {
        if (data?.timings) {
          this.prayerData.set(data);
        }
      },
      error: () => {}
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
      this.prayerTimeStore.preloadPrayerTimes(date).subscribe({
        next: () => this.updatePrayerDataForDate(date),
        error: () => {}
      });
    } else {
      this.updatePrayerDataForDate(date);
    }
  }
}

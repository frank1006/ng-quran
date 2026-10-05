import { Injectable, signal } from '@angular/core';
import { TrajectoryData, TrajectoryMarker } from '../components/trajectory/prayer-trajectory.types';
import { TrajectoryUtils } from '../components/trajectory/prayer-trajectory.utils';
import { TRAJECTORY_CONSTANTS as C } from '../components/trajectory/prayer-trajectory.constants';

/**
 * Prayer item interface
 */
interface PrayerItem {
  name: string;
  time: string;
  key: string;
  isActive: boolean;
}

@Injectable()
export class PrayerTrajectoryService {
  private readonly currentTime = signal<Date>(new Date());

  /**
   * Update current time (called every second)
   */
  updateCurrentTime(): void {
    this.currentTime.set(new Date());
  }

  /**
   * Lay today's prayers on a sun arc: Fajr and Isha below the horizon,
   * sunrise and Maghrib on it, Dhuhr near the peak (solar noon).
   */
  calculateTrajectory(prayers: PrayerItem[]): TrajectoryData | null {
    const displayPrayers = prayers.filter(p => p.name !== 'Shuruq');
    if (displayPrayers.length === 0) return null;

    const now = this.currentTime();
    const nowMinutes = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;

    const times = displayPrayers.map(p => TrajectoryUtils.parseTimeToMinutes(p.time));
    // Isha after midnight (high latitudes in summer) belongs to the same evening
    const maghribIndex = displayPrayers.findIndex(p => p.name === 'Maghrib');
    for (let i = maghribIndex + 1; maghribIndex >= 0 && i < times.length; i++) {
      if (times[i] >= 0 && times[i] < times[maghribIndex]) times[i] += C.MINUTES_PER_DAY;
    }

    const sunriseItem = prayers.find(p => p.name === 'Shuruq');
    const sunrise = sunriseItem ? TrajectoryUtils.parseTimeToMinutes(sunriseItem.time) : -1;
    const sunset = maghribIndex >= 0 ? times[maghribIndex] : -1;
    const valid = times.filter(t => t >= 0);
    if (valid.length === 0) return null;

    const model: TrajectoryUtils.ArcModel = {
      sunrise: sunrise >= 0 ? sunrise : C.DEFAULT_SUNRISE_MINUTES,
      sunset: sunset >= 0 ? sunset : C.DEFAULT_SUNSET_MINUTES,
      windowStart: Math.min(...valid) - C.WINDOW_PADDING_MINUTES,
      windowEnd: Math.max(...valid) + C.WINDOW_PADDING_MINUTES,
    };

    // Current prayer = last one whose time has passed; next = the one after it
    let currentIndex = -1;
    times.forEach((t, i) => {
      if (t >= 0 && nowMinutes >= t) currentIndex = i;
    });
    const nextIndex = currentIndex + 1 < displayPrayers.length ? currentIndex + 1 : -1;

    const markers: TrajectoryMarker[] = displayPrayers
      .map((prayer, i) => ({ prayer, i, t: times[i] }))
      .filter(({ t }) => t >= 0)
      .map(({ prayer, i, t }) => ({
        ...prayer,
        hasPassed: nowMinutes >= t,
        isCurrent: i === currentIndex,
        isNext: i === nextIndex,
        point: TrajectoryUtils.pointAt(model, t),
      }));

    const clampedNow = Math.min(nowMinutes, model.windowEnd);
    const inWindow = nowMinutes >= model.windowStart && nowMinutes <= model.windowEnd;

    return {
      markers,
      fullPath: TrajectoryUtils.pathBetween(model, model.windowStart, model.windowEnd),
      elapsedPath: TrajectoryUtils.pathBetween(model, model.windowStart, clampedNow),
      now: inWindow ? TrajectoryUtils.pointAt(model, nowMinutes) : null,
      horizonY: C.HORIZON_Y,
    };
  }
}

import { Injectable, computed, signal } from '@angular/core';
import { TrajectoryData, PrayerItemWithStatus } from '../components/trajectory/prayer-trajectory.types';
import { TrajectoryUtils } from '../components/trajectory/prayer-trajectory.utils';
import { TRAJECTORY_CONSTANTS } from '../components/trajectory/prayer-trajectory.constants';

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
   * Calculate trajectory data from prayer list
   */
  calculateTrajectory(prayers: PrayerItem[]): TrajectoryData | null {
    if (prayers.length === 0) return null;

    const now = this.currentTime();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const currentSeconds = now.getSeconds();

    // Filter out Shuruq from trajectory display (but keep it in prayer list)
    const displayPrayers = prayers.filter(p => p.name !== 'Shuruq');
    
    if (displayPrayers.length === 0) return null;

    // Extract sunrise and sunset times
    const { sunrise: sunriseMinutes, sunset: sunsetMinutes } = this.extractSunTimes(prayers);

    // Parse all prayer times to minutes
    const prayerTimesInMinutes = displayPrayers.map(prayer =>
      TrajectoryUtils.parseTimeToMinutes(prayer.time)
    );

    // Get Maghrib and Isha times for better spacing
    const maghribIndex = displayPrayers.findIndex(p => p.name === 'Maghrib');
    const ishaIndex = displayPrayers.findIndex(p => p.name === 'Isha');
    const maghribMinutes = maghribIndex >= 0 ? prayerTimesInMinutes[maghribIndex] : sunsetMinutes;
    const ishaMinutes = ishaIndex >= 0 ? prayerTimesInMinutes[ishaIndex] : sunsetMinutes + 90;

    // Calculate positions based on day/night cycle
    const positions = displayPrayers.map((prayer, i) => {
      const prayerMinutes = prayerTimesInMinutes[i];
      if (prayerMinutes < 0) return 0;

      return TrajectoryUtils.mapTimeToPosition(
        prayerMinutes,
        sunriseMinutes,
        sunsetMinutes,
        maghribMinutes,
        ishaMinutes,
        prayer.name
      );
    });

    // Calculate curve points
    const curvePoints = positions.map(t => TrajectoryUtils.getPointOnPath(t));

    // Calculate continuous progress based on current time
    let progress = this.calculateProgressPosition(
      currentMinutes,
      currentSeconds,
      sunriseMinutes,
      sunsetMinutes
    );
    progress = Math.max(0, Math.min(1, progress));
    
    // Optional: Use segment-based interpolation for smoother transitions
    const firstPrayerMinutes = prayerTimesInMinutes[0];
    const lastPrayerMinutes = prayerTimesInMinutes[prayerTimesInMinutes.length - 1];
    const currentTimeWithSeconds = currentMinutes + currentSeconds / 60;
    
    if (firstPrayerMinutes >= 0 && lastPrayerMinutes >= 0 && 
        currentMinutes >= firstPrayerMinutes && currentMinutes < lastPrayerMinutes) {
      const segment = this.findCurrentSegment(
        prayerTimesInMinutes,
        positions,
        currentMinutes,
        currentTimeWithSeconds
      );
      
      if (segment) {
        progress = segment.progress;
      }
    }

    // Find current prayer index (last prayer that has passed)
    let currentPrayerIndex = -1;
    for (let i = displayPrayers.length - 1; i >= 0; i--) {
      const prayerMinutes = prayerTimesInMinutes[i];
      if (currentMinutes >= prayerMinutes) {
        currentPrayerIndex = i;
        break;
      }
    }

    // Determine next prayer
    let nextPrayerIndex = -1;
    if (currentPrayerIndex >= 0 && currentPrayerIndex < displayPrayers.length - 1) {
      nextPrayerIndex = currentPrayerIndex + 1;
    } else if (currentPrayerIndex === -1 && displayPrayers.length > 0) {
      nextPrayerIndex = 0;
    }

    const prayersWithStatus: PrayerItemWithStatus[] = displayPrayers.map((prayer, index) => {
      const prayerMinutes = prayerTimesInMinutes[index];
      const hasPassed = prayerMinutes >= 0 && currentMinutes >= prayerMinutes;

      return {
        ...prayer,
        hasPassed,
        isCurrent: index === currentPrayerIndex,
        isNext: index === nextPrayerIndex
      };
    });

    // Calculate endpoint position
    const progressValue = Math.max(0, Math.min(1, progress));
    const offsetProgress = Math.min(
      1,
      progressValue + (TRAJECTORY_CONSTANTS.PROGRESS_OFFSET_MINUTES / TRAJECTORY_CONSTANTS.MINUTES_PER_DAY)
    );
    
    const endpointPosition = TrajectoryUtils.getPointOnPath(offsetProgress);

    return {
      prayers: prayersWithStatus,
      positions,
      curvePoints,
      currentIndex: currentPrayerIndex,
      progress: progressValue,
      gradientOffset: Math.max(0, Math.min(100, progressValue * 100)),
      endpointPosition
    };
  }

  /**
   * Extract sunrise and sunset times from prayer list
   */
  private extractSunTimes(prayers: PrayerItem[]): { sunrise: number; sunset: number } {
    const sunrisePrayer = prayers.find(p => p.name === 'Shuruq');
    const maghribPrayer = prayers.find(p => p.name === 'Maghrib');

    const sunrise = sunrisePrayer
      ? TrajectoryUtils.parseTimeToMinutes(sunrisePrayer.time)
      : TRAJECTORY_CONSTANTS.DEFAULT_SUNRISE_MINUTES;

    const sunset = maghribPrayer
      ? TrajectoryUtils.parseTimeToMinutes(maghribPrayer.time)
      : TRAJECTORY_CONSTANTS.DEFAULT_SUNSET_MINUTES;

    return {
      sunrise: sunrise >= 0 ? sunrise : TRAJECTORY_CONSTANTS.DEFAULT_SUNRISE_MINUTES,
      sunset: sunset >= 0 ? sunset : TRAJECTORY_CONSTANTS.DEFAULT_SUNSET_MINUTES
    };
  }

  /**
   * Calculate progress position on trajectory based on current time
   */
  private calculateProgressPosition(
    currentMinutes: number,
    currentSeconds: number,
    sunriseMinutes: number,
    sunsetMinutes: number
  ): number {
    const currentTimeWithSeconds = currentMinutes + currentSeconds / 60;
    const currentTimeMinutes = Math.floor(currentTimeWithSeconds);
    const noonMinutes = TRAJECTORY_CONSTANTS.NOON_MINUTES;

    if (currentTimeMinutes < sunriseMinutes) {
      const nightDuration = sunriseMinutes || 1;
      const timeFromMidnight = currentTimeMinutes;
      return (timeFromMidnight / nightDuration) * (TRAJECTORY_CONSTANTS.FLAT_START_END / TRAJECTORY_CONSTANTS.PATH_WIDTH);
    }

    if (currentTimeMinutes < noonMinutes) {
      const morningDuration = noonMinutes - sunriseMinutes || 1;
      const timeFromSunrise = currentTimeMinutes - sunriseMinutes;
      const morningProgress = timeFromSunrise / morningDuration;
      return (TRAJECTORY_CONSTANTS.FLAT_START_END + morningProgress * 250) / TRAJECTORY_CONSTANTS.PATH_WIDTH;
    }

    if (currentTimeMinutes < sunsetMinutes) {
      const afternoonDuration = sunsetMinutes - noonMinutes || 1;
      const timeFromNoon = currentTimeMinutes - noonMinutes;
      const afternoonProgress = timeFromNoon / afternoonDuration;
      return (TRAJECTORY_CONSTANTS.CURVE_PEAK_X + afternoonProgress * 240) / TRAJECTORY_CONSTANTS.PATH_WIDTH;
    }

    const nightDuration = TRAJECTORY_CONSTANTS.MINUTES_PER_DAY - sunsetMinutes || 1;
    const timeFromSunset = currentTimeMinutes - sunsetMinutes;
    return (TRAJECTORY_CONSTANTS.FLAT_END_START + (timeFromSunset / nightDuration) * 60) / TRAJECTORY_CONSTANTS.PATH_WIDTH;
  }

  /**
   * Find current segment and calculate interpolated progress
   */
  private findCurrentSegment(
    prayerTimesInMinutes: number[],
    positions: number[],
    currentMinutes: number,
    currentTimeWithSeconds: number
  ): { progress: number } | null {
    let segmentStartIndex = -1;
    let segmentEndIndex = -1;

    for (let i = 0; i < prayerTimesInMinutes.length - 1; i++) {
      const startMinutes = prayerTimesInMinutes[i];
      const endMinutes = prayerTimesInMinutes[i + 1];

      if (startMinutes < 0 || endMinutes < 0) continue;

      if (endMinutes < startMinutes) {
        if (currentMinutes >= startMinutes || currentMinutes <= endMinutes) {
          segmentStartIndex = i;
          segmentEndIndex = i + 1;
          break;
        }
      } else {
        if (currentMinutes >= startMinutes && currentMinutes < endMinutes) {
          segmentStartIndex = i;
          segmentEndIndex = i + 1;
          break;
        }
      }
    }

    if (segmentStartIndex < 0 || segmentEndIndex < 0) return null;

    const startMinutes = prayerTimesInMinutes[segmentStartIndex];
    const endMinutes = prayerTimesInMinutes[segmentEndIndex];
    const segmentStartPos = positions[segmentStartIndex];
    const segmentEndPos = positions[segmentEndIndex];

    let segmentDuration: number;
    let timeInSegment: number;

    if (endMinutes < startMinutes) {
      segmentDuration = (TRAJECTORY_CONSTANTS.MINUTES_PER_DAY - startMinutes) + endMinutes;
      if (currentMinutes >= startMinutes) {
        timeInSegment = currentTimeWithSeconds - startMinutes;
      } else {
        timeInSegment = (TRAJECTORY_CONSTANTS.MINUTES_PER_DAY - startMinutes) + currentTimeWithSeconds;
      }
    } else {
      segmentDuration = endMinutes - startMinutes;
      timeInSegment = currentTimeWithSeconds - startMinutes;
    }

    if (segmentDuration <= 0) return null;

    const segmentProgress = Math.max(0, Math.min(1, timeInSegment / segmentDuration));
    const interpolatedProgress = segmentStartPos + (segmentEndPos - segmentStartPos) * segmentProgress;

    return { progress: interpolatedProgress };
  }
}


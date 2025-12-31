import { Component, OnInit, OnDestroy, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PrayerTimeStore } from '../../store/prayer-time.store';
import { PrayerTimeData, PrayerTimings } from '../../services/prayer-time.types';

interface PrayerItem {
  name: string;
  time: string;
  key: keyof PrayerTimings;
  isActive: boolean;
}

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css'
})
export class HomeComponent implements OnInit, OnDestroy {
  protected readonly loading = computed(() => this.prayerTimeStore.loading());
  protected readonly error = computed(() => this.prayerTimeStore.error());
  protected readonly prayerData = signal<PrayerTimeData | null>(null);
  protected readonly currentDate = signal<Date>(new Date());
  protected readonly currentTime = signal<Date>(new Date());
  private timeInterval: any;

  protected readonly prayers = computed<PrayerItem[]>(() => {
    const data = this.prayerData();
    if (!data || !data.timings) return [];

    // Prayer list including Shuruq
    const prayerList: PrayerItem[] = [
      { name: 'Fajr', key: 'fajr', time: data.timings.fajr || '', isActive: false },
      { name: 'Shuruq', key: 'sunrise', time: data.timings.sunrise || '', isActive: false },
      { name: 'Dhuhr', key: 'dhuhr', time: data.timings.dhuhr || '', isActive: false },
      { name: 'Asr', key: 'asr', time: data.timings.asr || '', isActive: false },
      { name: 'Maghrib', key: 'maghrib', time: data.timings.maghrib || '', isActive: false },
      { name: 'Isha', key: 'isha', time: data.timings.isha || '', isActive: false }
    ];

    // Only show active prayer if viewing today's date
    const selectedDate = this.currentDate();
    const today = new Date();
    const isToday = selectedDate.getDate() === today.getDate() &&
                    selectedDate.getMonth() === today.getMonth() &&
                    selectedDate.getFullYear() === today.getFullYear();

    if (!isToday) {
      // Not viewing today, so no active prayer
      return prayerList;
    }

    // Determine active prayer based on TODAY's prayer times
    // Match the logic used in currentPrayer - find the last prayer that has passed
    const todayPrayers = this.getTodayPrayerTimes();
    if (todayPrayers.length > 0) {
      const now = new Date();
      const currentMinutes = now.getHours() * 60 + now.getMinutes();

      // Find the last prayer that has passed today (same logic as currentPrayer)
      let lastPassedPrayer = null;
      for (let i = todayPrayers.length - 1; i >= 0; i--) {
        const timeStr = todayPrayers[i].time.trim();
        const timeMatch = timeStr.match(/(\d{1,2}):(\d{2})/);
        if (!timeMatch) continue;

        const hours = parseInt(timeMatch[1], 10);
        const minutes = parseInt(timeMatch[2], 10);
        const prayerTimeMinutes = hours * 60 + minutes;

        if (currentMinutes >= prayerTimeMinutes) {
          lastPassedPrayer = todayPrayers[i];
          break;
        }
      }

      // If we found a passed prayer, mark it as active in the display list
      if (lastPassedPrayer) {
        const displayIndex = prayerList.findIndex(p => p.name === lastPassedPrayer.name);
        if (displayIndex >= 0) {
          prayerList[displayIndex].isActive = true;
        }
      } else {
        // If no prayer has passed yet, activate the last prayer from yesterday (Isha)
        if (prayerList.length > 0) {
          const lastPrayerIndex = prayerList.length - 1;
          prayerList[lastPrayerIndex].isActive = true;
        }
      }
    }

    return prayerList;
  });

  protected readonly currentPrayer = computed(() => {
    // Always show today's current prayer, not the selected date's prayer
    const todayPrayers = this.getTodayPrayerTimes();
    if (todayPrayers.length === 0) {
      const list = this.prayers();
      if (list.length === 0) {
        return { name: 'Fajr', time: '', key: 'fajr' as keyof PrayerTimings, isActive: false };
      }
      return list[0];
    }

    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    // Find the last prayer that has passed today (including Shuruq)
    // This is the current prayer that was most recently completed
    let lastPassedPrayer = null;
    for (let i = todayPrayers.length - 1; i >= 0; i--) {
      const timeStr = todayPrayers[i].time.trim();
      const timeMatch = timeStr.match(/(\d{1,2}):(\d{2})/);
      if (!timeMatch) continue;

      const hours = parseInt(timeMatch[1], 10);
      const minutes = parseInt(timeMatch[2], 10);
      const prayerMinutes = hours * 60 + minutes;

      if (currentMinutes >= prayerMinutes) {
        lastPassedPrayer = todayPrayers[i];
        break;
      }
    }

    // Return the last passed prayer, or the last prayer from yesterday if none passed
    return lastPassedPrayer || todayPrayers[todayPrayers.length - 1];
  });

  protected readonly nextPrayer = computed(() => {
    const list = this.prayers();
    if (list.length === 0) return null;

    const activeIndex = list.findIndex(p => p.isActive);
    if (activeIndex >= 0 && activeIndex < list.length - 1) {
      return list[activeIndex];
    }
    if (activeIndex === list.length - 1) {
      return list[0];
    }
    return list[0];
  });

  /**
   * Get today's prayer times for calculating time until next prayer
   * Always uses today's date, not the selected date
   * Includes Shuruq for accurate timing calculation
   */
  private getTodayPrayerTimes(): PrayerItem[] {
    const today = new Date();
    const todayData = this.prayerTimeStore.getCachedPrayerTimes(this.getDateKey(today));

    if (!todayData || !todayData.timings) return [];

    // Include all prayers including Shuruq for accurate timing
    const prayerList: PrayerItem[] = [
      { name: 'Fajr', key: 'fajr', time: todayData.timings.fajr || '', isActive: false },
      { name: 'Shuruq', key: 'sunrise', time: todayData.timings.sunrise || '', isActive: false },
      { name: 'Dhuhr', key: 'dhuhr', time: todayData.timings.dhuhr || '', isActive: false },
      { name: 'Asr', key: 'asr', time: todayData.timings.asr || '', isActive: false },
      { name: 'Maghrib', key: 'maghrib', time: todayData.timings.maghrib || '', isActive: false },
      { name: 'Isha', key: 'isha', time: todayData.timings.isha || '', isActive: false }
    ];

    return prayerList;
  }

  /**
   * Get the next upcoming prayer for today
   */
  private getNextTodayPrayer(): PrayerItem | null {
    const todayPrayers = this.getTodayPrayerTimes();
    if (todayPrayers.length === 0) return null;

    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    for (let i = 0; i < todayPrayers.length; i++) {
      const timeStr = todayPrayers[i].time.trim();
      const timeMatch = timeStr.match(/(\d{1,2}):(\d{2})/);
      if (!timeMatch) continue;

      const hours = parseInt(timeMatch[1], 10);
      const minutes = parseInt(timeMatch[2], 10);
      const prayerMinutes = hours * 60 + minutes;

      if (currentMinutes < prayerMinutes) {
        return todayPrayers[i];
      }
    }

    // If all today's prayers passed, return tomorrow's first prayer (Fajr)
    return { name: 'Fajr', key: 'fajr', time: todayPrayers[0].time, isActive: false };
  }

  protected readonly timeUntilNext = computed(() => {
    const next = this.getNextTodayPrayer();
    if (!next || !next.time) return 'Loading...';

    const now = new Date();
    const timeStr = next.time.trim();
    const timeMatch = timeStr.match(/(\d{1,2}):(\d{2})/);
    if (!timeMatch) return '';

    const hours = parseInt(timeMatch[1], 10);
    const minutes = parseInt(timeMatch[2], 10);

    const nextTime = new Date(now);
    nextTime.setHours(hours, minutes, 0, 0);

    // If the prayer time has passed today, it's for tomorrow
    if (nextTime < now) {
      nextTime.setDate(nextTime.getDate() + 1);
    }

    const diff = nextTime.getTime() - now.getTime();
    const diffHours = Math.floor(diff / (1000 * 60 * 60));
    const diffMinutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    // Build time string with proper formatting
    const parts: string[] = [];

    if (diffHours > 0) {
      parts.push(`${diffHours} ${diffHours === 1 ? 'hr' : 'hrs'}`);
    }

    if (diffMinutes > 0 || parts.length === 0) {
      parts.push(`${diffMinutes} ${diffMinutes === 1 ? 'min' : 'mins'}`);
    }

    return `${parts.join(' ')} until ${next.name}`;
  });

  /**
   * Get prayer trajectory data for visualization
   */
  protected readonly prayerTrajectory = computed(() => {
    const todayPrayers = this.getTodayPrayerTimes();
    if (todayPrayers.length === 0) return null;

    // Use signal for reactive updates (updates every second)
    const now = this.currentTime();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const currentSeconds = now.getSeconds();

    // Filter out Shuruq from trajectory display (but keep it in prayer list)
    const displayPrayers = todayPrayers.filter(p => p.name !== 'Shuruq');
    
    if (displayPrayers.length === 0) return null;

    // Get sunrise and sunset times for day/night cycle mapping
    const sunrisePrayer = todayPrayers.find(p => p.name === 'Shuruq');
    const maghribPrayer = todayPrayers.find(p => p.name === 'Maghrib');
    
    let sunriseMinutes = -1;
    let sunsetMinutes = -1;
    
    if (sunrisePrayer) {
      const sunriseMatch = sunrisePrayer.time.trim().match(/(\d{1,2}):(\d{2})/);
      if (sunriseMatch) {
        sunriseMinutes = parseInt(sunriseMatch[1], 10) * 60 + parseInt(sunriseMatch[2], 10);
      }
    }
    
    if (maghribPrayer) {
      const maghribMatch = maghribPrayer.time.trim().match(/(\d{1,2}):(\d{2})/);
      if (maghribMatch) {
        sunsetMinutes = parseInt(maghribMatch[1], 10) * 60 + parseInt(maghribMatch[2], 10);
      }
    }

    // Parse all prayer times to minutes
    const prayerTimesInMinutes: number[] = displayPrayers.map(prayer => {
      const timeStr = prayer.time.trim();
      const timeMatch = timeStr.match(/(\d{1,2}):(\d{2})/);
      if (!timeMatch) return -1;
      const hours = parseInt(timeMatch[1], 10);
      const minutes = parseInt(timeMatch[2], 10);
      return hours * 60 + minutes;
    });

    // Map arc to day/night cycle:
    // Left flat (0-50): Night before sunrise (0:00 to sunrise)
    // Rising curve (50-300): Sunrise to noon (sunrise to ~12:00)
    // Peak (300): Noon/midday (highest point = day)
    // Descending curve (300-540): Afternoon to sunset (noon to sunset/Maghrib)
    // Right flat (540-600): Night after sunset (Isha and beyond)
    const totalDayMinutes = 24 * 60; // 1440 minutes = 24 hours
    
    // Default values if sunrise/sunset not found (use 6 AM and 6 PM)
    if (sunriseMinutes === -1) sunriseMinutes = 6 * 60; // 6:00 AM
    if (sunsetMinutes === -1) sunsetMinutes = 18 * 60; // 6:00 PM
    
    const noonMinutes = 12 * 60; // 12:00 PM (noon)
    
    // Get Maghrib and Isha times for better spacing
    const maghribIndex = displayPrayers.findIndex(p => p.name === 'Maghrib');
    const ishaIndex = displayPrayers.findIndex(p => p.name === 'Isha');
    const maghribMinutes = maghribIndex >= 0 ? prayerTimesInMinutes[maghribIndex] : sunsetMinutes;
    const ishaMinutes = ishaIndex >= 0 ? prayerTimesInMinutes[ishaIndex] : sunsetMinutes + 90; // Default 1.5 hours after sunset
    
    // Calculate arc section boundaries in time (minutes from midnight)
    // Adjusted mapping: Descending curve ends earlier (at x=540) to give more space for night prayers
    const nightStartMinutes = 0;
    const dayStartMinutes = sunriseMinutes; // Start of rising curve
    const dayPeakMinutes = noonMinutes; // Peak of arc
    const dayEndMinutes = sunsetMinutes; // End of descending curve (at sunset)
    const maghribEndMinutes = maghribMinutes; // Maghrib time (end of descending curve visually)
    const ishaEndMinutes = ishaMinutes; // Isha time
    const nightEndMinutes = totalDayMinutes; // End of night

    // Calculate positions based on day/night cycle with improved spacing for Maghrib and Isha
    const positions: number[] = [];
    for (let i = 0; i < displayPrayers.length; i++) {
      const currentPrayerMinutes = prayerTimesInMinutes[i];
      const prayerName = displayPrayers[i].name;
      
      let normalizedPosition: number;
      
      if (currentPrayerMinutes < dayStartMinutes) {
        // Night before sunrise: map to left flat section (0 to 50)
        const nightDuration = dayStartMinutes - nightStartMinutes || 1;
        const timeFromMidnight = currentPrayerMinutes - nightStartMinutes;
        normalizedPosition = (timeFromMidnight / nightDuration) * (50 / 600);
      } else if (currentPrayerMinutes < dayPeakMinutes) {
        // Morning: map to rising curve section (50 to 300)
        const morningDuration = dayPeakMinutes - dayStartMinutes || 1;
        const timeFromSunrise = currentPrayerMinutes - dayStartMinutes;
        const morningProgress = timeFromSunrise / morningDuration;
        normalizedPosition = (50 + (morningProgress * 250)) / 600;
      } else if (currentPrayerMinutes <= maghribEndMinutes) {
        // Afternoon to Maghrib: map to descending curve section (300 to 540)
        // Maghrib should be near the end of descending curve (at sunset)
        const afternoonDuration = maghribEndMinutes - dayPeakMinutes || 1;
        const timeFromNoon = currentPrayerMinutes - dayPeakMinutes;
        const afternoonProgress = timeFromNoon / afternoonDuration;
        // Map to 300-540 (240 units instead of 250) to leave more space for Isha
        normalizedPosition = (300 + (afternoonProgress * 240)) / 600;
      } else {
        // Night after Maghrib (Isha and beyond): map to right flat section (540 to 600)
        // Give more space: map Isha to be further right, not too close to Maghrib
        if (prayerName === 'Isha') {
          // Isha gets position around 560-580 for better spacing from Maghrib
          const timeFromMaghrib = currentPrayerMinutes - maghribEndMinutes;
          const timeToMidnight = nightEndMinutes - maghribEndMinutes || 1;
          // Map Isha to 560-580 range (20 units), giving good visual separation
          const ishaProgress = Math.min(1, timeFromMaghrib / Math.max(180, timeToMidnight)); // Cap at 3 hours for visual spacing
          normalizedPosition = (540 + (ishaProgress * 60)) / 600; // Use 60 units for better spacing
          // Ensure Isha is at least at 560 (good separation from Maghrib at ~540)
          normalizedPosition = Math.max(560 / 600, normalizedPosition);
        } else {
          // Other prayers after sunset (shouldn't happen, but just in case)
          const timeFromSunset = currentPrayerMinutes - dayEndMinutes;
          const nightDuration = nightEndMinutes - dayEndMinutes || 1;
          normalizedPosition = (540 + ((timeFromSunset / nightDuration) * 60)) / 600;
        }
      }
      
      positions.push(Math.max(0, Math.min(1, normalizedPosition)));
    }

    // Calculate curve points for each position along the day/night cycle arc path
    // Path: M 0 160 L 50 160 C 150 160, 240 40, 300 40 S 450 160, 550 160 L 600 160
    // Position t is already normalized to 0-1 range representing position along the 600-unit arc
    // We need to find the point on the path at distance t along the path
    const curvePoints = positions.map(t => {
      // Map t (0-1) to x coordinate along the full arc (0 to 600)
      const targetX = t * 600;

      // Calculate y based on which segment of the path we're in
      let x: number, y: number;
      
      if (targetX <= 50) {
        // Flat start section (0 to 50): y = 160
        x = targetX;
        y = 160;
      } else if (targetX >= 550) {
        // Flat end section (550 to 600): y = 160
        x = targetX;
        y = 160;
      } else if (targetX <= 300) {
        // First cubic Bezier: C 150 160, 240 40, 300 40 (from 50,160)
        // Need to find t value where x coordinate matches targetX
        // Use binary search or approximate by iterating to find correct t
        const startX = 50, startY = 160;
        const cp1X = 150, cp1Y = 160;
        const cp2X = 240, cp2Y = 40;
        const endX = 300, endY = 40;
        
        // Binary search for t that gives us the targetX
        let segmentT = 0;
        let low = 0, high = 1;
        for (let i = 0; i < 20; i++) {
          segmentT = (low + high) / 2;
          const testX = Math.pow(1 - segmentT, 3) * startX +
                       3 * Math.pow(1 - segmentT, 2) * segmentT * cp1X +
                       3 * (1 - segmentT) * Math.pow(segmentT, 2) * cp2X +
                       Math.pow(segmentT, 3) * endX;
          
          if (Math.abs(testX - targetX) < 0.01) break;
          if (testX < targetX) {
            low = segmentT;
          } else {
            high = segmentT;
          }
        }
        
        // Now calculate y using the found t
        y = Math.pow(1 - segmentT, 3) * startY +
            3 * Math.pow(1 - segmentT, 2) * segmentT * cp1Y +
            3 * (1 - segmentT) * Math.pow(segmentT, 2) * cp2Y +
            Math.pow(segmentT, 3) * endY;
        x = targetX;
      } else {
        // Second cubic Bezier (smooth): S 440 160, 540 160 (from 300,40)
        // Adjusted to end at 540 instead of 550 for better spacing
        // For smooth curve, first control point is reflection: (360, 40)
        const startX = 300, startY = 40;
        const cp1X = 360, cp1Y = 40;
        const cp2X = 440, cp2Y = 160; // Adjusted control point
        const endX = 540, endY = 160; // End at 540 instead of 550
        
        // Binary search for t that gives us the targetX
        let segmentT = 0;
        let low = 0, high = 1;
        for (let i = 0; i < 20; i++) {
          segmentT = (low + high) / 2;
          const testX = Math.pow(1 - segmentT, 3) * startX +
                       3 * Math.pow(1 - segmentT, 2) * segmentT * cp1X +
                       3 * (1 - segmentT) * Math.pow(segmentT, 2) * cp2X +
                       Math.pow(segmentT, 3) * endX;
          
          if (Math.abs(testX - targetX) < 0.01) break;
          if (testX < targetX) {
            low = segmentT;
          } else {
            high = segmentT;
          }
        }
        
        // Now calculate y using the found t
        y = Math.pow(1 - segmentT, 3) * startY +
            3 * Math.pow(1 - segmentT, 2) * segmentT * cp1Y +
            3 * (1 - segmentT) * Math.pow(segmentT, 2) * cp2Y +
            Math.pow(segmentT, 3) * endY;
        x = targetX;
      }

      return { x, y };
    });

    // Calculate continuous progress based on current time (0 to 1)
    // Progress represents position in day/night cycle arc (same logic as marker positions)
    let progress = 0;
    
    // Use precise time with seconds for smooth animation
    const currentTimeWithSeconds = currentMinutes + (currentSeconds / 60);
    const currentTimeMinutes = Math.floor(currentTimeWithSeconds);
    
    // Map current time to day/night cycle position (same logic as marker positions)
    if (currentTimeMinutes < dayStartMinutes) {
      // Night before sunrise
      const nightDuration = dayStartMinutes - nightStartMinutes || 1;
      const timeFromMidnight = currentTimeMinutes - nightStartMinutes;
      progress = (timeFromMidnight / nightDuration) * (50 / 600);
    } else if (currentTimeMinutes < dayPeakMinutes) {
      // Morning (rising curve)
      const morningDuration = dayPeakMinutes - dayStartMinutes || 1;
      const timeFromSunrise = currentTimeMinutes - dayStartMinutes;
      const morningProgress = timeFromSunrise / morningDuration;
      progress = (50 + (morningProgress * 250)) / 600;
    } else if (currentTimeMinutes < dayEndMinutes) {
      // Afternoon (descending curve)
      const afternoonDuration = dayEndMinutes - dayPeakMinutes || 1;
      const timeFromNoon = currentTimeMinutes - dayPeakMinutes;
      const afternoonProgress = timeFromNoon / afternoonDuration;
      progress = (300 + (afternoonProgress * 250)) / 600;
      } else {
        // Night after sunset (adjusted mapping)
        const nightDuration = nightEndMinutes - dayEndMinutes || 1;
        const timeFromSunset = currentTimeMinutes - dayEndMinutes;
        // Map to 540-600 range (60 units) for better spacing
        progress = (540 + ((timeFromSunset / nightDuration) * 60)) / 600;
      }
    
    progress = Math.max(0, Math.min(1, progress));
    
    // Find first and last prayer minutes for segment calculations
    const firstPrayerMinutes = prayerTimesInMinutes[0];
    const lastPrayerMinutes = prayerTimesInMinutes[prayerTimesInMinutes.length - 1];
    
    // Optional: Use segment-based interpolation for smoother transitions between prayers
    // But keep the base day/night cycle progress calculation above
    if (currentMinutes >= firstPrayerMinutes && currentMinutes < lastPrayerMinutes) {
      // Find which segment we're in (between which two prayers)
      let segmentStartIndex = -1;
      let segmentEndIndex = -1;

      for (let i = 0; i < prayerTimesInMinutes.length - 1; i++) {
        const startMinutes = prayerTimesInMinutes[i];
        const endMinutes = prayerTimesInMinutes[i + 1];

        // Handle time comparison across midnight if needed
        if (endMinutes < startMinutes) {
          // Segment crosses midnight
          if (currentMinutes >= startMinutes || currentMinutes <= endMinutes) {
            segmentStartIndex = i;
            segmentEndIndex = i + 1;
            break;
          }
        } else {
          // Normal segment within same day
          if (currentMinutes >= startMinutes && currentMinutes < endMinutes) {
            segmentStartIndex = i;
            segmentEndIndex = i + 1;
            break;
          }
        }
      }

      if (segmentStartIndex >= 0 && segmentEndIndex >= 0) {
        const startMinutes = prayerTimesInMinutes[segmentStartIndex];
        const endMinutes = prayerTimesInMinutes[segmentEndIndex];
        const segmentStartPos = positions[segmentStartIndex];
        const segmentEndPos = positions[segmentEndIndex];

        let segmentDuration: number;
        let timeInSegment: number;

        if (endMinutes < startMinutes) {
          // Segment crosses midnight
          segmentDuration = (totalDayMinutes - startMinutes) + endMinutes;
          if (currentMinutes >= startMinutes) {
            timeInSegment = currentTimeWithSeconds - startMinutes;
          } else {
            timeInSegment = (totalDayMinutes - startMinutes) + currentTimeWithSeconds;
          }
        } else {
          segmentDuration = endMinutes - startMinutes;
          timeInSegment = currentTimeWithSeconds - startMinutes;
        }

        // Calculate progress within segment (0 to 1)
        const segmentProgress = Math.max(0, Math.min(1, timeInSegment / segmentDuration));

        // Interpolate progress between segment start and end positions for smoother animation
        const interpolatedProgress = segmentStartPos + (segmentEndPos - segmentStartPos) * segmentProgress;
        // Use interpolated progress if we're between prayers, otherwise use 24-hour progress
        progress = interpolatedProgress;
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

    // Determine which prayers have passed and find next prayer
    let nextPrayerIndex = -1;
    if (currentPrayerIndex >= 0 && currentPrayerIndex < displayPrayers.length - 1) {
      nextPrayerIndex = currentPrayerIndex + 1;
    } else if (currentPrayerIndex === -1 && displayPrayers.length > 0) {
      nextPrayerIndex = 0;
    } else if (currentPrayerIndex === displayPrayers.length - 1) {
      // After last prayer, next is first prayer of next day (but we'll show full progress)
      // For now, keep nextPrayerIndex as -1 to avoid showing gray marker
      nextPrayerIndex = -1;
    }

    const prayersWithStatus = displayPrayers.map((prayer, index) => {
      const prayerMinutes = prayerTimesInMinutes[index];
      const hasPassed = prayerMinutes >= 0 && currentMinutes >= prayerMinutes;

      return {
        ...prayer,
        hasPassed,
        isCurrent: index === currentPrayerIndex,
        isNext: index === nextPrayerIndex
      };
    });

    // Calculate the endpoint position on the curve based on progress
    // Add a small offset to move it slightly ahead to avoid sharp edge
    const progressValue = Math.max(0, Math.min(1, progress));
    // Offset is 2 minutes in terms of the arc position (2/1440 of total day = small offset)
    const offsetMinutes = 2;
    let offsetProgress = progressValue + (offsetMinutes / totalDayMinutes) * (600 / 600);
    offsetProgress = Math.min(1, offsetProgress);
    let endpointPosition = { x: 0, y: 0 };

    // Map offset progress (0-1) to x coordinate along the full arc (0-600)
    const targetX = offsetProgress * 600;

    // Calculate y based on which segment of the path we're in (same logic as curvePoints)
    let x: number = targetX;
    let y: number = 160; // Default to flat section
    
    if (targetX <= 50) {
      // Flat start section
      y = 160;
    } else if (targetX >= 540) {
      // Right flat section now starts at 540 (adjusted for better spacing)
      y = 160;
    } else if (targetX <= 300) {
      // First cubic Bezier segment
      const startX = 50, startY = 160;
      const cp1X = 150, cp1Y = 160;
      const cp2X = 240, cp2Y = 40;
      const endX = 300, endY = 40;
      
      // Binary search for t
      let segmentT = 0;
      let low = 0, high = 1;
      for (let i = 0; i < 20; i++) {
        segmentT = (low + high) / 2;
        const testX = Math.pow(1 - segmentT, 3) * startX +
                     3 * Math.pow(1 - segmentT, 2) * segmentT * cp1X +
                     3 * (1 - segmentT) * Math.pow(segmentT, 2) * cp2X +
                     Math.pow(segmentT, 3) * endX;
        
        if (Math.abs(testX - targetX) < 0.01) break;
        if (testX < targetX) {
          low = segmentT;
        } else {
          high = segmentT;
        }
      }
      
      y = Math.pow(1 - segmentT, 3) * startY +
          3 * Math.pow(1 - segmentT, 2) * segmentT * cp1Y +
          3 * (1 - segmentT) * Math.pow(segmentT, 2) * cp2Y +
          Math.pow(segmentT, 3) * endY;
      x = targetX;
    } else if (targetX <= 540) {
      // Second cubic Bezier segment (ends at 540)
      const startX = 300, startY = 40;
      const cp1X = 360, cp1Y = 40;
      const cp2X = 440, cp2Y = 160; // Adjusted control point
      const endX = 540, endY = 160; // End at 540
      
      // Binary search for t
      let segmentT = 0;
      let low = 0, high = 1;
      for (let i = 0; i < 20; i++) {
        segmentT = (low + high) / 2;
        const testX = Math.pow(1 - segmentT, 3) * startX +
                     3 * Math.pow(1 - segmentT, 2) * segmentT * cp1X +
                     3 * (1 - segmentT) * Math.pow(segmentT, 2) * cp2X +
                     Math.pow(segmentT, 3) * endX;
        
        if (Math.abs(testX - targetX) < 0.01) break;
        if (testX < targetX) {
          low = segmentT;
        } else {
          high = segmentT;
        }
      }
      
      y = Math.pow(1 - segmentT, 3) * startY +
          3 * Math.pow(1 - segmentT, 2) * segmentT * cp1Y +
          3 * (1 - segmentT) * Math.pow(segmentT, 2) * cp2Y +
          Math.pow(segmentT, 3) * endY;
    } else {
      // Fallback for any remaining cases (shouldn't happen, but ensure x,y are set)
      y = 160;
    }
    
    endpointPosition = { x: targetX, y };

    return {
      prayers: prayersWithStatus,
      positions,
      curvePoints,
      currentIndex: currentPrayerIndex,
      progress: progressValue,
      gradientOffset: Math.max(0, Math.min(100, progressValue * 100)),
      endpointPosition
    };
  });

  /**
   * Get gradient offset percentage for trajectory
   */
  getGradientOffset(progress: number | undefined): string {
    if (progress === undefined) return '0%';
    const offset = Math.max(0, Math.min(100, progress * 100));
    return `${offset}%`;
  }

  /**
   * Helper method to get if prayer has passed (for template)
   */
  getPrayerHasPassed(prayer: any): boolean {
    return prayer?.hasPassed === true;
  }

  /**
   * Helper method to get if prayer is current (for template)
   */
  getPrayerIsCurrent(prayer: any, index: number): boolean {
    if (prayer?.isCurrent !== undefined) {
      return prayer.isCurrent === true;
    }
    // Fallback to checking index
    const trajectory = this.prayerTrajectory();
    return trajectory?.currentIndex === index;
  }

  /**
   * Helper method to get if prayer is next (for template)
   */
  getPrayerIsNext(prayer: any): boolean {
    return prayer?.isNext === true;
  }

  protected readonly formattedDate = computed(() => {
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

  protected readonly hijriDate = computed(() => {
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

  constructor(private prayerTimeStore: PrayerTimeStore) {}

  ngOnInit(): void {
    this.loadPrayerTimes();

    // Update current time every second for smooth progress animation
    this.timeInterval = setInterval(() => {
      this.currentTime.set(new Date());
    }, 1000);
  }

  ngOnDestroy(): void {
    if (this.timeInterval) {
      clearInterval(this.timeInterval);
    }
  }

  loadPrayerTimes(): void {
    const today = new Date();

    // Preload prayer times for 3 days before and after today
    this.prayerTimeStore.preloadPrayerTimes(today).subscribe({
      next: (dataArray) => {
        console.log('Prayer times preloaded:', dataArray.length, 'days');
        // Set today's prayer data
        this.updatePrayerDataForDate(today);
      },
      error: (err: Error) => {
        console.error('Error preloading prayer times:', err);
      }
    });
  }

  private updatePrayerDataForDate(date: Date): void {
    // First check cache directly to avoid unnecessary observable subscription
    const dateKey = this.getDateKey(date);
    const cachedData = this.prayerTimeStore.getCachedPrayerTimes(dateKey);

    if (cachedData && cachedData.timings) {
      // Use cached data immediately
      this.prayerData.set(cachedData);
      console.log('Prayer data loaded from cache for:', dateKey);
      return;
    }

    // Not in cache, fetch from API (this should rarely happen after initial load)
    this.prayerTimeStore.getPrayerTimes(date).subscribe({
      next: (data) => {
        if (data && data.timings) {
          this.prayerData.set(data);
          console.log('Prayer data fetched from API for:', dateKey);
        }
      },
      error: (err: Error) => {
        console.error('Error getting prayer times:', err);
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
    this.currentDate.set(newDate);

    if (days !== 0) {
      this.loadPrayerTimesForDate(newDate);
    }
  }

  private loadPrayerTimesForDate(date: Date): void {
    // First, check if the specific date is already cached
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
        error: (err) => {
          console.error('Error preloading prayer times:', err);
        }
      });
    } else {
      // Shouldn't happen, but just in case
      this.updatePrayerDataForDate(date);
    }
  }

  private getTimeMinutes(timeString: string): number {
    const [hours, minutes] = timeString.split(':').map(Number);
    return hours * 60 + minutes;
  }
}

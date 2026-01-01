import { Point, BezierSegment } from './prayer-trajectory.types';
import { TRAJECTORY_CONSTANTS } from './prayer-trajectory.constants';

/**
 * Helper functions for trajectory calculations
 */
export namespace TrajectoryUtils {
  /**
   * Parse time string to minutes from midnight
   * Handles both 24-hour format (HH:MM) and 12-hour format (h:MM AM/PM)
   */
  export function parseTimeToMinutes(timeString: string): number {
    const trimmed = timeString.trim();
    
    // Try to match 12-hour format with AM/PM first
    const twelveHourMatch = trimmed.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (twelveHourMatch) {
      let hours = parseInt(twelveHourMatch[1], 10);
      const minutes = parseInt(twelveHourMatch[2], 10);
      const period = twelveHourMatch[3].toUpperCase();
      
      // Convert 12-hour to 24-hour format
      if (period === 'PM' && hours !== 12) {
        hours += 12;
      } else if (period === 'AM' && hours === 12) {
        hours = 0;
      }
      
      return hours * 60 + minutes;
    }
    
    // Fall back to 24-hour format (HH:MM)
    const match = trimmed.match(/(\d{1,2}):(\d{2})/);
    if (!match) return -1;
    const hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    return hours * 60 + minutes;
  }

  /**
   * Calculate point on cubic Bezier curve using binary search
   */
  export function getPointOnBezierCurve(
    segment: BezierSegment,
    targetX: number
  ): Point {
    let segmentT = 0;
    let low = 0;
    let high = 1;

    // Binary search for t parameter that matches targetX
    for (let i = 0; i < TRAJECTORY_CONSTANTS.BINARY_SEARCH_ITERATIONS; i++) {
      segmentT = (low + high) / 2;
      const testX =
        Math.pow(1 - segmentT, 3) * segment.startX +
        3 * Math.pow(1 - segmentT, 2) * segmentT * segment.cp1X +
        3 * (1 - segmentT) * Math.pow(segmentT, 2) * segment.cp2X +
        Math.pow(segmentT, 3) * segment.endX;

      if (Math.abs(testX - targetX) < TRAJECTORY_CONSTANTS.BINARY_SEARCH_TOLERANCE) {
        break;
      }

      if (testX < targetX) {
        low = segmentT;
      } else {
        high = segmentT;
      }
    }

    // Calculate y coordinate using found t
    const y =
      Math.pow(1 - segmentT, 3) * segment.startY +
      3 * Math.pow(1 - segmentT, 2) * segmentT * segment.cp1Y +
      3 * (1 - segmentT) * Math.pow(segmentT, 2) * segment.cp2Y +
      Math.pow(segmentT, 3) * segment.endY;

    return { x: targetX, y };
  }

  /**
   * Get point on trajectory path at normalized position (0-1)
   */
  export function getPointOnPath(normalizedPosition: number): Point {
    const targetX = normalizedPosition * TRAJECTORY_CONSTANTS.PATH_WIDTH;

    // Flat start section (0 to 50)
    if (targetX <= TRAJECTORY_CONSTANTS.FLAT_START_END) {
      return { x: targetX, y: TRAJECTORY_CONSTANTS.FLAT_Y };
    }

    // Flat end section (540 to 600)
    if (targetX >= TRAJECTORY_CONSTANTS.FLAT_END_START) {
      return { x: targetX, y: TRAJECTORY_CONSTANTS.FLAT_Y };
    }

    // First cubic Bezier segment (50 to 300): Rising curve
    if (targetX <= TRAJECTORY_CONSTANTS.CURVE_PEAK_X) {
      const segment: BezierSegment = {
        startX: TRAJECTORY_CONSTANTS.FLAT_START_END,
        startY: TRAJECTORY_CONSTANTS.FLAT_Y,
        cp1X: 150,
        cp1Y: TRAJECTORY_CONSTANTS.FLAT_Y,
        cp2X: 240,
        cp2Y: TRAJECTORY_CONSTANTS.CURVE_PEAK_Y,
        endX: TRAJECTORY_CONSTANTS.CURVE_PEAK_X,
        endY: TRAJECTORY_CONSTANTS.CURVE_PEAK_Y
      };
      return getPointOnBezierCurve(segment, targetX);
    }

    // Second cubic Bezier segment (300 to 540): Descending curve
    const segment: BezierSegment = {
      startX: TRAJECTORY_CONSTANTS.CURVE_PEAK_X,
      startY: TRAJECTORY_CONSTANTS.CURVE_PEAK_Y,
      cp1X: 360,
      cp1Y: TRAJECTORY_CONSTANTS.CURVE_PEAK_Y,
      cp2X: 440,
      cp2Y: TRAJECTORY_CONSTANTS.FLAT_Y,
      endX: TRAJECTORY_CONSTANTS.FLAT_END_START,
      endY: TRAJECTORY_CONSTANTS.FLAT_Y
    };
    return getPointOnBezierCurve(segment, targetX);
  }

  /**
   * Map prayer time to normalized position on trajectory arc
   */
  export function mapTimeToPosition(
    prayerMinutes: number,
    sunriseMinutes: number,
    sunsetMinutes: number,
    maghribMinutes: number,
    ishaMinutes: number,
    prayerName: string
  ): number {
    const noonMinutes = TRAJECTORY_CONSTANTS.NOON_MINUTES;

    // Night before sunrise: map to left flat section (0 to 50)
    if (prayerMinutes < sunriseMinutes) {
      const nightDuration = sunriseMinutes || 1;
      const timeFromMidnight = prayerMinutes;
      return (timeFromMidnight / nightDuration) * (TRAJECTORY_CONSTANTS.FLAT_START_END / TRAJECTORY_CONSTANTS.PATH_WIDTH);
    }

    // Morning: map to rising curve section (50 to 300)
    if (prayerMinutes < noonMinutes) {
      const morningDuration = noonMinutes - sunriseMinutes || 1;
      const timeFromSunrise = prayerMinutes - sunriseMinutes;
      const morningProgress = timeFromSunrise / morningDuration;
      return (TRAJECTORY_CONSTANTS.FLAT_START_END + (morningProgress * 250)) / TRAJECTORY_CONSTANTS.PATH_WIDTH;
    }

    // Afternoon to Maghrib: map to descending curve section (300 to 540)
    if (prayerMinutes <= maghribMinutes) {
      const afternoonDuration = maghribMinutes - noonMinutes || 1;
      const timeFromNoon = prayerMinutes - noonMinutes;
      const afternoonProgress = timeFromNoon / afternoonDuration;
      return (TRAJECTORY_CONSTANTS.CURVE_PEAK_X + (afternoonProgress * 240)) / TRAJECTORY_CONSTANTS.PATH_WIDTH;
    }

    // Night after Maghrib (Isha): map to right flat section (540 to 600)
    if (prayerName === 'Isha') {
      const timeFromMaghrib = prayerMinutes - maghribMinutes;
      const timeToMidnight = TRAJECTORY_CONSTANTS.MINUTES_PER_DAY - maghribMinutes || 1;
      const ishaProgress = Math.min(1, timeFromMaghrib / Math.max(180, timeToMidnight));
      let normalizedPosition = (TRAJECTORY_CONSTANTS.FLAT_END_START + (ishaProgress * 60)) / TRAJECTORY_CONSTANTS.PATH_WIDTH;
      // Ensure Isha is at least at 560 for better spacing
      return Math.max(560 / TRAJECTORY_CONSTANTS.PATH_WIDTH, normalizedPosition);
    }

    // Fallback for other prayers after sunset
    const timeFromSunset = prayerMinutes - sunsetMinutes;
    const nightDuration = TRAJECTORY_CONSTANTS.MINUTES_PER_DAY - sunsetMinutes || 1;
    return (TRAJECTORY_CONSTANTS.FLAT_END_START + ((timeFromSunset / nightDuration) * 60)) / TRAJECTORY_CONSTANTS.PATH_WIDTH;
  }

  /**
   * Get gradient offset percentage for trajectory
   */
  export function getGradientOffset(progress: number | undefined): string {
    if (progress === undefined) return '0%';
    const offset = Math.max(0, Math.min(100, progress * 100));
    return `${offset}%`;
  }
}


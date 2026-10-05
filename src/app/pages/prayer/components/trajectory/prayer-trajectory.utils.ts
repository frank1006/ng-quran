import { Point } from './prayer-trajectory.types';
import { TRAJECTORY_CONSTANTS as C } from './prayer-trajectory.constants';

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
    return parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
  }

  /** Sun arc for one day: horizon at sunrise and sunset, peak at solar noon. */
  export interface ArcModel {
    windowStart: number;
    windowEnd: number;
    sunrise: number;
    sunset: number;
  }

  /** Maps a time (minutes from midnight) to a point on the arc. */
  export function pointAt(model: ArcModel, minutes: number): Point {
    const x = ((minutes - model.windowStart) / (model.windowEnd - model.windowStart)) * C.WIDTH;
    const noon = (model.sunrise + model.sunset) / 2;
    const halfDay = Math.max(1, (model.sunset - model.sunrise) / 2);
    // cos is 1 at noon and 0 at sunrise/sunset; clamp so the night side doesn't curve back up
    const angle = Math.max(-Math.PI, Math.min(Math.PI, ((minutes - noon) / halfDay) * (Math.PI / 2)));
    const c = Math.cos(angle);
    // Below the horizon, compress smoothly (same slope at the horizon, shallower dip)
    const height = c >= 0 ? c : c / (1 - c * C.NIGHT_COMPRESSION);
    return { x: round(x), y: round(C.HORIZON_Y - C.DAY_AMPLITUDE * height) };
  }

  /** SVG path along the arc between two times. */
  export function pathBetween(model: ArcModel, from: number, to: number): string {
    if (to <= from) return '';
    const steps = Math.max(2, Math.ceil((C.SAMPLES * (to - from)) / (model.windowEnd - model.windowStart)));
    const points: string[] = [];
    for (let i = 0; i <= steps; i++) {
      const p = pointAt(model, from + ((to - from) * i) / steps);
      points.push(`${p.x} ${p.y}`);
    }
    return `M ${points.join(' L ')}`;
  }

  function round(value: number): number {
    return Math.round(value * 10) / 10;
  }
}

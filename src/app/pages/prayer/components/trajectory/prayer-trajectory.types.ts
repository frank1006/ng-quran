/**
 * Types for the prayer trajectory (sun arc) visualization
 */

export interface Point {
  x: number;
  y: number;
}

export interface PrayerItemWithStatus {
  name: string;
  time: string;
  key: string;
  isActive: boolean;
  hasPassed: boolean;
  isCurrent: boolean;
  isNext: boolean;
}

export interface TrajectoryMarker extends PrayerItemWithStatus {
  point: Point;
}

export interface TrajectoryData {
  /** Prayer markers positioned on the arc */
  markers: TrajectoryMarker[];
  /** SVG path for the whole day */
  fullPath: string;
  /** SVG path from the start of the window to now ('' before the window starts) */
  elapsedPath: string;
  /** Current time on the arc, or null when outside the drawn window */
  now: Point | null;
  /** y of the horizon (sunrise and Maghrib sit on it) */
  horizonY: number;
}

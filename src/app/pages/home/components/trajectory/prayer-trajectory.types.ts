/**
 * Point coordinates for SVG visualization
 */
export interface Point {
  x: number;
  y: number;
}

/**
 * Prayer item with trajectory status for visualization
 */
export interface PrayerItemWithStatus {
  name: string;
  time: string;
  key: string;
  isActive: boolean;
  hasPassed: boolean;
  isCurrent: boolean;
  isNext: boolean;
}

/**
 * Trajectory visualization data
 */
export interface TrajectoryData {
  prayers: PrayerItemWithStatus[];
  positions: number[];
  curvePoints: Point[];
  currentIndex: number;
  progress: number;
  gradientOffset: number;
  endpointPosition: Point;
}

/**
 * Bezier curve control points for trajectory path
 */
export interface BezierSegment {
  startX: number;
  startY: number;
  cp1X: number;
  cp1Y: number;
  cp2X: number;
  cp2Y: number;
  endX: number;
  endY: number;
}


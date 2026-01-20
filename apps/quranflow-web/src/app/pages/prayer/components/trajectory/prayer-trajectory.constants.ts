/**
 * Constants for trajectory visualization
 */
export const TRAJECTORY_CONSTANTS = {
  // SVG path constants
  FLAT_START_END: 50,
  CURVE_PEAK_X: 300,
  CURVE_PEAK_Y: 40,
  FLAT_END_START: 540,
  PATH_WIDTH: 600,
  PATH_HEIGHT: 160,
  FLAT_Y: 160,
  
  // Time mapping constants
  NOON_MINUTES: 12 * 60, // 12:00 PM
  DEFAULT_SUNRISE_MINUTES: 6 * 60, // 6:00 AM
  DEFAULT_SUNSET_MINUTES: 18 * 60, // 6:00 PM
  MINUTES_PER_DAY: 24 * 60, // 1440 minutes
  
  // Binary search precision
  BINARY_SEARCH_ITERATIONS: 20,
  BINARY_SEARCH_TOLERANCE: 0.01,
  
  // Progress offset (2 minutes in arc position)
  PROGRESS_OFFSET_MINUTES: 2,
  
  // Endpoint styling
  ENDPOINT_RADIUS: 4.25,
} as const;


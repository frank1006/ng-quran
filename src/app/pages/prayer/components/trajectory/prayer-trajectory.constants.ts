/**
 * Geometry for the sun-arc trajectory (SVG user units)
 */
export const TRAJECTORY_CONSTANTS = {
  WIDTH: 600,
  HEIGHT: 200,
  HORIZON_Y: 150,
  /** Height of the arc above the horizon at solar noon */
  DAY_AMPLITUDE: 128,
  /** Flattens the arc below the horizon (1 / (1 + k) of the day height at most), keeping the curve smooth */
  NIGHT_COMPRESSION: 2.2,
  /** Minutes drawn before Fajr and after Isha */
  WINDOW_PADDING_MINUTES: 75,
  /** Number of line segments used to draw the arc */
  SAMPLES: 96,
  MINUTES_PER_DAY: 24 * 60,
  DEFAULT_SUNRISE_MINUTES: 6 * 60,
  DEFAULT_SUNSET_MINUTES: 18 * 60,
} as const;

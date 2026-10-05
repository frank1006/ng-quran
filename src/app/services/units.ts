/** Measurement units: distances are kept in km internally and converted only for display. */
export type DistanceUnit = 'km' | 'mi';
export type TemperatureUnit = 'C' | 'F';

export const KM_PER_MILE = 1.609344;

/** Regions that use miles on road signs, and °F for weather. */
const MILE_REGIONS = ['US', 'GB', 'LR', 'MM'];
const FAHRENHEIT_REGIONS = ['US', 'LR', 'MM', 'BS', 'BZ', 'KY', 'PW', 'FM', 'MH'];

/** The phone's region (from its language setting, e.g. en-US → US), or ''. */
export function deviceRegion(languages: readonly string[] = navigator.languages ?? [navigator.language]): string {
  for (const tag of languages) {
    try {
      const region = new Intl.Locale(tag).maximize().region;
      if (region) return region;
    } catch {
      // Ignore malformed tags
    }
  }
  return '';
}

export function defaultDistanceUnit(region = deviceRegion()): DistanceUnit {
  return MILE_REGIONS.includes(region) ? 'mi' : 'km';
}

export function defaultTemperatureUnit(region = deviceRegion()): TemperatureUnit {
  return FAHRENHEIT_REGIONS.includes(region) ? 'F' : 'C';
}

/** Masjid distance filter options, in km, with round numbers in the user's unit. */
export function masjidRadiusOptionsKm(unit: DistanceUnit): number[] {
  return unit === 'mi' ? [1, 3, 5, 15].map(mi => mi * KM_PER_MILE) : [1, 5, 10, 25];
}

/** "5 km" / "3 mi" for a filter option (given in km). */
export function radiusLabel(km: number, unit: DistanceUnit): string {
  return unit === 'mi' ? `${Math.round(km / KM_PER_MILE)} mi` : `${Math.round(km)} km`;
}

/** "900 m" / "1.4 km" or "500 ft" / "0.9 mi". */
export function formatDistance(km: number, unit: DistanceUnit): string {
  if (unit === 'mi') {
    const miles = km / KM_PER_MILE;
    return miles < 0.1 ? `${Math.round(miles * 5280 / 10) * 10} ft` : `${miles.toFixed(1)} mi`;
  }
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

export function formatTemperature(celsius: number, unit: TemperatureUnit): string {
  const value = unit === 'F' ? celsius * 9 / 5 + 32 : celsius;
  return `${Math.round(value)}°`;
}

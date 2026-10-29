import {
  DEFAULT_DISTANCE_UNIT, DEFAULT_TEMPERATURE_UNIT, formatDistance, formatTemperature, masjidRadiusOptionsKm, radiusLabel,
} from './units';

describe('units', () => {
  it('starts in km and °C', () => {
    expect(DEFAULT_DISTANCE_UNIT).toBe('km');
    expect(DEFAULT_TEMPERATURE_UNIT).toBe('C');
  });

  it('formats distances in both units', () => {
    expect(formatDistance(0.9, 'km')).toBe('900 m');
    expect(formatDistance(15.84, 'km')).toBe('15.8 km');
    expect(formatDistance(1.609344, 'mi')).toBe('1.0 mi');
    expect(formatDistance(0.1, 'mi')).toBe('330 ft');
  });

  it('offers round filter options in each unit', () => {
    expect(masjidRadiusOptionsKm('km')).toEqual([1, 5, 10, 25]);
    expect(masjidRadiusOptionsKm('mi').map(km => radiusLabel(km, 'mi'))).toEqual(['1 mi', '3 mi', '5 mi', '15 mi']);
    // Every mile option fits within the proxy's 25 km maximum
    expect(Math.max(...masjidRadiusOptionsKm('mi'))).toBeLessThanOrEqual(25);
  });

  it('formats temperatures', () => {
    expect(formatTemperature(18.4, 'C')).toBe('18°');
    expect(formatTemperature(18.4, 'F')).toBe('65°');
  });
});

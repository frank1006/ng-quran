import { conditionFromCode, conditionLabel } from './weather.service';

describe('weather conditions', () => {
  it('groups WMO codes', () => {
    expect(conditionFromCode(0)).toBe('clear');
    expect(conditionFromCode(2)).toBe('partly');
    expect(conditionFromCode(3)).toBe('cloudy');
    expect(conditionFromCode(45)).toBe('fog');
    expect(conditionFromCode(61)).toBe('rain');
    expect(conditionFromCode(81)).toBe('rain');
    expect(conditionFromCode(73)).toBe('snow');
    expect(conditionFromCode(95)).toBe('storm');
  });

  it('names a clear night', () => {
    expect(conditionLabel('clear', false)).toBe('Clear night');
    expect(conditionLabel('rain', false)).toBe('Rain');
  });
});

import { toCompassHeading } from './qibla.service';

describe('toCompassHeading', () => {
  it('converts absolute alpha (counter-clockwise) to a clockwise heading', () => {
    expect(toCompassHeading({ alpha: 0 }, true)).toBe(0);
    expect(toCompassHeading({ alpha: 90 }, true)).toBe(270); // device turned left: facing west
    expect(toCompassHeading({ alpha: 270 }, true)).toBe(90); // device turned right: facing east
  });

  it('uses the iOS compass heading as-is', () => {
    expect(toCompassHeading({ alpha: 10, webkitCompassHeading: 45 }, false)).toBe(45);
  });

  it('rejects relative orientation, which has no fixed north', () => {
    expect(toCompassHeading({ alpha: 90 }, false)).toBeNull();
  });

  it('returns null when there is no reading', () => {
    expect(toCompassHeading({ alpha: null }, true)).toBeNull();
  });
});

import { nextPrayerText, turnText } from './qibla-live';

const timings = { fajr: '05:12', sunrise: '06:28', dhuhr: '12:19', asr: '15:41', maghrib: '18:10', isha: '19:26' };
const at = (hours: number, minutes: number) => new Date(2026, 9, 10, hours, minutes);

describe('turnText', () => {
  it('says which way and how far', () => {
    expect(turnText(40)).toBe('Turn right 40°');
    expect(turnText(-120.4)).toBe('Turn left 120°');
  });

  it('encourages when close', () => {
    expect(turnText(-20)).toBe('Almost there, 20° left');
    expect(turnText(30)).toBe('Almost there, 30° right');
  });

  it('has nothing to say once the phone faces the Qibla', () => {
    expect(turnText(15)).toBeNull();
    expect(turnText(-3)).toBeNull();
  });
});

describe('nextPrayerText', () => {
  it('names the next prayer and the wait', () => {
    expect(nextPrayerText(timings, at(14, 21))).toBe('Asr in 1 hr 20 mins');
    expect(nextPrayerText(timings, at(12, 18))).toBe('Dhuhr in 1 min');
  });

  it('skips Shuruq, which is not a prayer', () => {
    expect(nextPrayerText(timings, at(5, 30))).toBe('Dhuhr in 6 hrs 49 mins');
  });

  it('moves on at the prayer time itself', () => {
    expect(nextPrayerText(timings, at(15, 41))).toBe('Maghrib in 2 hrs 29 mins');
  });

  it('after Isha, counts to Fajr tomorrow', () => {
    expect(nextPrayerText(timings, at(23, 12))).toBe('Fajr in 6 hrs');
  });

  it('is empty without times', () => {
    expect(nextPrayerText(undefined, at(10, 0))).toBe('');
  });
});

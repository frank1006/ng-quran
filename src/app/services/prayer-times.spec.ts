import { PRAYER_KEYS, autoMethodId, clockTime, prayerTimes } from '../../../shared/prayer-times';
import { ALADHAN_FIXTURES, AladhanFixture } from './prayer-times.fixtures';

const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

/** Minutes from Aladhan's time to ours, the short way round midnight */
const difference = (ours: string, theirs: string) => {
  const d = minutes(ours) - minutes(theirs);
  return d > 720 ? d - 1440 : d < -720 ? d + 1440 : d;
};

/**
 * Days Aladhan showed Morocco's times an hour early (it had Casablanca on UTC+0 while the
 * clocks were on UTC+1); in June and in Ramadan it agreed
 */
const ALADHAN_MOROCCO_HOUR_EARLY = ['2026-10-18', '2026-12-21'];
const moroccoShift = (row: AladhanFixture) =>
  row.timeZone === 'Africa/Casablanca' && ALADHAN_MOROCCO_HOUR_EARLY.includes(row.date) ? 60 : 0;

describe('prayer times on the device', () => {
  it('picks the same automatic method as Aladhan', () => {
    for (const row of ALADHAN_FIXTURES.filter(r => r.method === null)) {
      expect(autoMethodId(row.lat, row.lng), row.city).toBe(row.resolvedMethod);
    }
  });

  it('gives Aladhan’s times within a minute, for every method, place and season', () => {
    for (const row of ALADHAN_FIXTURES) {
      const ours = prayerTimes(row.lat, row.lng, row.date, row.method, row.school);
      for (const key of PRAYER_KEYS) {
        const d = difference(clockTime(ours[key], row.timeZone), row.times[key]) - moroccoShift(row);
        // Aladhan's Asr drifts a few minutes far from the equator around the equinoxes
        const allowed = key === 'asr' && Math.abs(row.lat) > 45 ? 4 : 1;
        expect(Math.abs(d), `${row.city} ${row.date} method ${row.method} ${key}`).toBeLessThanOrEqual(allowed);
      }
    }
  });

  it('puts Umm al-Qura’s Isha two hours after Maghrib in Ramadan, 90 minutes otherwise', () => {
    const ramadan = prayerTimes(21.42, 39.83, '2027-02-20', 4, 0);
    const shawwal = prayerTimes(21.42, 39.83, '2027-04-20', 4, 0);
    expect((ramadan.isha.getTime() - ramadan.maghrib.getTime()) / 60_000).toBe(120);
    expect((shawwal.isha.getTime() - shawwal.maghrib.getTime()) / 60_000).toBe(90);
  });

  it('puts the Hanafi Asr after the standard one', () => {
    const standard = prayerTimes(31.52, 74.36, '2026-10-18', 1, 0);
    const hanafi = prayerTimes(31.52, 74.36, '2026-10-18', 1, 1);
    expect(hanafi.asr.getTime()).toBeGreaterThan(standard.asr.getTime() + 30 * 60_000);
  });

  it('treats an unknown method as automatic', () => {
    expect(prayerTimes(31.52, 74.36, '2026-10-18', 99, 0)).toEqual(prayerTimes(31.52, 74.36, '2026-10-18', null, 0));
  });
});

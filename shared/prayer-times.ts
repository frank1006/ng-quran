/**
 * Prayer times worked out from the sun's position (adhan-js), with no network call. Used by the
 * app (src/app/services/prayer-time.service.ts) and by the push reminder server
 * (api/_lib/push.ts), so the screen and the reminder always agree.
 *
 * Set up to give what the Aladhan API gave before (within a minute, see
 * src/app/services/prayer-times.spec.ts): the same method ids, angles and per-method minute
 * offsets, angle-based high-latitude rule, and the same "automatic" choice: the method whose home
 * city is nearest. Two known differences, both Aladhan's:
 * - Asr above ~45° latitude around the equinoxes, by up to 4 minutes (Aladhan's sun position
 *   isn't taken at Asr itself);
 * - Morocco: for part of the year Aladhan shows the times an hour early (it puts Casablanca on
 *   UTC+0 while the clocks are on UTC+1); here they follow the phone's clock.
 */
import { CalculationParameters, Coordinates, HighLatitudeRule, Madhab, PrayerTimes } from 'adhan';

export const PRAYER_KEYS = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'] as const;
export type PrayerKey = (typeof PRAYER_KEYS)[number];
export type PrayerInstants = Record<PrayerKey, Date>;

interface Method {
  /** Aladhan's method id, as stored in settings */
  id: number;
  fajrAngle: number;
  /** Isha by sun angle, or a fixed number of minutes after sunset */
  isha: { angle: number } | { afterSunset: number };
  maghribAngle?: number;
  /** Minutes added to the calculated times */
  offsets?: Partial<Record<PrayerKey, number>>;
  /** Where the method's authority is; the automatic choice is the nearest one */
  home?: [lat: number, lng: number];
}

// From https://api.aladhan.com/v1/methods (checked 2026-10-18)
const METHODS: Method[] = [
  { id: 0, fajrAngle: 16, isha: { angle: 14 }, maghribAngle: 4, home: [34.6416, 50.8746] },
  { id: 1, fajrAngle: 18, isha: { angle: 18 }, home: [24.8615, 67.0099] },
  { id: 2, fajrAngle: 15, isha: { angle: 15 }, home: [39.7042, -86.3994] },
  { id: 3, fajrAngle: 18, isha: { angle: 17 }, home: [51.5195, -0.136] },
  { id: 4, fajrAngle: 18.5, isha: { afterSunset: 90 }, home: [21.3891, 39.8579] },
  { id: 5, fajrAngle: 19.5, isha: { angle: 17.5 }, home: [30.0444, 31.2357] },
  { id: 7, fajrAngle: 17.7, isha: { angle: 14 }, maghribAngle: 4.5, home: [35.6892, 51.389] },
  { id: 8, fajrAngle: 19.5, isha: { afterSunset: 90 }, home: [24.1324, 53.32] },
  { id: 9, fajrAngle: 18, isha: { angle: 17.5 }, home: [29.3759, 47.9774] },
  { id: 10, fajrAngle: 18, isha: { afterSunset: 90 }, home: [25.2854, 51.531] },
  { id: 11, fajrAngle: 20, isha: { angle: 18 }, home: [1.3521, 103.8198] },
  { id: 12, fajrAngle: 12, isha: { angle: 12 }, home: [48.8566, 2.3522] },
  { id: 13, fajrAngle: 18, isha: { angle: 17 }, offsets: { sunrise: -7, dhuhr: 5, asr: 4, maghrib: 7 }, home: [39.9334, 32.8597] },
  { id: 14, fajrAngle: 16, isha: { angle: 15 }, home: [54.7348, 55.9579] },
  // Moonsighting Committee: seasonal twilight (adhan-js does it for this method); never automatic
  { id: 15, fajrAngle: 18, isha: { angle: 18 } },
  { id: 16, fajrAngle: 18.2, isha: { angle: 18.2 }, offsets: { dhuhr: 3, maghrib: 3 }, home: [25.0763, 55.0874] },
  { id: 17, fajrAngle: 20, isha: { angle: 18 }, home: [3.139, 101.6869] },
  { id: 18, fajrAngle: 18, isha: { angle: 18 }, home: [36.8065, 10.1815] },
  { id: 19, fajrAngle: 18, isha: { angle: 17 }, home: [36.7538, 3.0588] },
  { id: 20, fajrAngle: 20, isha: { angle: 18 }, home: [-6.2088, 106.8456] },
  { id: 21, fajrAngle: 19, isha: { angle: 17 }, offsets: { dhuhr: 5, maghrib: 5 }, home: [33.9716, -6.8498] },
  // Lisbon: Maghrib 3 minutes after sunset, Isha 77 minutes after that
  { id: 22, fajrAngle: 18, isha: { afterSunset: 80 }, offsets: { dhuhr: 5, maghrib: 3 }, home: [38.7223, -9.1393] },
  // Amman: Maghrib 5 minutes after sunset
  { id: 23, fajrAngle: 18, isha: { angle: 18 }, offsets: { maghrib: 5 }, home: [31.9461, 35.9238] },
];

const MOONSIGHTING = 15;
const UMM_AL_QURA = 4;
/** Umm al-Qura's Isha is 2 hours after sunset in Ramadan instead of 90 minutes */
const RAMADAN_EXTRA_ISHA_MIN = 30;

/** The method Aladhan would pick when none is chosen: the one whose home city is nearest */
export function autoMethodId(lat: number, lng: number): number {
  let best = METHODS[0];
  let bestKm = Infinity;
  for (const method of METHODS) {
    if (!method.home) continue;
    const km = distanceKm(lat, lng, method.home[0], method.home[1]);
    if (km < bestKm) {
      best = method;
      bestKm = km;
    }
  }
  return best.id;
}

/**
 * The six times for one calendar day at a place, as instants. `day` is YYYY-MM-DD in the place's
 * own time zone. `method` is an Aladhan method id, or null (or an unknown id) for automatic;
 * `school` 1 is the Hanafi Asr.
 */
export function prayerTimes(lat: number, lng: number, day: string, method: number | null, school: 0 | 1): PrayerInstants {
  const id = method !== null && METHODS.some(m => m.id === method) ? method : autoMethodId(lat, lng);
  const spec = METHODS.find(m => m.id === id)!;

  const params = new CalculationParameters(
    id === MOONSIGHTING ? 'MoonsightingCommittee' : 'Other',
    spec.fajrAngle,
    'angle' in spec.isha ? spec.isha.angle : 0,
    'afterSunset' in spec.isha ? spec.isha.afterSunset : 0,
    spec.maghribAngle ?? 0,
  );
  params.madhab = school === 1 ? Madhab.Hanafi : Madhab.Shafi;
  params.highLatitudeRule = HighLatitudeRule.TwilightAngle;
  params.methodAdjustments = { fajr: 0, sunrise: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0, ...spec.offsets };
  if (id === UMM_AL_QURA && isRamadan(day)) params.ishaInterval += RAMADAN_EXTRA_ISHA_MIN;

  // adhan-js reads the calendar day from the Date's local fields, so build it in local time
  const [year, month, date] = day.split('-').map(Number);
  const times = new PrayerTimes(new Coordinates(lat, lng), new Date(year, month - 1, date), params);
  const result = { fajr: times.fajr, sunrise: times.sunrise, dhuhr: times.dhuhr, asr: times.asr, maghrib: times.maghrib, isha: times.isha };

  // adhan-js takes the sun's position at midnight for Asr, up to ~7 minutes out far from the
  // equator; work it out with the sun's position at Asr itself instead
  result.asr = roundToMinute(asrTime(lat, lng, year, month, date, school) + (spec.offsets?.asr ?? 0) * 60_000);
  if (id === MOONSIGHTING) {
    // The committee's seasonal minutes before sunrise and after sunset, used as they are (adhan-js
    // mixes in the 18° angle, and switches to a seventh of the night above 55°)
    const minutes = seasonalTwilight(lat, year, month, date);
    result.fajr = roundToMinute(times.sunrise.getTime() - minutes.fajr * 60_000);
    result.isha = roundToMinute(times.sunset.getTime() + minutes.isha * 60_000);
  }
  return result;
}

/** "HH:MM" (24-hour) in a time zone; the phone's own when none is given */
export function clockTime(at: Date, timeZone?: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(at);
}

/** Asr as epoch ms (unrounded): when an object's shadow is its noon shadow plus 1 (or 2, Hanafi) lengths */
function asrTime(lat: number, lng: number, year: number, month: number, date: number, school: 0 | 1): number {
  const midnightUtc = Date.UTC(year, month - 1, date);
  const shadow = school === 1 ? 2 : 1;
  const rad = Math.PI / 180;
  // Start from mid-afternoon and refine with the sun's position at the time found
  let hoursUtc = 12 - lng / 15 + 3;
  for (let i = 0; i < 3; i++) {
    const { declination, equationOfTime } = sunPosition(midnightUtc + hoursUtc * 3_600_000);
    const altitude = Math.atan(1 / (shadow + Math.tan(Math.abs(lat - declination) * rad)));
    const cosHour = (Math.sin(altitude) - Math.sin(lat * rad) * Math.sin(declination * rad)) /
      (Math.cos(lat * rad) * Math.cos(declination * rad));
    hoursUtc = 12 - lng / 15 - equationOfTime + Math.acos(cosHour) / rad / 15;
  }
  return midnightUtc + hoursUtc * 3_600_000;
}

/** The sun's declination (degrees) and the equation of time (hours) at an instant */
function sunPosition(at: number): { declination: number; equationOfTime: number } {
  const rad = Math.PI / 180;
  const d = at / 86_400_000 + 2440587.5 - 2451545; // days since J2000
  const g = (357.529 + 0.98560028 * d) * rad;
  const q = 280.459 + 0.98564736 * d;
  const l = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * rad;
  const e = (23.439 - 0.00000036 * d) * rad;
  const rightAscension = Math.atan2(Math.cos(e) * Math.sin(l), Math.cos(l)) / rad / 15;
  const declination = Math.asin(Math.sin(e) * Math.sin(l)) / rad;
  const equationOfTime = q / 15 - (((rightAscension % 24) + 24) % 24);
  return { declination, equationOfTime: equationOfTime - 24 * Math.round(equationOfTime / 24) };
}

/**
 * Moonsighting Committee twilight: minutes from Fajr to sunrise and from sunset to Isha (general
 * shafaq), by latitude and days since the winter solstice. Same formulas as adhan-js.
 */
function seasonalTwilight(lat: number, year: number, month: number, date: number): { fajr: number; isha: number } {
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const dayOfYear = (Date.UTC(year, month - 1, date) - Date.UTC(year, 0, 1)) / 86_400_000 + 1;
  const yearLength = leap ? 366 : 365;
  let days = lat >= 0 ? dayOfYear + 10 : dayOfYear - (leap ? 173 : 172);
  if (days >= yearLength) days -= yearLength;
  if (days < 0) days += yearLength;

  const k = Math.abs(lat) / 55;
  const fajr = seasonal(days, 75 + 28.65 * k, 75 + 19.44 * k, 75 + 32.74 * k, 75 + 48.1 * k);
  const isha = seasonal(days, 75 + 25.6 * k, 75 + 2.05 * k, 75 - 9.21 * k, 75 + 6.14 * k);
  return { fajr: Math.round(fajr), isha: Math.round(isha) };
}

/** Interpolates between the four seasonal values (winter solstice, spring, summer solstice, ...) */
function seasonal(days: number, a: number, b: number, c: number, d: number): number {
  if (days < 91) return a + ((b - a) / 91) * days;
  if (days < 137) return b + ((c - b) / 46) * (days - 91);
  if (days < 183) return c + ((d - c) / 46) * (days - 137);
  if (days < 229) return d + ((c - d) / 46) * (days - 183);
  if (days < 275) return c + ((b - c) / 46) * (days - 229);
  return b + ((a - b) / 91) * (days - 275);
}

function roundToMinute(at: number): Date {
  return new Date(Math.round(at / 60_000) * 60_000);
}

function isRamadan(day: string): boolean {
  const month = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', { month: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${day}T12:00:00Z`));
  return parseInt(month, 10) === 9;
}

function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(a));
}

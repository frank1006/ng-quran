import { PrayerTimings } from '../../../services/prayer-time.types';

/**
 * The live lines of the Qibla page, as plain functions of what the phone reports, so they can be
 * tested without a compass.
 */

/** Within this many degrees the page says "You're facing Makkah" (QiblaService.getInstruction) */
export const FACING_TOLERANCE = 15;
/** Closer than this, the line encourages: "Almost there, 20° left" */
const ALMOST_THERE = 30;

/**
 * How far to turn, from the signed angle between the phone's heading and the Qibla
 * (positive = the Qibla is to the right): "Turn right 40°", "Almost there, 20° left",
 * and null once the phone is facing it.
 */
export function turnText(angleDifference: number): string | null {
  const degrees = Math.round(Math.abs(angleDifference));
  if (degrees <= FACING_TOLERANCE) return null;
  const side = angleDifference > 0 ? 'right' : 'left';
  return degrees <= ALMOST_THERE ? `Almost there, ${degrees}° ${side}` : `Turn ${side} ${degrees}°`;
}

/** The five prayers in order (Shuruq is a time, not a prayer, so it is never "next") */
const PRAYERS: { key: keyof PrayerTimings; name: string }[] = [
  { key: 'fajr', name: 'Fajr' },
  { key: 'dhuhr', name: 'Dhuhr' },
  { key: 'asr', name: 'Asr' },
  { key: 'maghrib', name: 'Maghrib' },
  { key: 'isha', name: 'Isha' },
];

/**
 * The next prayer and how long until it: "Asr in 1 hr 20 mins". After Isha it is Fajr, taken at
 * today's time tomorrow (it moves by a minute or so a day). Empty when the times can't be read.
 */
export function nextPrayerText(timings: PrayerTimings | undefined, now = new Date()): string {
  if (!timings) return '';
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const times = PRAYERS.map(prayer => ({ name: prayer.name, at: minutesOfDay(timings[prayer.key]) })).filter(t => t.at >= 0);
  if (!times.length) return '';
  const next = times.find(t => t.at > nowMinutes);
  const wait = next ? next.at - nowMinutes : times[0].at + 24 * 60 - nowMinutes;
  return `${(next ?? times[0]).name} ${timeUntil(wait)}`;
}

/** "13:07" (or "1:07 PM") as minutes after midnight; -1 if it can't be read */
function minutesOfDay(time: string | undefined): number {
  const match = time?.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!match) return -1;
  let hours = Number(match[1]);
  const period = match[3]?.toUpperCase();
  if (period === 'PM' && hours !== 12) hours += 12;
  if (period === 'AM' && hours === 12) hours = 0;
  return hours * 60 + Number(match[2]);
}

/** "in 1 hr 20 mins", worded as on the Prayer page */
function timeUntil(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours} ${hours === 1 ? 'hr' : 'hrs'}`);
  if (minutes > 0 || !parts.length) parts.push(`${minutes} ${minutes === 1 ? 'min' : 'mins'}`);
  return `in ${parts.join(' ')}`;
}

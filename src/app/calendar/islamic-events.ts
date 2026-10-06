/**
 * Islamic events fall on fixed Hijri dates, so the list lives in the app: it works offline
 * and needs no third-party service. Gregorian dates are worked out from the Hijri calendar.
 */
export type IslamicEventKind =
  | 'major'   // widely observed
  | 'varied'; // observance differs between communities; can be hidden in Profile

export interface IslamicEvent {
  id: string;
  name: string;
  /** Hijri month (1 = Muharram … 12 = Dhu al-Hijjah) and day */
  month: number;
  day: number;
  description: string;
  kind: IslamicEventKind;
  icon: 'crescent' | 'star' | 'kaaba' | 'lantern';
}

export const ISLAMIC_EVENTS: IslamicEvent[] = [
  { id: 'new-year', name: 'Islamic New Year', month: 1, day: 1, kind: 'major', icon: 'crescent',
    description: 'The first day of Muharram and of the Hijri year.' },
  { id: 'ashura', name: 'Day of Ashura', month: 1, day: 10, kind: 'major', icon: 'star',
    description: 'A recommended day of fasting, often together with the 9th or 11th.' },
  { id: 'mawlid', name: 'Mawlid an-Nabi', month: 3, day: 12, kind: 'varied', icon: 'lantern',
    description: 'Marks the birth of the Prophet ﷺ. Observance differs between communities.' },
  { id: 'isra-miraj', name: "Isra & Mi'raj", month: 7, day: 27, kind: 'major', icon: 'star',
    description: "The Prophet's ﷺ night journey to Jerusalem and ascension." },
  { id: 'mid-shaban', name: "Shab-e-Barat (Mid-Sha'ban)", month: 8, day: 15, kind: 'varied', icon: 'lantern',
    description: "The night of the 15th of Sha'ban. Observance differs between communities." },
  { id: 'ramadan', name: 'Ramadan begins', month: 9, day: 1, kind: 'major', icon: 'crescent',
    description: 'The first day of fasting in Ramadan.' },
  { id: 'laylat-al-qadr', name: 'Laylat al-Qadr', month: 9, day: 27, kind: 'major', icon: 'star',
    description: 'Sought in the odd nights of the last ten of Ramadan; many observe the night before the 27th.' },
  { id: 'eid-al-fitr', name: 'Eid al-Fitr', month: 10, day: 1, kind: 'major', icon: 'crescent',
    description: 'The festival at the end of Ramadan.' },
  { id: 'hajj', name: 'Hajj begins', month: 12, day: 8, kind: 'major', icon: 'kaaba',
    description: 'Day of Tarwiyah, the first day of the Hajj rites.' },
  { id: 'arafah', name: 'Day of Arafah', month: 12, day: 9, kind: 'major', icon: 'kaaba',
    description: 'Pilgrims stand at Arafah; a recommended fast for those not on Hajj.' },
  { id: 'eid-al-adha', name: 'Eid al-Adha', month: 12, day: 10, kind: 'major', icon: 'crescent',
    description: 'The festival of sacrifice.' },
];

/**
 * The White Days: the 13th, 14th and 15th of each Hijri month, recommended for fasting.
 * Not the 13th of Dhu al-Hijjah, a day of Tashriq when fasting isn't allowed.
 */
export function isWhiteDay(month: number, day: number): boolean {
  if (day < 13 || day > 15) return false;
  return !(month === 12 && day === 13);
}

export const HIJRI_MONTH_NAMES = [
  'Muharram', 'Safar', "Rabi' al-Awwal", "Rabi' al-Thani", 'Jumada al-Ula', 'Jumada al-Akhirah',
  'Rajab', "Sha'ban", 'Ramadan', 'Shawwal', "Dhu al-Qa'dah", 'Dhu al-Hijjah',
];

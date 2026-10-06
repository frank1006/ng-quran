/** Which Aladhan Hijri calendar a region follows */
export type HijriMethod = 'HJCoSA' | 'DIYANET';

/** How a country usually dates Islamic months, relative to Aladhan's calendar */
export interface SightingProfile {
  method: HijriMethod;
  /** Days to shift: -1 means months usually start a day later than the method's calendar */
  offset: -1 | 0 | 1;
  /** Plain-language description shown in the app */
  description: string;
}

/**
 * HJCoSA follows Saudi Arabia's official moon-sighting announcements (Aladhan corrects it when
 * an announcement differs from the calculation). Countries listed here usually date months
 * differently. It's a starting point: local committees don't always differ, which is why the
 * app shows the automatic choice and lets people change it.
 */
const COUNTRY_PROFILES: Record<string, SightingProfile> = {
  tr: { method: 'DIYANET', offset: 0, description: 'Diyanet calendar' },
  pk: { method: 'HJCoSA', offset: -1, description: 'local moon sighting, usually a day after Saudi Arabia' },
  in: { method: 'HJCoSA', offset: -1, description: 'local moon sighting, usually a day after Saudi Arabia' },
  bd: { method: 'HJCoSA', offset: -1, description: 'local moon sighting, usually a day after Saudi Arabia' },
  ma: { method: 'HJCoSA', offset: -1, description: 'local moon sighting, usually a day after Saudi Arabia' },
};

const DEFAULT_PROFILE: SightingProfile = {
  method: 'HJCoSA',
  offset: 0,
  description: "follows Saudi Arabia's moon-sighting announcements",
};

/** The usual profile for an ISO 3166-1 alpha-2 country code (any case); unknown → Saudi announcements */
export function sightingProfileFor(countryCode: string | null | undefined): SightingProfile {
  return (countryCode && COUNTRY_PROFILES[countryCode.toLowerCase()]) || DEFAULT_PROFILE;
}

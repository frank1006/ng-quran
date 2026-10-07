/**
 * What QuranFlow AI knows about the person's day, for questions about the app itself: prayer
 * times, Qibla, nearby masjids, weather. The app sends a small snapshot with each question
 * (worked out by the app, with the person's own settings); masjids and the forecast are looked
 * up here from the rounded location. The model only sees city names, times and distances, never
 * coordinates.
 */
import { roundToGrid, searchMasjids } from './masjid-search';

/** Sent by the app with each question (all optional: e.g. no location permission) */
export interface AppContext {
  place?: { city?: string; country?: string; lat?: number; lng?: number };
  prayers?: {
    date: string;
    /** As the app shows them, e.g. { Fajr: "6:04 AM", … } (Sunrise included) */
    times: Record<string, string>;
    /** The prayer whose time it is now, if any */
    current?: string;
    next?: { name: string; at: string; inMinutes: number };
    tomorrowFajr?: string;
    /** About 20 minutes after sunrise */
    ishraq?: string;
    method?: string;
    asrSchool?: string;
  };
  qibla?: { bearing: number; direction: string; distanceKm: number };
  units?: { temperature?: 'C' | 'F'; distance?: 'km' | 'mi' };
  /** The person's local time, e.g. "Tue 4:12 PM" */
  now?: string;
}

/** A button under the answer that opens part of the app */
export interface AnswerAction {
  label: string;
  route: string;
  query?: Record<string, string>;
  /** Start this surah's recitation when tapped (the tap itself starts audio, as phones require) */
  play?: number;
}

const MASJID_RADII = [5, 10, 25];
const MAX_MASJIDS = 6;
const masjidCache = new Map<string, { at: number; text: string }>();
const MASJID_CACHE_MS = 6 * 60 * 60 * 1000;

/** Keeps only well-formed, small values from what the app sent */
export function cleanContext(raw: unknown): AppContext | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const c = raw as any;
  const str = (v: unknown, max = 80) => (typeof v === 'string' ? v.slice(0, max) : undefined);
  const num = (v: unknown) => (typeof v === 'number' && isFinite(v) ? v : undefined);
  const out: AppContext = {};
  if (c.place) {
    const lat = num(c.place.lat);
    const lng = num(c.place.lng);
    out.place = {
      city: str(c.place.city),
      country: str(c.place.country),
      ...(lat !== undefined && lng !== undefined && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
        ? { lat: roundToGrid(lat), lng: roundToGrid(lng) }
        : {}),
    };
  }
  if (c.prayers && typeof c.prayers.times === 'object') {
    const times: Record<string, string> = {};
    for (const [k, v] of Object.entries(c.prayers.times).slice(0, 8)) if (typeof v === 'string') times[k.slice(0, 20)] = v.slice(0, 20);
    out.prayers = {
      date: str(c.prayers.date, 20) ?? '',
      times,
      current: str(c.prayers.current, 20),
      next: c.prayers.next && str(c.prayers.next.name, 20)
        ? { name: str(c.prayers.next.name, 20)!, at: str(c.prayers.next.at, 20) ?? '', inMinutes: num(c.prayers.next.inMinutes) ?? 0 }
        : undefined,
      tomorrowFajr: str(c.prayers.tomorrowFajr, 20),
      ishraq: str(c.prayers.ishraq, 20),
      method: str(c.prayers.method),
      asrSchool: str(c.prayers.asrSchool, 40),
    };
  }
  if (c.qibla && num(c.qibla.bearing) !== undefined) {
    out.qibla = { bearing: Math.round(c.qibla.bearing), direction: str(c.qibla.direction, 20) ?? '', distanceKm: Math.round(num(c.qibla.distanceKm) ?? 0) };
  }
  if (c.units) out.units = { temperature: c.units.temperature === 'F' ? 'F' : 'C', distance: c.units.distance === 'mi' ? 'mi' : 'km' };
  out.now = str(c.now, 40);
  return out;
}

/** The app's prayer times for today, for the model */
export function prayerTimesText(ctx: AppContext | undefined): string {
  if (!ctx?.prayers) return 'The app has no prayer times yet (location may be off). Say they appear on the Prayer tab once location is allowed.';
  const p = ctx.prayers;
  return JSON.stringify({
    place: ctx.place?.city,
    now: ctx.now,
    date: p.date,
    times: p.times,
    currentPrayer: p.current ?? 'none (between prayer times)',
    next: p.next,
    tomorrowFajr: p.tomorrowFajr,
    ishraq: p.ishraq,
    calculation: [p.method, p.asrSchool].filter(Boolean).join(', '),
    windows:
      'Each prayer lasts until the next one starts; Fajr ends at Sunrise; Isha lasts until Fajr. ' +
      'Sunrise (Shuruq) is not a prayer: no salah is offered while the sun is rising. ' +
      'Ishraq (optional, 2 rak\'ahs, the earliest time of Duha/Chasht) starts at the ishraq time, once the sun has risen about a spear\'s length (15–20 minutes after sunrise); Duha lasts until shortly before Dhuhr. ' +
      'Jumu\'ah (Friday prayer) replaces Dhuhr on Fridays; each masjid sets its own khutbah and prayer time.',
  });
}

export function qiblaText(ctx: AppContext | undefined): string {
  if (!ctx?.qibla) return 'The app has no location yet, so no Qibla direction. Say to open the Qibla tab and allow location.';
  return JSON.stringify({ place: ctx.place?.city, ...ctx.qibla, from: 'true north' });
}

/** Nearest masjids from OpenStreetMap, by distance */
export async function nearbyMasjidsText(ctx: AppContext | undefined, radiusKm?: number): Promise<string> {
  const lat = ctx?.place?.lat;
  const lng = ctx?.place?.lng;
  if (lat === undefined || lng === undefined) return 'The app has no location yet. Say to allow location to find nearby masjids.';
  const radius = MASJID_RADII.includes(Number(radiusKm)) ? Number(radiusKm) : 5;
  const miles = ctx?.units?.distance === 'mi';

  const key = `${lat},${lng},${radius}`;
  const cached = masjidCache.get(key);
  let body: string;
  if (cached && Date.now() - cached.at < MASJID_CACHE_MS) {
    body = cached.text;
  } else {
    try {
      body = await searchMasjids(lat, lng, radius);
    } catch {
      return 'The masjid search servers are busy right now. Say to try again shortly or open the Masjids list on the Prayer tab.';
    }
    if (masjidCache.size > 200) masjidCache.clear();
    masjidCache.set(key, { at: Date.now(), text: body });
  }

  const elements: any[] = JSON.parse(body).elements ?? [];
  const found = elements
    .map(e => {
      const eLat = e.lat ?? e.center?.lat;
      const eLng = e.lon ?? e.center?.lon;
      if (typeof eLat !== 'number' || typeof eLng !== 'number') return null;
      const km = distanceKm(lat, lng, eLat, eLng);
      const t = e.tags ?? {};
      return {
        name: t.name || t['name:en'] || 'Unnamed masjid',
        distance: miles ? `${(km * 0.621371).toFixed(1)} mi` : `${km.toFixed(1)} km`,
        km,
        address: [t['addr:housenumber'], t['addr:street'], t['addr:city']].filter(Boolean).join(' ') || undefined,
      };
    })
    .filter((m): m is NonNullable<typeof m> => m !== null)
    .sort((a, b) => a.km - b.km);

  if (!found.length) return `No masjids found within ${radius} km of ${ctx?.place?.city ?? 'the user'} in OpenStreetMap. Suggest a larger radius (10 or 25 km).`;
  return JSON.stringify({
    near: ctx?.place?.city,
    radiusKm: radius,
    total: found.length,
    nearest: found.slice(0, MAX_MASJIDS).map(({ km, ...m }) => m),
    note: 'Distances are approximate (from about 1 km away). Source: OpenStreetMap.',
  });
}

const WEATHER_CODES: Record<number, string> = {
  0: 'clear', 1: 'mostly clear', 2: 'partly cloudy', 3: 'cloudy', 45: 'fog', 48: 'fog',
  51: 'drizzle', 53: 'drizzle', 55: 'drizzle', 56: 'freezing drizzle', 57: 'freezing drizzle',
  61: 'rain', 63: 'rain', 65: 'heavy rain', 66: 'freezing rain', 67: 'freezing rain',
  71: 'snow', 73: 'snow', 75: 'heavy snow', 77: 'snow', 80: 'showers', 81: 'showers', 82: 'heavy showers',
  85: 'snow showers', 86: 'snow showers', 95: 'thunderstorm', 96: 'thunderstorm with hail', 99: 'thunderstorm with hail',
};

/** Current weather and a 3-day forecast from Open-Meteo (CC BY 4.0) */
export async function weatherText(ctx: AppContext | undefined): Promise<string> {
  const lat = ctx?.place?.lat;
  const lng = ctx?.place?.lng;
  if (lat === undefined || lng === undefined) return 'The app has no location yet, so no weather. Say to allow location.';
  const f = ctx?.units?.temperature === 'F';
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
    `&current=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
    `&forecast_days=3&timezone=auto${f ? '&temperature_unit=fahrenheit' : ''}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(String(response.status));
    const d: any = await response.json();
    const unit = f ? '°F' : '°C';
    return JSON.stringify({
      place: ctx?.place?.city,
      now: { temperature: `${Math.round(d.current?.temperature_2m)}${unit}`, sky: WEATHER_CODES[d.current?.weather_code] ?? 'unknown' },
      days: (d.daily?.time ?? []).map((date: string, i: number) => ({
        date,
        sky: WEATHER_CODES[d.daily.weather_code?.[i]] ?? 'unknown',
        high: `${Math.round(d.daily.temperature_2m_max?.[i])}${unit}`,
        low: `${Math.round(d.daily.temperature_2m_min?.[i])}${unit}`,
        chanceOfRain: `${d.daily.precipitation_probability_max?.[i] ?? 0}%`,
      })),
      source: 'Open-Meteo',
    });
  } catch {
    return 'The weather service did not answer. Say to try again shortly.';
  } finally {
    clearTimeout(timer);
  }
}

function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}

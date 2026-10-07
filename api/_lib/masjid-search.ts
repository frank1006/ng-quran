/**
 * Mosque search shared by GET /api/masjids (the app's Masjids list) and QuranFlow AI's "nearby
 * masjids" tool: OpenStreetMap Overpass (several servers raced), with Geoapify Places as a
 * fallback when GEOAPIFY_API_KEY is set. The location is rounded to a ~1 km grid first.
 */

const OVERPASS_URLS = [
  'https://overpass-api.de/api/interpreter',
  'https://z.overpass-api.de/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
];

/** Overpass asks clients to identify themselves. */
const USER_AGENT = 'QuranFlow/1.0 (+https://thequranflow.vercel.app)';

const GEOAPIFY_URL = 'https://api.geoapify.com/v2/places';
const GEOAPIFY_TIMEOUT_MS = 8000;

export const GRID_DEGREES = 0.01; // ~1.1 km
export const GRID_MARGIN_KM = 1; // covers the distance between the user and the grid point
export const ALLOWED_RADII_KM = [5, 10, 25];
const ATTEMPT_TIMEOUT_MS = 9000;
const STAGGER_MS = 3000;

/**
 * Overpass-format JSON ({ elements: [...] }) for mosques within radiusKm of the grid point.
 * Throws when every server failed.
 */
export async function searchMasjids(gridLat: number, gridLng: number, radiusKm: number): Promise<string> {
  const radiusMeters = (radiusKm + GRID_MARGIN_KM) * 1000;
  return raceEndpoints(buildQuery(gridLat, gridLng, radiusMeters)).catch(error => {
    const key = process.env.GEOAPIFY_API_KEY;
    if (!key) throw error;
    return fetchGeoapify(gridLat, gridLng, radiusMeters, key);
  });
}

export function roundToGrid(value: number): number {
  return Number((Math.round(value / GRID_DEGREES) * GRID_DEGREES).toFixed(2));
}

function buildQuery(lat: number, lng: number, radiusMeters: number): string {
  const around = `(around:${radiusMeters},${lat},${lng})`;
  return `[out:json][timeout:8];(` +
    `node["amenity"="place_of_worship"]["religion"="muslim"]${around};` +
    `way["amenity"="place_of_worship"]["religion"="muslim"]${around};` +
    `relation["amenity"="place_of_worship"]["religion"="muslim"]${around};` +
    `);out center tags;`;
}

/** Start the next server if there's no answer within STAGGER_MS (or as soon as one fails). */
function raceEndpoints(query: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const attempts: AbortController[] = [];
    let next = 0;
    let pending = 0;
    let settled = false;
    let staggerTimer: ReturnType<typeof setTimeout> | undefined;

    const finish = (settle: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(staggerTimer);
      attempts.forEach(a => a.abort());
      settle();
    };

    const launch = () => {
      if (settled || next >= OVERPASS_URLS.length) return;
      const url = OVERPASS_URLS[next++];
      const attempt = new AbortController();
      attempts.push(attempt);
      pending++;
      clearTimeout(staggerTimer);
      staggerTimer = setTimeout(launch, STAGGER_MS);

      fetchOverpass(url, query, attempt).then(
        body => finish(() => resolve(body)),
        () => {
          pending--;
          if (settled) return;
          if (next < OVERPASS_URLS.length) {
            launch();
          } else if (pending === 0) {
            finish(() => reject(new Error('All Overpass servers failed')));
          }
        }
      );
    };

    launch();
  });
}

async function fetchOverpass(url: string, query: string, attempt: AbortController): Promise<string> {
  const timer = setTimeout(() => attempt.abort(), ATTEMPT_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': USER_AGENT,
        Accept: 'application/json',
      },
      body: `data=${encodeURIComponent(query)}`,
      signal: attempt.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = await response.text();
    // Overpass reports server-side timeouts inside a 200 response
    const parsed = JSON.parse(body);
    if (!Array.isArray(parsed.elements) || (parsed.remark && /runtime error|timed out/i.test(parsed.remark))) {
      throw new Error('Incomplete Overpass response');
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
}

/** Geoapify Places search, returned in Overpass's JSON shape. */
async function fetchGeoapify(lat: number, lng: number, radiusMeters: number, apiKey: string): Promise<string> {
  const url = `${GEOAPIFY_URL}?categories=religion.place_of_worship.islam` +
    `&filter=circle:${lng},${lat},${radiusMeters}&bias=proximity:${lng},${lat}&limit=200&apiKey=${encodeURIComponent(apiKey)}`;
  const attempt = new AbortController();
  const timer = setTimeout(() => attempt.abort(), GEOAPIFY_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: attempt.signal, headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`Geoapify HTTP ${response.status}`);
    const data = await response.json();
    const elements = (data.features ?? [])
      .map((feature: any, index: number) => {
        const p = feature.properties ?? {};
        if (typeof p.lat !== 'number' || typeof p.lon !== 'number') return null;
        return {
          type: 'node',
          id: Number(p.datasource?.raw?.osm_id) || 9_000_000_000 + index,
          lat: p.lat,
          lon: p.lon,
          tags: {
            amenity: 'place_of_worship',
            religion: 'muslim',
            ...(p.name ? { name: p.name } : {}),
            ...(p.street ? { 'addr:street': [p.housenumber, p.street].filter(Boolean).join(' ') } : {}),
            ...(p.city ? { 'addr:city': p.city } : {}),
          },
        };
      })
      .filter(Boolean);
    return JSON.stringify({ version: 0.6, generator: 'geoapify', elements });
  } finally {
    clearTimeout(timer);
  }
}


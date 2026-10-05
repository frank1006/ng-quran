/**
 * Vercel Function: GET /api/masjids?lat=..&lng=..&r=..
 *
 * Proxies the OpenStreetMap Overpass search for mosques so that results are cached
 * at Vercel's edge and shared by everyone nearby. The public Overpass servers are often
 * busy and rate-limit per user; one cached request per area avoids most of that.
 *
 * Privacy: the location is rounded to a ~1 km grid before it is used or cached, and
 * nothing is stored apart from the cached Overpass response itself.
 */

const OVERPASS_URLS = [
  'https://overpass-api.de/api/interpreter',
  'https://z.overpass-api.de/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
];

/** Overpass asks clients to identify themselves. */
const USER_AGENT = 'QuranFlow/1.0 (+https://thequranflow.vercel.app)';

const GRID_DEGREES = 0.01; // ~1.1 km
const GRID_MARGIN_KM = 1; // covers the distance between the user and the grid point
const ALLOWED_RADII_KM = [5, 10];
const ATTEMPT_TIMEOUT_MS = 9000;
const STAGGER_MS = 3000;

export const maxDuration = 30;

export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const lat = Number(params.get('lat'));
  const lng = Number(params.get('lng'));
  const radiusKm = Number(params.get('r'));

  if (!isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180 || !ALLOWED_RADII_KM.includes(radiusKm)) {
    return json({ error: 'Invalid lat, lng or r (allowed r: 5, 10)' }, 400);
  }

  // Normalised URL = cache key, so redirect anything more precise to the grid point
  const gridLat = roundToGrid(lat);
  const gridLng = roundToGrid(lng);
  if (params.get('lat') !== String(gridLat) || params.get('lng') !== String(gridLng)) {
    const url = new URL(request.url);
    url.search = `?lat=${gridLat}&lng=${gridLng}&r=${radiusKm}`;
    return Response.redirect(url.toString(), 308);
  }

  const query = buildQuery(gridLat, gridLng, (radiusKm + GRID_MARGIN_KM) * 1000);

  try {
    const body = await raceEndpoints(query);
    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        // Mosques rarely change: cache at the edge for 7 days, serve stale for 30 while refreshing
        'Cache-Control': 'public, max-age=3600',
        'CDN-Cache-Control': 'public, s-maxage=604800, stale-while-revalidate=2592000',
      },
    });
  } catch (error) {
    return json({ error: 'Mosque search servers are busy. Please try again in a few moments.' }, 503);
  }
}

function roundToGrid(value: number): number {
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

function json(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

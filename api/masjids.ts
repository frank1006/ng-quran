/**
 * Vercel Function: GET /api/masjids?lat=..&lng=..&r=..
 *
 * Proxies the OpenStreetMap Overpass search for mosques so that results are cached
 * at Vercel's edge and shared by everyone nearby. The public Overpass servers are often
 * busy and rate-limit per user; one cached request per area avoids most of that.
 *
 * Fallback: if all Overpass servers fail and GEOAPIFY_API_KEY is set (Vercel environment
 * variable, never sent to the browser), the same search is made with Geoapify Places and
 * converted to Overpass's response format, so the app handles both identically.
 *
 * Privacy: the location is rounded to a ~1 km grid before it is used or cached, and
 * nothing is stored apart from the cached Overpass response itself.
 */
import { ALLOWED_RADII_KM, roundToGrid, searchMasjids } from './_lib/masjid-search';

export const maxDuration = 30;

export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const lat = Number(params.get('lat'));
  const lng = Number(params.get('lng'));
  const radiusKm = Number(params.get('r'));

  if (!isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180 || !ALLOWED_RADII_KM.includes(radiusKm)) {
    return json({ error: 'Invalid lat, lng or r (allowed r: 5, 10, 25)' }, 400);
  }

  // Normalised URL = cache key, so redirect anything more precise to the grid point
  const gridLat = roundToGrid(lat);
  const gridLng = roundToGrid(lng);
  if (params.get('lat') !== String(gridLat) || params.get('lng') !== String(gridLng)) {
    const url = new URL(request.url);
    url.search = `?lat=${gridLat}&lng=${gridLng}&r=${radiusKm}`;
    return Response.redirect(url.toString(), 308);
  }

  try {
    const body = await searchMasjids(gridLat, gridLng, radiusKm);
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

function json(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

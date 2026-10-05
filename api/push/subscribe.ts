/**
 * POST /api/push/subscribe
 * Body: { subscription, lat, lng, method, school, timeZone, prayers }
 *
 * Saves (or updates) a device's reminder settings and queues today's and tomorrow's
 * reminders. An empty `prayers` list removes the device. Location is rounded to ~1 km.
 */
import {
  PRAYER_KEYS, PrayerKey, Subscriber, isValidTimeZone, json, removeSubscriber, resetQueue, subscriberId,
} from '../_lib/push';

export const maxDuration = 20;

export async function POST(request: Request): Promise<Response> {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const subscription = body?.subscription;
  const endpoint = subscription?.endpoint;
  if (typeof endpoint !== 'string' || !endpoint.startsWith('https://') || endpoint.length > 1000 ||
      typeof subscription.keys?.p256dh !== 'string' || typeof subscription.keys?.auth !== 'string') {
    return json({ error: 'Invalid subscription' }, 400);
  }

  const id = subscriberId(endpoint);
  const prayers = Array.isArray(body.prayers)
    ? PRAYER_KEYS.filter(key => body.prayers.includes(key))
    : [];

  try {
    if (!prayers.length) {
      await removeSubscriber(id);
      return json({ ok: true, active: false });
    }

    const lat = Number(body.lat);
    const lng = Number(body.lng);
    const method = body.method === null || body.method === undefined ? null : Number(body.method);
    const school = body.school === 1 ? 1 : 0;
    if (!isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180 ||
        (method !== null && !Number.isInteger(method)) || !isValidTimeZone(body.timeZone)) {
      return json({ error: 'Invalid location, method or time zone' }, 400);
    }

    const subscriber: Subscriber = {
      subscription: { endpoint, keys: { p256dh: subscription.keys.p256dh, auth: subscription.keys.auth } },
      lat: Math.round(lat * 100) / 100,
      lng: Math.round(lng * 100) / 100,
      method,
      school,
      timeZone: body.timeZone,
      prayers: prayers as PrayerKey[],
      queuedUntil: '',
    };
    await resetQueue(id, subscriber);
    return json({ ok: true, active: true });
  } catch (error) {
    console.error('push subscribe failed', error);
    return json({ error: 'Could not save reminders. Please try again.' }, 503);
  }
}

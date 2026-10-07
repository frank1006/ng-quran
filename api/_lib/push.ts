/**
 * Shared code for prayer-time push reminders (files in api/_lib are not routes).
 *
 * Storage (Upstash Redis):
 *   push:sub:{id}   JSON Subscriber          id = sha256(push endpoint)
 *   push:due        sorted set, score = send time (ms), member = "{id}|{prayerKey}|{time}"
 *   push:refill     sorted set, score = when to queue the next day, member = id
 *
 * Each subscriber always has today's and tomorrow's reminders queued; a day is added
 * every 24 h by the dispatch job, so reminders continue without the app being opened.
 */
import { createHash } from 'node:crypto';
import { Redis } from '@upstash/redis';
import webpush, { PushSubscription } from 'web-push';

export const PRAYER_KEYS = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'] as const;
export type PrayerKey = (typeof PRAYER_KEYS)[number];

const PRAYER_NAMES: Record<PrayerKey, string> = {
  fajr: 'Fajr', sunrise: 'Shuruq', dhuhr: 'Dhuhr', asr: 'Asr', maghrib: 'Maghrib', isha: 'Isha',
};
const ALADHAN_FIELDS: Record<PrayerKey, string> = {
  fajr: 'Fajr', sunrise: 'Sunrise', dhuhr: 'Dhuhr', asr: 'Asr', maghrib: 'Maghrib', isha: 'Isha',
};

const DAY_MS = 24 * 60 * 60 * 1000;
/** Subscribers that haven't opened the app for this long are dropped. */
const SUBSCRIBER_TTL_SECONDS = 60 * 24 * 60 * 60;

export interface Subscriber {
  subscription: PushSubscription;
  lat: number;
  lng: number;
  method: number | null;
  school: 0 | 1;
  timeZone: string;
  prayers: PrayerKey[];
  /** Last local date (YYYY-MM-DD) whose reminders are queued. */
  queuedUntil: string;
}

let redisClient: Redis | undefined;
export function redis(): Redis {
  // The Vercel Marketplace integration sets KV_*; a direct Upstash setup sets UPSTASH_*
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (!url || !token) throw new Error('Redis is not configured');
  return (redisClient ??= new Redis({ url, token }));
}

let vapidReady = false;
export function configureVapid(): void {
  if (vapidReady) return;
  const publicKey = cleanEnv('VAPID_PUBLIC_KEY');
  const privateKey = cleanEnv('VAPID_PRIVATE_KEY');
  if (!publicKey || !privateKey) throw new Error('VAPID_PUBLIC_KEY or VAPID_PRIVATE_KEY is not set');
  // Accept a bare email address as well as "mailto:..." or an https: URL
  let subject = cleanEnv('VAPID_SUBJECT') || 'https://thequranflow.vercel.app';
  if (!/^(mailto:|https:)/.test(subject)) subject = subject.includes('@') ? `mailto:${subject}` : 'https://thequranflow.vercel.app';
  webpush.setVapidDetails(subject, publicKey, privateKey);
  vapidReady = true;
}

/** Environment value without surrounding whitespace or quotes (common copy-paste slips). */
export function cleanEnv(name: string): string {
  return (process.env[name] ?? '').trim().replace(/^["']|["']$/g, '').trim();
}

export const subscriberKey = (id: string) => `push:sub:${id}`;
export const subscriberId = (endpoint: string) => createHash('sha256').update(endpoint).digest('hex').slice(0, 32);

/** Local calendar date in a time zone, as YYYY-MM-DD. */
export function localDate(timeZone: string, at = Date.now()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
}

export function nextDate(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function isValidTimeZone(timeZone: unknown): timeZone is string {
  if (typeof timeZone !== 'string' || timeZone.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** Prayer times for one local date, as epoch ms. */
async function fetchTimes(sub: Subscriber, date: string): Promise<Partial<Record<PrayerKey, number>>> {
  const [y, m, d] = date.split('-');
  const params = new URLSearchParams({
    latitude: String(sub.lat), longitude: String(sub.lng), school: String(sub.school), iso8601: 'true',
  });
  if (sub.method !== null) params.set('method', String(sub.method));
  const response = await fetch(`https://api.aladhan.com/v1/timings/${d}-${m}-${y}?${params}`, {
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`Aladhan HTTP ${response.status}`);
  const timings = (await response.json())?.data?.timings ?? {};
  const times: Partial<Record<PrayerKey, number>> = {};
  for (const key of PRAYER_KEYS) {
    const at = Date.parse(timings[ALADHAN_FIELDS[key]]);
    if (!Number.isNaN(at)) times[key] = at;
  }
  return times;
}

/** Queue one day's reminders for the subscriber's chosen prayers. */
export async function queueDay(id: string, sub: Subscriber, date: string): Promise<void> {
  const times = await fetchTimes(sub, date);
  const now = Date.now();
  const entries = sub.prayers
    .map(key => ({ key, at: times[key] }))
    .filter((e): e is { key: PrayerKey; at: number } => e.at !== undefined && e.at > now)
    .map(e => ({ score: e.at, member: `${id}|${e.key}|${e.at}` }));
  if (entries.length) {
    const [first, ...rest] = entries;
    await redis().zadd('push:due', first, ...rest);
  }
}

/** Replace a subscriber's queue with today and tomorrow, and schedule the daily top-up. */
export async function resetQueue(id: string, sub: Subscriber): Promise<void> {
  await clearQueue(id);
  const today = localDate(sub.timeZone);
  const tomorrow = nextDate(today);
  await queueDay(id, sub, today);
  await queueDay(id, sub, tomorrow);
  sub.queuedUntil = tomorrow;
  await saveSubscriber(id, sub);
  await redis().zadd('push:refill', { score: Date.now() + DAY_MS, member: id });
}

export async function saveSubscriber(id: string, sub: Subscriber): Promise<void> {
  await redis().set(subscriberKey(id), sub, { ex: SUBSCRIBER_TTL_SECONDS });
}

export async function clearQueue(id: string): Promise<void> {
  const r = redis();
  // Small queue (≤ 12 entries per subscriber), so a scan is fine at this app's scale
  const due = await r.zrange<string[]>('push:due', 0, -1);
  const mine = due.filter(member => member.startsWith(`${id}|`));
  if (mine.length) {
    const [first, ...rest] = mine;
    await r.zrem('push:due', first, ...rest);
  }
}

export async function removeSubscriber(id: string): Promise<void> {
  await clearQueue(id);
  await redis().del(subscriberKey(id));
  await redis().zrem('push:refill', id);
}

/** Ishraq starts once the sun has risen "a spear's length", about 15–20 minutes after sunrise; the later end is used */
export const ISHRAQ_AFTER_SUNRISE_MIN = 20;

export function reminderPayload(key: PrayerKey, at: number, timeZone: string): string {
  const name = PRAYER_NAMES[key];
  const format = new Intl.DateTimeFormat('en', { timeZone, hour: 'numeric', minute: '2-digit' });
  const time = format.format(at);
  // Shuruq isn't a prayer: it ends Fajr's time, and Ishraq follows once the sun is up (same text as the in-app reminder)
  const sunrise = key === 'sunrise';
  // Angular's service worker shows payloads in this shape and handles the click
  return JSON.stringify({
    notification: {
      title: sunrise ? `${name} · Sunrise ${time}` : `${name} Prayer Time`,
      body: sunrise
        ? `Fajr time has ended. Ishraq can be prayed from about ${format.format(at + ISHRAQ_AFTER_SUNRISE_MIN * 60_000)}.`
        : `Time for ${name} prayer (${time})`,
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-96x96.png',
      tag: `prayer-${name.toLowerCase()}`, // same tag as in-app reminders, so they replace each other
      vibrate: [200, 100, 200],
      data: { onActionClick: { default: { operation: 'navigateLastFocusedOrOpen', url: '/prayer' } } },
    },
  });
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

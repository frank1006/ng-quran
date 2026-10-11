/**
 * GET /api/push/dispatch  (Authorization: Bearer CRON_SECRET)
 *
 * Called every minute by a Cloudflare Worker cron (workers/push-cron; Vercel Hobby cron
 * only runs daily). Sends the reminders that are due and queues the next day for subscribers
 * whose top-up is due.
 */
import webpush from 'web-push';
import {
  PrayerKey, Subscriber, cleanEnv, configureVapid, json, localDate, nextDate, queueDay, redis,
  reminderPayload, removeSubscriber, saveSubscriber, subscriberKey,
} from '../_lib/push';

export const maxDuration = 60;

/** Don't send a reminder that is this late (e.g. after an outage). */
const MAX_LATE_MS = 10 * 60 * 1000;
const BATCH = 500;
const DAY_MS = 24 * 60 * 60 * 1000;

export async function GET(request: Request): Promise<Response> {
  const secret = cleanEnv('CRON_SECRET');
  const provided = (request.headers.get('authorization') ?? '').trim().replace(/^bearer\s+/i, '');
  if (!secret || provided !== secret) {
    return json({ error: 'Unauthorized' }, 401);
  }

  // Report which step failed (messages name the setting, never its value)
  let step = 'push keys (VAPID_*)';
  try {
    configureVapid();
    step = 'database (Redis)';
    const [sent, failed] = await sendDue();
    const refilled = await refill();
    return json({ sent, failed, refilled });
  } catch (error: any) {
    console.error('push dispatch failed', step, error);
    const reason = String(error?.message ?? error).split('. ')[0];
    return json({ error: 'Dispatch failed', step, reason }, 500);
  }
}

async function sendDue(): Promise<[number, number]> {
  const r = redis();
  const now = Date.now();
  const due = await r.zrange<string[]>('push:due', 0, now, { byScore: true, offset: 0, count: BATCH });
  let sent = 0;
  let failed = 0;

  await Promise.all(due.map(async member => {
    // zrem returns 1 only for the run that claims the entry, so overlapping runs can't double-send
    if (await r.zrem('push:due', member) !== 1) return;
    const [id, key, atText] = member.split('|');
    const at = Number(atText);
    if (now - at > MAX_LATE_MS) return;

    const sub = await r.get<Subscriber>(subscriberKey(id));
    if (!sub) return;
    try {
      await webpush.sendNotification(sub.subscription, reminderPayload(key as PrayerKey, at, sub.timeZone, sub.silent?.includes(key as PrayerKey)), {
        TTL: 15 * 60,
        urgency: 'high',
      });
      sent++;
    } catch (error: any) {
      failed++;
      // 404/410: the browser has dropped this subscription
      if (error?.statusCode === 404 || error?.statusCode === 410) await removeSubscriber(id);
      else console.warn('push send failed', error?.statusCode, error?.body);
    }
  }));

  return [sent, failed];
}

async function refill(): Promise<number> {
  const r = redis();
  const ids = await r.zrange<string[]>('push:refill', 0, Date.now(), { byScore: true, offset: 0, count: 50 });

  await Promise.all(ids.map(async id => {
    const sub = await r.get<Subscriber>(subscriberKey(id));
    if (!sub) {
      await r.zrem('push:refill', id);
      return;
    }
    // Normally the day after the last queued one; never a day that has already passed
    const today = localDate(sub.timeZone);
    const candidate = sub.queuedUntil ? nextDate(sub.queuedUntil) : today;
    const date = candidate < today ? nextDate(today) : candidate;
    try {
      await queueDay(id, sub, date);
      sub.queuedUntil = date;
      await saveSubscriber(id, sub);
      await r.zadd('push:refill', { score: Date.now() + DAY_MS, member: id });
    } catch (error) {
      // Try again in 15 minutes
      console.warn('push refill failed', id, error);
      await r.zadd('push:refill', { score: Date.now() + 15 * 60 * 1000, member: id });
    }
  }));

  return ids.length;
}

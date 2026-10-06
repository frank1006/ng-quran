/**
 * Daily question limit for QuranFlow AI, so one person can't use up the shared free AI quota.
 *
 * Counted per user per day in Upstash Redis (the same database as push reminders). Until Google
 * login exists, a "user" is the client's IP address, stored only as a salted hash. The day is the
 * user's own calendar day (their time zone), so it resets at their local midnight.
 *
 * Without Redis configured (local development), counts are kept in memory on the dev server.
 * In production a missing Redis refuses questions rather than allowing unlimited ones.
 *
 * Env: QFLOW_DAILY_LIMIT (default 7), KV_REST_API_URL / KV_REST_API_TOKEN (or UPSTASH_REDIS_*).
 */
import { createHash } from 'node:crypto';
import { Redis } from '@upstash/redis';

export interface Quota {
  limit: number;
  used: number;
  remaining: number;
  /** ISO time of the user's next local midnight */
  resetsAt: string;
}

const DEFAULT_LIMIT = 7;
const KEY_TTL_SECONDS = 36 * 60 * 60; // covers any time zone's day

export function dailyLimit(): number {
  const value = Number(process.env.QFLOW_DAILY_LIMIT);
  return Number.isInteger(value) && value > 0 ? value : DEFAULT_LIMIT;
}

/** The client's IP from Vercel's headers ("local" on the dev server) */
export function clientId(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || request.headers.get('x-real-ip') || 'local';
}

export function validTimeZone(value: unknown): string {
  if (typeof value === 'string' && value.length <= 64) {
    try {
      new Intl.DateTimeFormat('en', { timeZone: value });
      return value;
    } catch {
      // fall through
    }
  }
  return 'UTC';
}

/** Checks the user's count without using a question */
export async function peekQuota(id: string, timeZone: string): Promise<Quota> {
  const used = Number((await store().get(key(id, timeZone))) ?? 0);
  return quota(used, timeZone);
}

/** Uses one question. `allowed` is false once the day's limit is reached (nothing is used then). */
export async function takeQuestion(id: string, timeZone: string): Promise<{ allowed: boolean; quota: Quota }> {
  const k = key(id, timeZone);
  const used = await store().incr(k, KEY_TTL_SECONDS);
  if (used > dailyLimit()) {
    await store().decr(k);
    return { allowed: false, quota: quota(dailyLimit(), timeZone) };
  }
  return { allowed: true, quota: quota(used, timeZone) };
}

/** Gives a question back when no answer could be produced */
export async function refundQuestion(id: string, timeZone: string): Promise<void> {
  await store().decr(key(id, timeZone));
}

function quota(used: number, timeZone: string): Quota {
  const limit = dailyLimit();
  return { limit, used: Math.min(used, limit), remaining: Math.max(0, limit - used), resetsAt: nextMidnight(timeZone) };
}

function key(id: string, timeZone: string): string {
  // Salted so the stored key can't be turned back into an IP address
  const salt = process.env.QFLOW_LIMIT_SALT ?? 'quranflow-ai';
  const hashed = createHash('sha256').update(`${salt}:${id}`).digest('hex').slice(0, 24);
  return `qflow:questions:${hashed}:${localDate(new Date(), timeZone)}`;
}

/** YYYY-MM-DD in the given time zone */
function localDate(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

/** The next midnight in the given time zone, as an ISO instant */
function nextMidnight(timeZone: string): string {
  const now = new Date();
  const today = localDate(now, timeZone);
  // Step forward in 15-minute increments until the local date changes (handles odd offsets)
  let t = Math.ceil(now.getTime() / 900_000) * 900_000;
  while (localDate(new Date(t), timeZone) === today) t += 900_000;
  return new Date(t).toISOString();
}

// --- storage -------------------------------------------------------------------------------

interface Counter {
  get(key: string): Promise<number | null>;
  incr(key: string, ttlSeconds: number): Promise<number>;
  decr(key: string): Promise<void>;
}

let counter: Counter | undefined;

function store(): Counter {
  if (counter) return counter;
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (url && token) {
    const redis = new Redis({ url, token });
    counter = {
      get: k => redis.get<number>(k),
      incr: async (k, ttl) => {
        const [value] = await redis.pipeline().incr(k).expire(k, ttl, 'NX').exec<[number, number]>();
        return value;
      },
      decr: async k => {
        await redis.decr(k);
      },
    };
  } else if (process.env.VERCEL_ENV === 'production') {
    throw new Error('Redis is not configured for the QuranFlow AI daily limit');
  } else {
    const memory = new Map<string, number>();
    counter = {
      get: async k => memory.get(k) ?? null,
      incr: async k => {
        const value = (memory.get(k) ?? 0) + 1;
        memory.set(k, value);
        return value;
      },
      decr: async k => {
        memory.set(k, Math.max(0, (memory.get(k) ?? 0) - 1));
      },
    };
  }
  return counter;
}

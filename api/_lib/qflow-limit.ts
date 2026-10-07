/**
 * Daily question limits for QuranFlow AI:
 * - per user, so one person can't use up the shared free AI quota;
 * - for the whole app (the global cap), so everyone together stays inside the free tiers. Free
 *   Gemini + Groq answer roughly 250 questions a day in total, however many users there are.
 *
 * Counted per person per day in Upstash Redis (the same database as push reminders). Only
 * signed-in users can ask (see ./auth); they're counted by their Google account id (so deleting
 * the account and signing up again doesn't reset the day), stored only as a salted hash. The day
 * is the user's own calendar day (their time zone), so it resets at their local midnight.
 *
 * Without Redis configured (local development), counts are kept in memory on the dev server.
 * In production a missing Redis refuses questions rather than allowing unlimited ones.
 *
 * Env: QFLOW_DAILY_LIMIT        per user (default 10; 0 = unlimited)
 *      QFLOW_GLOBAL_DAILY_LIMIT whole app (default 250; 0 = no cap)
 *      KV_REST_API_URL / KV_REST_API_TOKEN (or UPSTASH_REDIS_*).
 */
import { createHash } from 'node:crypto';
import { Redis } from '@upstash/redis';

export interface Quota {
  /** null when there's no limit (QFLOW_DAILY_LIMIT=0) */
  limit: number | null;
  used: number;
  remaining: number | null;
  /** ISO time of the user's next local midnight */
  resetsAt: string;
  /** The whole app has used today's questions (the global cap); nobody can ask until tomorrow */
  busyToday: boolean;
}

const DEFAULT_LIMIT = 10;
const DEFAULT_GLOBAL_LIMIT = 250;
/** The global day follows Gemini's free quota, which resets at midnight Pacific time */
const GLOBAL_DAY_ZONE = 'America/Los_Angeles';
const KEY_TTL_SECONDS = 36 * 60 * 60; // covers any time zone's day

/** Questions per user per day; null means unlimited (QFLOW_DAILY_LIMIT=0) */
export function dailyLimit(): number | null {
  const raw = process.env.QFLOW_DAILY_LIMIT?.trim();
  if (raw === '0') return null;
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : DEFAULT_LIMIT;
}

/** Questions per day for the whole app; null means no cap (QFLOW_GLOBAL_DAILY_LIMIT=0) */
export function globalDailyLimit(): number | null {
  const raw = process.env.QFLOW_GLOBAL_DAILY_LIMIT?.trim();
  if (raw === '0') return null;
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : DEFAULT_GLOBAL_LIMIT;
}

const UNLIMITED: Quota = { limit: null, used: 0, remaining: null, resetsAt: '', busyToday: false };

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

/** Checks the user's count (and whether the app is busy today) without using a question */
export async function peekQuota(id: string, timeZone: string): Promise<Quota> {
  const busyToday = await globalFull();
  if (dailyLimit() === null) return { ...UNLIMITED, busyToday };
  const used = Number((await store().get(key(id, timeZone))) ?? 0);
  return quota(used, timeZone, busyToday);
}

/**
 * Uses one question: the user's own count first, then the app's. When either is over its limit,
 * nothing is used and `reason` says which ('user' or 'busy').
 */
export async function takeQuestion(
  id: string,
  timeZone: string,
): Promise<{ allowed: boolean; reason?: 'user' | 'busy'; quota: Quota }> {
  const limit = dailyLimit();
  let used = 0;
  if (limit !== null) {
    used = await store().incr(key(id, timeZone), KEY_TTL_SECONDS);
    if (used > limit) {
      await store().decr(key(id, timeZone));
      return { allowed: false, reason: 'user', quota: quota(limit, timeZone, false) };
    }
  }

  const globalLimit = globalDailyLimit();
  if (globalLimit !== null && (await store().incr(globalKey(), KEY_TTL_SECONDS)) > globalLimit) {
    await store().decr(globalKey());
    if (limit !== null) await store().decr(key(id, timeZone));
    return { allowed: false, reason: 'busy', quota: quota(used - 1, timeZone, true) };
  }
  return { allowed: true, quota: quota(used, timeZone, false) };
}

/** Gives a question back (to the user and the app) when no answer could be produced */
export async function refundQuestion(id: string, timeZone: string): Promise<void> {
  if (dailyLimit() !== null) await store().decr(key(id, timeZone));
  if (globalDailyLimit() !== null) await store().decr(globalKey());
}

async function globalFull(): Promise<boolean> {
  const globalLimit = globalDailyLimit();
  return globalLimit !== null && Number((await store().get(globalKey())) ?? 0) >= globalLimit;
}

function quota(used: number, timeZone: string, busyToday: boolean): Quota {
  const limit = dailyLimit();
  if (limit === null) return { ...UNLIMITED, busyToday };
  return {
    limit,
    used: Math.min(used, limit),
    remaining: Math.max(0, limit - used),
    resetsAt: nextMidnight(timeZone),
    busyToday,
  };
}

function globalKey(): string {
  return `qflow:questions:all:${localDate(new Date(), GLOBAL_DAY_ZONE)}`;
}

function key(id: string, timeZone: string): string {
  // Salted so the stored key can't be turned back into an account id
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

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Without Redis settings (and outside production) the limit counts in memory, so each test loads
// a fresh copy of the module to start from zero
const load = () => import('../_lib/qflow-limit');

describe('QuranFlow AI daily limit', () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.KV_REST_API_URL;
    delete process.env.UPSTASH_REDIS_REST_URL;
    process.env.VERCEL_ENV = 'development';
    process.env.QFLOW_DAILY_LIMIT = '3';
    process.env.QFLOW_GLOBAL_DAILY_LIMIT = '0';
  });

  it('allows the daily number of questions, then refuses without using one', async () => {
    const { takeQuestion, peekQuota } = await load();
    for (let i = 1; i <= 3; i++) {
      const taken = await takeQuestion('google:1', 'Asia/Karachi');
      expect(taken.allowed).toBe(true);
      expect(taken.quota.remaining).toBe(3 - i);
    }
    const refused = await takeQuestion('google:1', 'Asia/Karachi');
    expect(refused).toMatchObject({ allowed: false, reason: 'user', quota: { used: 3, remaining: 0 } });
    expect((await peekQuota('google:1', 'Asia/Karachi')).used).toBe(3);
  });

  it('gives a question back when no answer could be made', async () => {
    const { takeQuestion, refundQuestion, peekQuota } = await load();
    await takeQuestion('google:1', 'UTC');
    await takeQuestion('google:1', 'UTC');
    await refundQuestion('google:1', 'UTC');
    expect((await peekQuota('google:1', 'UTC')).used).toBe(1);
  });

  it('counts each person separately', async () => {
    const { takeQuestion, peekQuota } = await load();
    for (let i = 0; i < 3; i++) await takeQuestion('google:1', 'UTC');
    expect((await takeQuestion('google:2', 'UTC')).allowed).toBe(true);
    expect((await peekQuota('google:2', 'UTC')).used).toBe(1);
  });

  it('when the whole app is full for the day, refuses as busy and leaves the person’s count alone', async () => {
    process.env.QFLOW_GLOBAL_DAILY_LIMIT = '2';
    const { takeQuestion, peekQuota } = await load();
    expect((await takeQuestion('google:1', 'UTC')).allowed).toBe(true);
    expect((await takeQuestion('google:2', 'UTC')).allowed).toBe(true);

    const busy = await takeQuestion('google:3', 'UTC');
    expect(busy).toMatchObject({ allowed: false, reason: 'busy', quota: { busyToday: true } });
    expect(await peekQuota('google:3', 'UTC')).toMatchObject({ used: 0, busyToday: true });
  });

  it('a limit of 0 means unlimited', async () => {
    process.env.QFLOW_DAILY_LIMIT = '0';
    const { takeQuestion } = await load();
    for (let i = 0; i < 20; i++) expect((await takeQuestion('google:1', 'UTC')).allowed).toBe(true);
  });

  it('falls back to UTC for a time zone that does not exist', async () => {
    const { validTimeZone } = await load();
    expect(validTimeZone('Asia/Karachi')).toBe('Asia/Karachi');
    expect(validTimeZone('Mars/Olympus')).toBe('UTC');
    expect(validTimeZone(42)).toBe('UTC');
  });
});

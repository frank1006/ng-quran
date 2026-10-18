import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeRedis } from './fake-redis';

vi.mock('@upstash/redis', () => ({ Redis: FakeRedis }));
vi.mock('web-push', () => ({ default: { setVapidDetails: vi.fn(), sendNotification: vi.fn() } }));

import webpush from 'web-push';
import { POST as subscribe } from '../push/subscribe';
import { GET as dispatch } from '../push/dispatch';
import { Subscriber, localDate, subscriberId, subscriberKey } from '../_lib/push';
import { prayerTimes } from '../../shared/prayer-times';

const LONDON = { lat: 51.51, lng: -0.13, method: null, school: 0, timeZone: 'Europe/London' };
const device = (name: string) => ({ endpoint: `https://push.example/${name}`, keys: { p256dh: 'p', auth: 'a' } });
const idOf = (name: string) => subscriberId(device(name).endpoint);

const post = (body: unknown) =>
  subscribe(new Request('https://app.test/api/push/subscribe', { method: 'POST', body: JSON.stringify(body) }));
const runDispatch = () =>
  dispatch(new Request('https://app.test/api/push/dispatch', { headers: { authorization: 'Bearer cron-secret' } }));

/** The queued reminders of one device, as "prayer local-date" */
const queuedFor = (name: string) =>
  FakeRedis.members('push:due')
    .filter(member => member.startsWith(`${idOf(name)}|`))
    .map(member => {
      const [, key, at] = member.split('|');
      return `${key} ${localDate('Europe/London', Number(at))}`;
    });

describe('push reminders', () => {
  beforeEach(() => {
    process.env.KV_REST_API_URL = 'https://redis.test';
    process.env.KV_REST_API_TOKEN = 'token';
    process.env.VAPID_PUBLIC_KEY = 'public';
    process.env.VAPID_PRIVATE_KEY = 'private';
    process.env.CRON_SECRET = 'cron-secret';
    FakeRedis.reset();
    // 07:00 in London: Fajr has passed, Dhuhr to Isha are still to come
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-18T06:00:00Z') });
    vi.mocked(webpush.sendNotification).mockReset();
  });

  afterEach(() => vi.useRealTimers());

  it('queues today’s and tomorrow’s reminders when a device subscribes', async () => {
    const response = await post({ subscription: device('a'), ...LONDON, prayers: ['fajr', 'isha'] });
    expect(response.status).toBe(200);
    expect(queuedFor('a')).toEqual(['isha 2026-10-18', 'fajr 2026-10-19', 'isha 2026-10-19']);
  });

  it('changing settings replaces only that device’s reminders, without reading everyone’s', async () => {
    await post({ subscription: device('a'), ...LONDON, prayers: ['dhuhr', 'asr'] });
    await post({ subscription: device('b'), ...LONDON, prayers: ['maghrib'] });
    await post({ subscription: device('a'), ...LONDON, prayers: ['isha'] });

    expect(queuedFor('a')).toEqual(['isha 2026-10-18', 'isha 2026-10-19']);
    expect(queuedFor('b')).toEqual(['maghrib 2026-10-18', 'maghrib 2026-10-19']);
    expect(FakeRedis.fullScans).toBe(0);
  });

  it('still clears reminders of a device saved before the list existed', async () => {
    await post({ subscription: device('a'), ...LONDON, prayers: ['dhuhr'] });
    const key = subscriberKey(idOf('a'));
    const { queued: _dropped, ...older } = FakeRedis.store.get(key) as Subscriber;
    FakeRedis.store.set(key, older);

    await post({ subscription: device('a'), ...LONDON, prayers: ['isha'] });
    expect(queuedFor('a')).toEqual(['isha 2026-10-18', 'isha 2026-10-19']);
    expect(FakeRedis.fullScans).toBe(1);
  });

  it('after a gap, the daily top-up queues today and tomorrow (not just tomorrow)', async () => {
    await post({ subscription: device('a'), ...LONDON, prayers: ['isha'] });
    const key = subscriberKey(idOf('a'));
    FakeRedis.store.set(key, { ...(FakeRedis.store.get(key) as Subscriber), queuedUntil: '2026-10-13', queued: [] });
    FakeRedis.sets.get('push:due')!.clear();
    await new FakeRedis().zadd('push:refill', { score: 0, member: idOf('a') });

    expect((await runDispatch()).status).toBe(200);
    expect(queuedFor('a')).toEqual(['isha 2026-10-18', 'isha 2026-10-19']);
    expect((FakeRedis.store.get(key) as Subscriber).queuedUntil).toBe('2026-10-19');
  });

  it('a normal top-up adds just the next day', async () => {
    await post({ subscription: device('a'), ...LONDON, prayers: ['isha'] });
    vi.setSystemTime(new Date('2026-10-19T06:00:00Z'));
    await new FakeRedis().zadd('push:refill', { score: 0, member: idOf('a') });

    await runDispatch();
    expect(queuedFor('a')).toEqual(['isha 2026-10-19', 'isha 2026-10-20']);
  });

  it('sends a due reminder once, and forgets a device the browser has dropped', async () => {
    await post({ subscription: device('a'), ...LONDON, prayers: ['dhuhr'] });
    await post({ subscription: device('b'), ...LONDON, prayers: ['dhuhr'] });
    vi.mocked(webpush.sendNotification).mockImplementation(async subscription =>
      subscription.endpoint.endsWith('/b') ? Promise.reject({ statusCode: 410 }) : ({} as never));
    // A minute after Dhuhr in London
    const { dhuhr } = prayerTimes(LONDON.lat, LONDON.lng, '2026-10-18', null, 0);
    vi.setSystemTime(dhuhr.getTime() + 60_000);

    await runDispatch();
    await runDispatch();

    const sentTo = vi.mocked(webpush.sendNotification).mock.calls.map(([subscription]) => subscription.endpoint);
    expect(sentTo.sort()).toEqual(['https://push.example/a', 'https://push.example/b']);
    expect(queuedFor('a')).toEqual(['dhuhr 2026-10-19']);
    expect(FakeRedis.store.has(subscriberKey(idOf('b')))).toBe(false);
    expect(queuedFor('b')).toEqual([]);
  });

  it('refuses a dispatch without the cron secret', async () => {
    const response = await dispatch(new Request('https://app.test/api/push/dispatch'));
    expect(response.status).toBe(401);
  });
});

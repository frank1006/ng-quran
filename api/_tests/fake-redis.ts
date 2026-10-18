/**
 * An in-memory stand-in for the few Upstash Redis commands the push code uses, so tests never
 * touch the real database. Plug it in with vi.mock('@upstash/redis', ...).
 */
export class FakeRedis {
  static store = new Map<string, unknown>();
  static sets = new Map<string, Map<string, number>>();
  /** Every whole-queue read (zrange 0 -1 without byScore), to check nobody reads everyone's */
  static fullScans = 0;

  static reset(): void {
    FakeRedis.store.clear();
    FakeRedis.sets.clear();
    FakeRedis.fullScans = 0;
  }

  async get<T>(key: string): Promise<T | null> {
    const value = FakeRedis.store.get(key);
    return value === undefined ? null : (structuredClone(value) as T);
  }

  async set(key: string, value: unknown): Promise<'OK'> {
    FakeRedis.store.set(key, structuredClone(value));
    return 'OK';
  }

  async del(key: string): Promise<number> {
    return FakeRedis.store.delete(key) ? 1 : 0;
  }

  async zadd(key: string, ...entries: { score: number; member: string }[]): Promise<number> {
    const set = FakeRedis.sets.get(key) ?? new Map<string, number>();
    FakeRedis.sets.set(key, set);
    for (const { score, member } of entries) set.set(member, score);
    return entries.length;
  }

  async zrem(key: string, ...members: string[]): Promise<number> {
    const set = FakeRedis.sets.get(key);
    return members.filter(member => set?.delete(member)).length;
  }

  async zrange<T>(key: string, min: number, max: number, options?: { byScore?: boolean; count?: number }): Promise<T> {
    const entries = [...(FakeRedis.sets.get(key) ?? new Map<string, number>())].sort((a, b) => a[1] - b[1]);
    if (!options?.byScore) {
      if (min === 0 && max === -1) FakeRedis.fullScans++;
      return entries.map(([member]) => member) as T;
    }
    const inRange = entries.filter(([, score]) => score >= min && score <= max).map(([member]) => member);
    return inRange.slice(0, options.count ?? inRange.length) as T;
  }

  /** The members of a sorted set, in score order */
  static members(key: string): string[] {
    return [...(FakeRedis.sets.get(key) ?? new Map<string, number>())].sort((a, b) => a[1] - b[1]).map(([m]) => m);
  }
}

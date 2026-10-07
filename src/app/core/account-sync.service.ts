import { DestroyRef, Injectable, computed, effect, inject, isDevMode, untracked } from '@angular/core';
import { AuthService } from './auth.service';
import { UserStoreService, SyncedUserData, Bookmark } from '../services/user-store.service';
import { SettingsService, PrayerCalcSettings, UnitSettings } from '../services/settings.service';
import { HijriCalendarService, HijriOffset } from '../calendar/hijri-calendar.service';

/** One row in Supabase's public.user_data (supabase/migrations/20261007_user_data.sql) */
interface SyncedRow {
  bookmarks: Bookmark[];
  last_read: { lastRead: SyncedUserData['lastRead']; positions: SyncedUserData['lastReadPositions'] } | null;
  preferences: {
    reciterId?: number | null;
    timeFormat?: SyncedUserData['timeFormat'];
    translation?: SyncedUserData['translation'];
    calc?: PrayerCalcSettings;
    units?: UnitSettings;
    hijriOffset?: HijriOffset | null;
    showVaried?: boolean;
  };
}

/** What this device last agreed with the account on */
interface SyncMeta {
  userId: string;
  /** The row's updated_at when this device last read or wrote it */
  seenAt: string | null;
  /** A change here hasn't reached the account yet (e.g. the app closed first) */
  dirty: boolean;
}

const META_KEY = 'account-sync';
const TABLE = 'user_data';
/** Changes are sent together once taps stop for this long */
const PUSH_DELAY_MS = 2000;
/** Coming back to the app re-checks the account at most this often */
const RECHECK_MS = 5 * 60 * 1000;

/**
 * Bookmarks, reading place and preferences follow the signed-in account (Supabase), so they're
 * there on every device. The device stays the main copy: everything reads from local storage as
 * before (instant, offline); this only keeps one private row per user in step:
 *
 * - Signing in reads the row once. First time on this device: its bookmarks are combined with the
 *   account's and the account's preferences win. After that, a newer account copy (changed on
 *   another device) replaces this device's.
 * - Local changes are sent together after PUSH_DELAY_MS, never one request per tap, and flushed
 *   when the app goes to the background. Returning to the app re-checks at most every RECHECK_MS.
 * - Signing out clears bookmarks and reading place from the device (preferences stay).
 *
 * Row level security means a user can only read and write their own row.
 */
@Injectable({ providedIn: 'root' })
export class AccountSyncService {
  private readonly auth = inject(AuthService);
  private readonly userStore = inject(UserStoreService);
  private readonly settings = inject(SettingsService);
  private readonly hijri = inject(HijriCalendarService);

  /** Everything that syncs, as one value: changes to any of it schedule a push */
  private readonly local = computed<SyncedRow>(() => {
    const u = this.userStore.syncedData();
    const p = this.settings.syncedPrefs();
    return {
      bookmarks: u.bookmarks,
      last_read: u.lastRead || Object.keys(u.lastReadPositions).length ? { lastRead: u.lastRead, positions: u.lastReadPositions } : null,
      preferences: {
        reciterId: u.reciterId,
        timeFormat: u.timeFormat,
        translation: u.translation,
        calc: p.calc,
        units: p.units,
        hijriOffset: this.hijri.userOffset(),
        showVaried: this.hijri.showVaried(),
      },
    };
  });

  private userId: string | null = null;
  /** True once this session's first read of the account is done (pushes wait for it) */
  private ready = false;
  /** The last value the account and this device agreed on, as JSON */
  private agreed = '';
  private pushTimer: ReturnType<typeof setTimeout> | undefined;
  private lastCheck = 0;

  constructor() {
    effect(() => {
      const id = this.auth.user()?.id ?? null;
      untracked(() => void this.onUser(id));
    });

    effect(() => {
      const json = JSON.stringify(this.local());
      untracked(() => this.onLocalChange(json));
    });

    this.auth.onSignedOut(() => {
      this.userStore.clearPersonal();
      write(null);
    });

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') void this.flush();
      else if (this.ready && Date.now() - this.lastCheck > RECHECK_MS) void this.pull();
    };
    document.addEventListener('visibilitychange', onVisibility);
    inject(DestroyRef).onDestroy(() => document.removeEventListener('visibilitychange', onVisibility));
  }

  private async onUser(id: string | null): Promise<void> {
    if (id === this.userId) return;
    clearTimeout(this.pushTimer);
    this.userId = id;
    this.ready = false;
    this.agreed = '';
    if (id) await this.pull();
  }

  private onLocalChange(json: string): void {
    if (!this.userId || !this.ready || json === this.agreed) return;
    const meta = read();
    if (meta && !meta.dirty) write({ ...meta, dirty: true });
    clearTimeout(this.pushTimer);
    this.pushTimer = setTimeout(() => void this.push(), PUSH_DELAY_MS);
  }

  /** Reads the account's row and brings this device and the account into step */
  private async pull(): Promise<void> {
    const userId = this.userId;
    const supabase = await this.auth.client();
    if (!userId || !supabase) return;
    this.lastCheck = Date.now();

    const { data, error } = await supabase
      .from(TABLE)
      .select('bookmarks, last_read, preferences, updated_at')
      .eq('user_id', userId)
      .maybeSingle();
    if (userId !== this.userId) return;
    if (error) {
      // Offline, or the table isn't set up yet: everything keeps working on this device
      if (isDevMode()) console.warn('Account sync: could not read the account', error.message);
      return;
    }

    const meta = read();
    const local = this.local();
    const firstHere = meta?.userId !== userId;

    if (!data) {
      // A new account: this device's data becomes the account's
      this.ready = true;
      await this.push();
      return;
    }

    const remote = data as SyncedRow & { updated_at: string };
    if (firstHere) {
      this.apply(merge(local, remote));
      this.ready = true;
      await this.push();
    } else if (remote.updated_at !== meta?.seenAt) {
      // Changed on another device; keep this device's unsent bookmarks too
      this.apply(meta?.dirty ? merge(local, remote) : remote);
      this.agreed = JSON.stringify(this.local());
      write({ userId, seenAt: remote.updated_at, dirty: !!meta?.dirty });
      this.ready = true;
      if (meta?.dirty) await this.push();
    } else {
      this.agreed = meta?.dirty ? '' : JSON.stringify(local);
      this.ready = true;
      if (meta?.dirty) await this.push();
    }
  }

  /** Sends this device's copy to the account (one upsert) */
  private async push(): Promise<void> {
    clearTimeout(this.pushTimer);
    const userId = this.userId;
    const supabase = await this.auth.client();
    if (!userId || !supabase || !this.ready) return;
    const row = this.local();
    const json = JSON.stringify(row);
    if (json === this.agreed) return;

    const { data, error } = await supabase
      .from(TABLE)
      .upsert({ user_id: userId, ...row })
      .select('updated_at')
      .single();
    if (userId !== this.userId) return;
    if (error) {
      if (isDevMode()) console.warn('Account sync: could not save', error.message);
      return; // stays dirty: tried again on the next change or when the app is reopened
    }
    this.agreed = json;
    write({ userId, seenAt: data.updated_at, dirty: false });
  }

  private async flush(): Promise<void> {
    if (this.pushTimer) await this.push();
  }

  private apply(row: SyncedRow): void {
    const p = row.preferences ?? {};
    this.userStore.applySynced({
      bookmarks: row.bookmarks ?? [],
      lastRead: row.last_read?.lastRead ?? null,
      lastReadPositions: row.last_read?.positions ?? {},
      reciterId: p.reciterId,
      timeFormat: p.timeFormat,
      translation: p.translation,
    });
    this.settings.applySyncedPrefs({ calc: p.calc, units: p.units });
    if (p.hijriOffset !== undefined) this.hijri.setUserOffset(p.hijriOffset);
    if (typeof p.showVaried === 'boolean') this.hijri.setShowVaried(p.showVaried);
  }
}

/**
 * This device's data combined with the account's: bookmarks from both (earliest time kept),
 * the account's preferences and reading place where it has them.
 */
function merge(local: SyncedRow, remote: SyncedRow): SyncedRow {
  const byKey = new Map<string, Bookmark>();
  for (const b of [...(remote.bookmarks ?? []), ...(local.bookmarks ?? [])]) {
    const key = `${b.chapterId}:${b.verseNumber}`;
    const seen = byKey.get(key);
    if (!seen || b.timestamp < seen.timestamp) byKey.set(key, b);
  }
  return {
    bookmarks: [...byKey.values()].sort((a, b) => a.timestamp - b.timestamp),
    last_read: remote.last_read ?? local.last_read,
    preferences: { ...local.preferences, ...withoutNulls(remote.preferences ?? {}) },
  };
}

function withoutNulls<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== null && v !== undefined)) as Partial<T>;
}

function read(): SyncMeta | null {
  try {
    return JSON.parse(localStorage.getItem(META_KEY) ?? 'null');
  } catch {
    return null;
  }
}

function write(meta: SyncMeta | null): void {
  try {
    if (meta) localStorage.setItem(META_KEY, JSON.stringify(meta));
    else localStorage.removeItem(META_KEY);
  } catch {
    // Storage unavailable: sync still works for this session
  }
}

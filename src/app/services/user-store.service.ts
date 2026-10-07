import { Injectable, signal, computed } from '@angular/core';
import { Reciter } from './quran-api.types';
import { TimeFormat } from './time-format.types';
import { ScheduledNotification } from './notification.types';
import { Logger } from '../core/logger.util';

export interface Bookmark {
  chapterId: number;
  verseNumber: number;
  timestamp: number;
}

export interface PlayerState {
  currentVerse: number | null;
  isPlaying: boolean;
  audioUrl: string | null;
  currentTime: number;
}

export type TranslationLanguage = 'english' | 'bengali' | 'urdu';

/** The reader's place in the Quran: the ayah read or listened to most recently, in any surah */
export interface LastRead {
  chapterId: number;
  verseNumber: number;
  /** How they got there, for the card's label */
  via: 'read' | 'listen';
}

/** The part of the user store that follows the account */
export interface SyncedUserData {
  bookmarks: Bookmark[];
  lastRead: LastRead | null;
  lastReadPositions: { [chapterId: number]: number };
  reciterId: number | null;
  timeFormat: TimeFormat | null;
  translation: TranslationLanguage | null;
}

interface StoredUserData {
  selectedReciterId: number | null;
  bookmarks: Bookmark[];
  lastReadPositions: { [chapterId: number]: number };
  lastRead: LastRead | null;
  playerStates: { [chapterId: number]: PlayerState };
  scrollPositions: { [chapterId: number]: number };
  timeFormat: TimeFormat | null;
  quranTranslationLanguage: TranslationLanguage | null;
  prayerScheduledNotifications: ScheduledNotification[] | null;
  version: string;
}

@Injectable({
  providedIn: 'root'
})
export class UserStoreService {
  private readonly STORAGE_KEY = 'user-store';
  private readonly VERSION = '1.4.0';
  private saveTimeout: number | null = null;
  private readonly SAVE_DEBOUNCE_MS = 300;

  private readonly state = signal<StoredUserData>({
    selectedReciterId: null,
    bookmarks: [],
    lastReadPositions: {},
    lastRead: null,
    playerStates: {},
    scrollPositions: {},
    timeFormat: null,
    quranTranslationLanguage: null,
    prayerScheduledNotifications: null,
    version: this.VERSION
  });

  readonly selectedReciterId = computed(() => this.state().selectedReciterId);
  readonly bookmarks = computed(() => this.state().bookmarks);
  readonly lastReadPositions = computed(() => this.state().lastReadPositions);
  readonly lastRead = computed(() => this.state().lastRead);
  /** The surah page opened most recently this session (highlighted in the list); not saved */
  readonly lastOpenedChapterId = signal<number | null>(null);
  readonly timeFormat = computed(() => this.state().timeFormat);
  readonly quranTranslationLanguage = computed(() => this.state().quranTranslationLanguage);
  readonly prayerScheduledNotifications = computed(() => this.state().prayerScheduledNotifications ?? []);

  constructor() {
    this.loadFromLocalStorage();
  }

  setSelectedReciter(reciterId: number | null): void {
    this.updateState({ selectedReciterId: reciterId });
  }

  addBookmark(chapterId: number, verseNumber: number): void {
    const bookmarks = [...this.state().bookmarks];
    const existingIndex = bookmarks.findIndex(
      b => b.chapterId === chapterId && b.verseNumber === verseNumber
    );

    if (existingIndex === -1) {
      bookmarks.push({
        chapterId,
        verseNumber,
        timestamp: Date.now()
      });
      this.updateState({ bookmarks });
    }
  }

  removeBookmark(chapterId: number, verseNumber: number): void {
    const bookmarks = this.state().bookmarks.filter(
      b => !(b.chapterId === chapterId && b.verseNumber === verseNumber)
    );
    this.updateState({ bookmarks });
  }

  isBookmarked(chapterId: number, verseNumber: number): boolean {
    return this.state().bookmarks.some(
      b => b.chapterId === chapterId && b.verseNumber === verseNumber
    );
  }

  getBookmarksForChapter(chapterId: number): Bookmark[] {
    return this.state().bookmarks.filter(b => b.chapterId === chapterId);
  }

  setLastReadPosition(chapterId: number, verseNumber: number, via: LastRead['via'] = 'read'): void {
    const current = this.state();
    const place = current.lastRead;
    if (current.lastReadPositions[chapterId] === verseNumber
      && place?.chapterId === chapterId && place.verseNumber === verseNumber && place.via === via) {
      return;
    }
    const lastReadPositions = { ...current.lastReadPositions };
    lastReadPositions[chapterId] = verseNumber;
    this.updateState({ lastReadPositions, lastRead: { chapterId, verseNumber, via } });
  }

  getLastReadPosition(chapterId: number): number | null {
    return this.state().lastReadPositions[chapterId] || null;
  }

  setPlayerState(chapterId: number, playerState: PlayerState): void {
    const playerStates = { ...this.state().playerStates };
    playerStates[chapterId] = playerState;
    this.updateState({ playerStates });
  }

  getPlayerState(chapterId: number): PlayerState | null {
    return this.state().playerStates[chapterId] || null;
  }

  setScrollPosition(chapterId: number, scrollTop: number): void {
    const scrollPositions = { ...this.state().scrollPositions };
    scrollPositions[chapterId] = scrollTop;
    this.updateState({ scrollPositions });
  }

  getScrollPosition(chapterId: number): number | null {
    return this.state().scrollPositions[chapterId] ?? null;
  }

  setTimeFormat(format: TimeFormat): void {
    this.updateState({ timeFormat: format });
  }

  setQuranTranslationLanguage(language: TranslationLanguage): void {
    this.updateState({ quranTranslationLanguage: language });
  }

  setPrayerScheduledNotifications(notifications: ScheduledNotification[]): void {
    this.updateState({ prayerScheduledNotifications: notifications });
  }

  // --- What follows the signed-in account (AccountSyncService) ---------------------------

  /** Bookmarks, reading place and Quran preferences, as synced to the account */
  syncedData(): SyncedUserData {
    const s = this.state();
    return {
      bookmarks: s.bookmarks,
      lastRead: s.lastRead,
      lastReadPositions: s.lastReadPositions,
      reciterId: s.selectedReciterId,
      timeFormat: s.timeFormat,
      translation: s.quranTranslationLanguage,
    };
  }

  /** Takes the account's copy (only the fields it has) */
  applySynced(data: Partial<SyncedUserData>): void {
    const partial: Partial<StoredUserData> = {};
    if (Array.isArray(data.bookmarks)) partial.bookmarks = data.bookmarks;
    if (data.lastRead !== undefined) partial.lastRead = data.lastRead;
    if (data.lastReadPositions) partial.lastReadPositions = data.lastReadPositions;
    if (data.reciterId !== undefined && data.reciterId !== null) partial.selectedReciterId = data.reciterId;
    if (data.timeFormat) partial.timeFormat = data.timeFormat;
    if (data.translation) partial.quranTranslationLanguage = data.translation;
    if (Object.keys(partial).length) this.updateState(partial);
  }

  /** Signing out on a shared phone: their bookmarks and reading place don't stay behind */
  clearPersonal(): void {
    this.updateState({ bookmarks: [], lastRead: null, lastReadPositions: {} });
  }

  private updateState(partial: Partial<StoredUserData>): void {
    const newState = { ...this.state(), ...partial };
    this.state.set(newState);
    this.saveToLocalStorage();
  }

  private loadFromLocalStorage(): void {
    try {
      if (typeof localStorage === 'undefined') {
        return;
      }

      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (!stored) {
        // Try one-time migration from old keys
        this.migrateFromOldKeys();
        return;
      }

      const data = this.parseAndValidateData(stored);
      if (data) {
        this.state.set(data);
      }
    } catch (error) {
      Logger.error('Error loading user store from localStorage:', error);
      this.clearLocalStorage();
    }
  }

  private parseAndValidateData(stored: string): StoredUserData | null {
    try {
      const parsed = JSON.parse(stored);
      
      // Validate and normalize data structure
      const data: StoredUserData = {
        selectedReciterId: parsed.selectedReciterId ?? null,
        bookmarks: Array.isArray(parsed.bookmarks) ? parsed.bookmarks : [],
        lastReadPositions: this.validateObject(parsed.lastReadPositions, {}),
        lastRead: this.validateLastRead(parsed.lastRead),
        playerStates: this.validateObject(parsed.playerStates, {}),
        scrollPositions: this.validateObject(parsed.scrollPositions, {}),
        timeFormat: this.validateTimeFormat(parsed.timeFormat),
        quranTranslationLanguage: this.validateTranslationLanguage(parsed.quranTranslationLanguage),
        prayerScheduledNotifications: Array.isArray(parsed.prayerScheduledNotifications) 
          ? parsed.prayerScheduledNotifications 
          : null,
        version: parsed.version || this.VERSION
      };

      // Migrate if version mismatch
      if (data.version !== this.VERSION) {
        data.version = this.VERSION;
        this.state.set(data);
        this.saveToLocalStorage();
      }

      return data;
    } catch (error) {
      Logger.error('Error parsing user store data:', error);
      return null;
    }
  }

  private validateObject(value: any, defaultValue: any): any {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : defaultValue;
  }

  private validateLastRead(value: any): LastRead | null {
    return value && Number.isInteger(value.chapterId) && Number.isInteger(value.verseNumber)
      ? { chapterId: value.chapterId, verseNumber: value.verseNumber, via: value.via === 'listen' ? 'listen' : 'read' }
      : null;
  }

  private validateTimeFormat(value: any): TimeFormat | null {
    return value === TimeFormat.TWELVE_HOUR || value === TimeFormat.TWENTY_FOUR_HOUR 
      ? value 
      : null;
  }

  private validateTranslationLanguage(value: any): TranslationLanguage | null {
    return value === 'english' || value === 'bengali' || value === 'urdu' 
      ? value 
      : null;
  }

  private migrateFromOldKeys(): void {
    if (typeof localStorage === 'undefined') {
      return;
    }

    try {
      const migratedData: Partial<StoredUserData> = {
        selectedReciterId: null,
        bookmarks: [],
        lastReadPositions: {},
        lastRead: null,
        playerStates: {},
        scrollPositions: {},
        timeFormat: null,
        quranTranslationLanguage: null,
        prayerScheduledNotifications: null,
        version: this.VERSION
      };

      // Migrate from old quran-store
      const oldQuranStore = localStorage.getItem('quran-store');
      if (oldQuranStore) {
        try {
          const oldData = JSON.parse(oldQuranStore);
          migratedData.selectedReciterId = oldData.selectedReciterId ?? null;
          migratedData.bookmarks = Array.isArray(oldData.bookmarks) ? oldData.bookmarks : [];
          migratedData.lastReadPositions = this.validateObject(oldData.lastReadPositions, {});
          migratedData.playerStates = this.validateObject(oldData.playerStates, {});
          migratedData.scrollPositions = this.validateObject(oldData.scrollPositions, {});
          localStorage.removeItem('quran-store');
        } catch (e) {
          Logger.warn('Failed to migrate from quran-store:', e);
        }
      }

      // Migrate time format
      const oldTimeFormat = localStorage.getItem('app_time_format');
      if (oldTimeFormat) {
        const validated = this.validateTimeFormat(oldTimeFormat);
        if (validated) {
          migratedData.timeFormat = validated;
          localStorage.removeItem('app_time_format');
        }
      }

      // Migrate translation language
      const oldTranslation = localStorage.getItem('quran-translation-language');
      if (oldTranslation) {
        const validated = this.validateTranslationLanguage(oldTranslation);
        if (validated) {
          migratedData.quranTranslationLanguage = validated;
          localStorage.removeItem('quran-translation-language');
        }
      }

      // Migrate scheduled notifications
      const oldNotifications = localStorage.getItem('prayer_scheduled_notifications');
      if (oldNotifications) {
        try {
          const parsed = JSON.parse(oldNotifications);
          if (Array.isArray(parsed)) {
            migratedData.prayerScheduledNotifications = parsed;
            localStorage.removeItem('prayer_scheduled_notifications');
          }
        } catch (e) {
          Logger.warn('Failed to migrate scheduled notifications:', e);
        }
      }

      // Save migrated data
      const finalData: StoredUserData = {
        selectedReciterId: migratedData.selectedReciterId ?? null,
        bookmarks: migratedData.bookmarks ?? [],
        lastReadPositions: migratedData.lastReadPositions ?? {},
        lastRead: null,
        playerStates: migratedData.playerStates ?? {},
        scrollPositions: migratedData.scrollPositions ?? {},
        timeFormat: migratedData.timeFormat ?? null,
        quranTranslationLanguage: migratedData.quranTranslationLanguage ?? null,
        prayerScheduledNotifications: migratedData.prayerScheduledNotifications ?? null,
        version: this.VERSION
      };

      this.state.set(finalData);
      this.saveToLocalStorage();
    } catch (error) {
      Logger.error('Error during migration:', error);
    }
  }

  private saveToLocalStorage(): void {
    if (this.saveTimeout !== null) {
      clearTimeout(this.saveTimeout);
    }

    this.saveTimeout = window.setTimeout(() => {
      try {
        if (typeof localStorage === 'undefined') {
          return;
        }

        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.state()));
      } catch (error) {
        Logger.error('Error saving user store to localStorage:', error);
        if (error instanceof DOMException && error.name === 'QuotaExceededError') {
          // Clear old bookmarks if storage is full
          const state = this.state();
          const sortedBookmarks = [...state.bookmarks].sort((a, b) => b.timestamp - a.timestamp);
          const recentBookmarks = sortedBookmarks.slice(0, 100);
          this.updateState({ bookmarks: recentBookmarks });
        }
      }
    }, this.SAVE_DEBOUNCE_MS);
  }

  private clearLocalStorage(): void {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(this.STORAGE_KEY);
      }
    } catch (error) {
      Logger.error('Error clearing localStorage:', error);
    }
  }

  clearAllData(): void {
    this.state.set({
      selectedReciterId: null,
      bookmarks: [],
      lastReadPositions: {},
      lastRead: null,
      playerStates: {},
      scrollPositions: {},
      timeFormat: null,
      quranTranslationLanguage: null,
      prayerScheduledNotifications: null,
      version: this.VERSION
    });
    this.clearLocalStorage();
  }
}

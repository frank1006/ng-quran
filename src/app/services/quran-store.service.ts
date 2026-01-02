import { Injectable, signal, computed, DestroyRef, inject } from '@angular/core';
import { Reciter } from './quran-api.types';

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

interface StoredQuranData {
  selectedReciterId: number | null;
  bookmarks: Bookmark[];
  lastReadPositions: { [chapterId: number]: number }; // chapterId -> verseNumber
  playerStates: { [chapterId: number]: PlayerState }; // chapterId -> player state
  scrollPositions: { [chapterId: number]: number }; // chapterId -> scrollTop
  version: string;
}

@Injectable({
  providedIn: 'root'
})
export class QuranStoreService {
  private readonly STORAGE_KEY = 'quran-store';
  private readonly VERSION = '1.1.0';
  private readonly destroyRef = inject(DestroyRef);
  private saveTimeout: number | null = null;
  private readonly SAVE_DEBOUNCE_MS = 300;

  private readonly state = signal<StoredQuranData>({
    selectedReciterId: null,
    bookmarks: [],
    lastReadPositions: {},
    playerStates: {},
    scrollPositions: {},
    version: this.VERSION
  });

  readonly selectedReciterId = computed(() => this.state().selectedReciterId);
  readonly bookmarks = computed(() => this.state().bookmarks);
  readonly lastReadPositions = computed(() => this.state().lastReadPositions);

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

  setLastReadPosition(chapterId: number, verseNumber: number): void {
    const lastReadPositions = { ...this.state().lastReadPositions };
    lastReadPositions[chapterId] = verseNumber;
    this.updateState({ lastReadPositions });
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

  private updateState(partial: Partial<StoredQuranData>): void {
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
        return;
      }

      const data: StoredQuranData = JSON.parse(stored);

      // Migrate old data format to new format
      if (!data.version || data.version !== this.VERSION) {
        const migratedData: StoredQuranData = {
          selectedReciterId: data.selectedReciterId ?? null,
          bookmarks: data.bookmarks ?? [],
          lastReadPositions: data.lastReadPositions ?? {},
          playerStates: (data as any).playerStates ?? {},
          scrollPositions: (data as any).scrollPositions ?? {},
          version: this.VERSION
        };
        this.state.set(migratedData);
        this.saveToLocalStorage();
        return;
      }

      this.state.set(data);
    } catch (error) {
      console.error('Error loading Quran store from localStorage:', error);
      this.clearLocalStorage();
    }
  }

  private saveToLocalStorage(): void {
    // Debounce localStorage writes to improve performance
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
        console.error('Error saving Quran store to localStorage:', error);
        if (error instanceof DOMException && error.name === 'QuotaExceededError') {
          // Clear old bookmarks if storage is full
          const state = this.state();
          const sortedBookmarks = [...state.bookmarks].sort((a, b) => b.timestamp - a.timestamp);
          const recentBookmarks = sortedBookmarks.slice(0, 100); // Keep 100 most recent
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
      console.error('Error clearing localStorage:', error);
    }
  }

  clearAllData(): void {
    this.state.set({
      selectedReciterId: null,
      bookmarks: [],
      lastReadPositions: {},
      playerStates: {},
      scrollPositions: {},
      version: this.VERSION
    });
    this.clearLocalStorage();
  }
}


import { Injectable, isDevMode } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError, of } from 'rxjs';
import { catchError, map, shareReplay } from 'rxjs/operators';
import { Logger } from '../core/logger.util';

import {
  SurahListItem,
  SurahResponse,
  VerseResponse,
  RecitersResponse,
  AudioResponse,
  TafsirResponse,
  TranslationResponse,
  Chapter,
  ChapterWithVerses,
  Verse,
  Reciter,
  AudioRecitation,
  TranslationLanguage
} from '@quran-domain';

@Injectable({
  providedIn: 'root'
})
export class QuranApiService {
  private readonly baseUrl = 'https://quranapi.pages.dev/api/';
  private readonly STORAGE_KEY_CACHE = 'quran-cache'; // Unified cache key
  private readonly STORAGE_KEY_RECITERS = 'quran-api-reciters'; // Old key for migration
  private readonly STORAGE_KEY_CHAPTERS = 'quran-api-chapters'; // Old key for migration
  private readonly STORAGE_KEY_CHAPTER_PREFIX = 'quran-api-chapter-'; // Old key prefix for migration
  private readonly CACHE_VERSION = '1.0.0';
  private readonly MAX_CACHED_CHAPTERS = 20; // Limit number of chapters cached in localStorage to prevent storage bloat

  // Cache for reciters list (static data, cache once)
  private recitersCache$?: Observable<Reciter[]>;
  
  // Cache for chapters list (static data, cache once)
  private chaptersCache$?: Observable<Chapter[]>;
  
  // Cache for individual chapters by ID (cache per chapter)
  private chapterCacheMap = new Map<number, Observable<ChapterWithVerses>>();

  constructor(private http: HttpClient) {}

  /**
   * Get list of all chapters (surahs)
   * Endpoint: GET /api/surah.json
   * @returns Observable of Chapter array (cached in memory and localStorage)
   */
  getChapters(): Observable<Chapter[]> {
    if (!this.chaptersCache$) {
      // Try to load from localStorage first
      const cached = this.getCachedChapters();
      if (cached) {
        this.chaptersCache$ = of(cached).pipe(
          shareReplay({ bufferSize: 1, refCount: false })
        );
      } else {
        // Fetch from API and cache
        this.chaptersCache$ = this.http
          .get<SurahListItem[]>(`${this.baseUrl}surah.json`)
          .pipe(
            map(items => items.map((item, index) => this.mapSurahListItemToChapter(item, index + 1))),
            catchError(this.handleError),
            map(chapters => {
              // Save to localStorage
              this.setCachedChapters(chapters);
              return chapters;
            }),
            shareReplay({ bufferSize: 1, refCount: false }) // Cache the result and share across all subscribers
          );
      }
    }
    return this.chaptersCache$;
  }

  /**
   * Get a specific chapter by ID
   * Endpoint: GET /api/{surahNumber}.json
   * @param chapterId - Chapter number (1-114)
   * @returns Observable of ChapterWithVerses (cached in memory and localStorage)
   */
  getChapter(chapterId: number): Observable<ChapterWithVerses> {
    // Check in-memory cache first
    if (this.chapterCacheMap.has(chapterId)) {
      return this.chapterCacheMap.get(chapterId)!;
    }

    // Try to load from localStorage
    const cached = this.getCachedChapter(chapterId);
    if (cached) {
      const cached$ = of(cached).pipe(
        shareReplay({ bufferSize: 1, refCount: false })
      );
      this.chapterCacheMap.set(chapterId, cached$);
      return cached$;
    }

    // Fetch from API and cache
    const api$ = this.http
      .get<SurahResponse>(`${this.baseUrl}${chapterId}.json`)
      .pipe(
        map(response => {
          const chapter = this.mapSurahResponseToChapterWithVerses(response);
          // Save to localStorage with all translations
          this.setCachedChapter(chapterId, chapter, {
            english: response.english,
            bengali: response.bengali,
            urdu: response.urdu
          });
          // Attach all translations to chapter object for component use
          chapter._translations = response.english;
          (chapter as any)._translations_bengali = response.bengali || [];
          (chapter as any)._translations_urdu = response.urdu || [];
          return chapter;
        }),
        catchError(this.handleError),
        shareReplay({ bufferSize: 1, refCount: false }) // Cache in memory for subsequent subscriptions
      );

    this.chapterCacheMap.set(chapterId, api$);
    return api$;
  }

  /**
   * Get a specific verse by chapter and verse number
   * Endpoint: GET /api/{chapterNumber}/{verseNumber}.json
   * @param chapterId - Chapter number (1-114)
   * @param verseNumber - Verse number
   * @returns Observable of VerseResponse
   */
  getVerse(chapterId: number, verseNumber: number): Observable<VerseResponse> {
    return this.http
      .get<VerseResponse>(`${this.baseUrl}${chapterId}/${verseNumber}.json`)
      .pipe(catchError(this.handleError));
  }

  /**
   * Get tafsir (explanation/commentary) for a specific verse
   * Endpoint: GET /api/tafsir/{chapter}_{verse}.json
   * @param chapterId - Chapter number (1-114)
   * @param verseNumber - Verse number
   * @returns Observable of TafsirResponse
   */
  getTafsir(chapterId: number, verseNumber: number): Observable<TafsirResponse> {
    return this.http
      .get<TafsirResponse>(`${this.baseUrl}tafsir/${chapterId}_${verseNumber}.json`)
      .pipe(catchError(this.handleError));
  }

  /**
   * Get full translation of the Quran
   * Endpoint: GET /api/{language}.json
   * @param language - Translation language ('en', 'bn', 'urdu', etc.)
   * @returns Observable of TranslationResponse
   */
  getTranslation(language: TranslationLanguage): Observable<TranslationResponse> {
    return this.http
      .get<TranslationResponse>(`${this.baseUrl}${language}.json`)
      .pipe(catchError(this.handleError));
  }

  /**
   * Get list of available reciters
   * Endpoint: GET /api/reciters.json
   * @returns Observable of Reciter array (cached in memory and localStorage)
   */
  getReciters(): Observable<Reciter[]> {
    if (!this.recitersCache$) {
      // Try to load from localStorage first
      const cached = this.getCachedReciters();
      if (cached) {
        this.recitersCache$ = of(cached).pipe(
          shareReplay({ bufferSize: 1, refCount: false })
        );
      } else {
        // Fetch from API and cache
        this.recitersCache$ = this.http
          .get<RecitersResponse>(`${this.baseUrl}reciters.json`)
          .pipe(
            map(response => this.mapRecitersResponseToReciterArray(response)),
            catchError(this.handleError),
            map(reciters => {
              // Save to localStorage
              this.setCachedReciters(reciters);
              return reciters;
            }),
            shareReplay({ bufferSize: 1, refCount: false }) // Cache the result and share across all subscribers
          );
      }
    }
    return this.recitersCache$;
  }

  /**
   * Get audio recitation URL for a specific verse
   * Uses the verse API endpoint which includes audio in the response
   * Endpoint: GET /api/{chapterNumber}/{verseNumber}.json
   * @param chapterId - Chapter number (1-114)
   * @param verseNumber - Verse number
   * @param reciterId - Reciter ID (1-5)
   * @returns Observable of AudioRecitation with originalUrl
   */
  getAudioRecitation(
    chapterId: number,
    verseNumber: number,
    reciterId: number
  ): Observable<AudioRecitation> {
    return this.http
      .get<VerseResponse>(`${this.baseUrl}${chapterId}/${verseNumber}.json`)
      .pipe(
        map(response => {
          // The response contains audio object with reciter IDs as keys
          const audioData = response.audio[reciterId.toString()];
          if (!audioData) {
            throw new Error(`Audio not found for reciter ${reciterId}`);
          }
          return {
            audio_url: audioData.originalUrl || audioData.url,
            format: 'mp3'
          };
        }),
        catchError(this.handleError)
      );
  }

  /**
   * Get audio for a specific verse from a surah's audio data
   * Helper method to get audio from surah response
   * @param surahResponse - The surah response containing audio data
   * @param reciterId - Reciter ID
   * @param verseNumber - Verse number (1-based)
   * @returns Audio URL or null
   */
  getAudioFromSurah(
    surahResponse: SurahResponse,
    reciterId: number,
    verseNumber: number
  ): string | null {
    const audioData = surahResponse.audio[reciterId.toString()];
    if (!audioData) {
      return null;
    }
    // Note: The surah audio endpoint returns full surah audio, not per-verse
    // We'll need to use the verse-level audio endpoint instead
    return audioData.originalUrl || audioData.url;
  }

  /**
   * Map SurahListItem to Chapter interface
   */
  private mapSurahListItemToChapter(item: SurahListItem, id: number): Chapter {
    return {
      id,
      name: item.surahNameArabic,
      transliteration: item.surahName,
      translation: item.surahNameTranslation,
      type: item.revelationPlace === 'Mecca' ? 'Meccan' : 'Medinan',
      total_verses: item.totalAyah
    };
  }

  /**
   * Map SurahResponse to ChapterWithVerses interface
   */
  private mapSurahResponseToChapterWithVerses(response: SurahResponse): ChapterWithVerses {
    const verses: Verse[] = response.english.map((translation, index) => {
      const verseNumber = index + 1;
      return {
        id: verseNumber,
        verse_number: verseNumber,
        chapter_id: response.surahNo,
        verse_key: `${response.surahNo}:${verseNumber}`,
        text_uthmani: response.arabic1[index] || '',
        text_simple: response.arabic2[index] || '',
        text_indopak: response.arabic1[index] || ''
      };
    });

    return {
      id: response.surahNo,
      name: response.surahNameArabic,
      transliteration: response.surahName,
      translation: response.surahNameTranslation,
      type: response.revelationPlace === 'Mecca' ? 'Meccan' : 'Medinan',
      total_verses: response.totalAyah,
      verses
    };
  }

  /**
   * Map RecitersResponse to Reciter array
   */
  private mapRecitersResponseToReciterArray(response: RecitersResponse): Reciter[] {
    return Object.entries(response).map(([id, name]) => ({
      id: parseInt(id, 10),
      name
    }));
  }

  /**
   * Handle HTTP errors
   * @param error - HTTP error response
   * @returns Error observable
   */
  private handleError(error: HttpErrorResponse): Observable<never> {
    let errorMessage = 'Unable to load content. Please try again.';
    
    if (error.error instanceof ErrorEvent) {
      // Client-side error (network issues, CORS, etc.)
      const clientMessage = error.error.message || '';
      
      // Check for network-related errors
      if (clientMessage.includes('Failed to fetch') || 
          clientMessage.includes('NetworkError') ||
          clientMessage.includes('network') ||
          !navigator.onLine) {
        errorMessage = 'No internet connection. Please check your network and try again.';
      } else if (clientMessage) {
        errorMessage = clientMessage;
      }
    } else {
      // Server-side error
      switch (error.status) {
        case 0:
          errorMessage = 'No internet connection. Please check your network and try again.';
          break;
        case 404:
          errorMessage = 'Content not found. Please try again later.';
          break;
        case 429:
          errorMessage = 'Too many requests. Please try again in a moment.';
          break;
        case 500:
        case 502:
        case 503:
          errorMessage = 'Service temporarily unavailable. Please try again later.';
          break;
        default:
          // Use the error message if available, otherwise use a generic message
          if (error.message && error.message !== 'Http failure response') {
            errorMessage = error.message;
          }
      }
    }
    
    // Log detailed error for debugging (only in development)
    if (isDevMode()) {
      Logger.error('Quran API Error:', {
        status: error.status,
        message: error.message,
        url: error.url,
        userMessage: errorMessage
      });
    }
    
    return throwError(() => new Error(errorMessage));
  }

  /**
   * Get cached chapters from localStorage
   */
  private getCachedChapters(): Chapter[] | null {
    try {
      if (typeof localStorage === 'undefined') {
        return null;
      }

      // Try to load from new quran-cache structure
      const cacheStored = localStorage.getItem(this.STORAGE_KEY_CACHE);
      if (cacheStored) {
        try {
          const cache = JSON.parse(cacheStored);
          if (cache.chapters && cache.version === this.CACHE_VERSION) {
            return cache.chapters;
          }
        } catch (error) {
          // Invalid cache structure, continue to migration check
        }
      }

      // Migration: Check for old key and migrate to new structure
      const oldStored = localStorage.getItem(this.STORAGE_KEY_CHAPTERS);
      if (oldStored) {
        try {
          const data = JSON.parse(oldStored);
          if (data.version === this.CACHE_VERSION && data.chapters) {
            // Migrate to new structure
            this.setCachedChapters(data.chapters);
            // Remove old key
            localStorage.removeItem(this.STORAGE_KEY_CHAPTERS);
            return data.chapters;
          }
        } catch (error) {
          // Invalid old data, ignore
        }
      }

      return null;
    } catch (error) {
      if (isDevMode()) {
        Logger.error('Error reading chapters from localStorage:', error);
      }
      return null;
    }
  }

  /**
   * Save chapters to localStorage
   */
  private setCachedChapters(chapters: Chapter[]): void {
    try {
      if (typeof localStorage === 'undefined') {
        return;
      }

      // Load existing cache or create new
      let cache: { version?: string; chapters?: Chapter[]; reciters?: Reciter[]; chapterCache?: Record<string, any>; timestamp?: string } = {};
      const cacheStored = localStorage.getItem(this.STORAGE_KEY_CACHE);
      if (cacheStored) {
        try {
          cache = JSON.parse(cacheStored);
        } catch (error) {
          // Invalid cache, create new
          cache = {};
        }
      }

      // Update cache
      cache.version = this.CACHE_VERSION;
      cache.chapters = chapters;
      cache.timestamp = new Date().toISOString();

      localStorage.setItem(this.STORAGE_KEY_CACHE, JSON.stringify(cache));
    } catch (error) {
      if (isDevMode()) {
        Logger.error('Error saving chapters to localStorage:', error);
      }
      // Silently fail - in-memory cache will still work
    }
  }

  /**
   * Get cached reciters from localStorage
   */
  private getCachedReciters(): Reciter[] | null {
    try {
      if (typeof localStorage === 'undefined') {
        return null;
      }

      // Try to load from new quran-cache structure
      const cacheStored = localStorage.getItem(this.STORAGE_KEY_CACHE);
      if (cacheStored) {
        try {
          const cache = JSON.parse(cacheStored);
          if (cache.reciters && cache.version === this.CACHE_VERSION) {
            return cache.reciters;
          }
        } catch (error) {
          // Invalid cache structure, continue to migration check
        }
      }

      // Migration: Check for old key and migrate to new structure
      const oldStored = localStorage.getItem(this.STORAGE_KEY_RECITERS);
      if (oldStored) {
        try {
          const data = JSON.parse(oldStored);
          if (data.version === this.CACHE_VERSION && data.reciters) {
            // Migrate to new structure
            this.setCachedReciters(data.reciters);
            // Remove old key
            localStorage.removeItem(this.STORAGE_KEY_RECITERS);
            return data.reciters;
          }
        } catch (error) {
          // Invalid old data, ignore
        }
      }

      return null;
    } catch (error) {
      if (isDevMode()) {
        Logger.error('Error reading reciters from localStorage:', error);
      }
      return null;
    }
  }

  /**
   * Save reciters to localStorage
   */
  private setCachedReciters(reciters: Reciter[]): void {
    try {
      if (typeof localStorage === 'undefined') {
        return;
      }

      // Load existing cache or create new
      let cache: { version?: string; chapters?: Chapter[]; reciters?: Reciter[]; chapterCache?: Record<string, any>; timestamp?: string } = {};
      const cacheStored = localStorage.getItem(this.STORAGE_KEY_CACHE);
      if (cacheStored) {
        try {
          cache = JSON.parse(cacheStored);
        } catch (error) {
          // Invalid cache, create new
          cache = {};
        }
      }

      // Update cache
      cache.version = this.CACHE_VERSION;
      cache.reciters = reciters;
      cache.timestamp = new Date().toISOString();

      localStorage.setItem(this.STORAGE_KEY_CACHE, JSON.stringify(cache));
    } catch (error) {
      if (isDevMode()) {
        Logger.error('Error saving reciters to localStorage:', error);
      }
      // Silently fail - in-memory cache will still work
    }
  }

  /**
   * Get cached chapter from localStorage
   * Returns chapter with translations attached as _translations property
   */
  private getCachedChapter(chapterId: number): ChapterWithVerses | null {
    try {
      if (typeof localStorage === 'undefined') {
        return null;
      }

      // Try to load from new quran-cache structure
      const cacheStored = localStorage.getItem(this.STORAGE_KEY_CACHE);
      if (cacheStored) {
        try {
          const cache = JSON.parse(cacheStored);
          if (cache.chapterCache && cache.chapterCache[chapterId.toString()] && cache.version === this.CACHE_VERSION) {
            const data = cache.chapterCache[chapterId.toString()];
            const chapter = data.chapter as ChapterWithVerses;
            if (data.translations) {
              // Handle both old format (string[]) and new format (object with english/bengali/urdu)
              if (Array.isArray(data.translations)) {
                // Old format - only english translations
                chapter._translations = data.translations;
                (chapter as any)._translations_bengali = [];
                (chapter as any)._translations_urdu = [];
              } else {
                // New format - all translations
                chapter._translations = data.translations.english || [];
                (chapter as any)._translations_bengali = data.translations.bengali || [];
                (chapter as any)._translations_urdu = data.translations.urdu || [];
              }
            }
            return chapter;
          }
        } catch (error) {
          // Invalid cache structure, continue to migration check
        }
      }

      // Migration: Check for old key and migrate to new structure
      const oldKey = `${this.STORAGE_KEY_CHAPTER_PREFIX}${chapterId}`;
      const oldStored = localStorage.getItem(oldKey);
      if (oldStored) {
        try {
          const data = JSON.parse(oldStored);
          if (data.version === this.CACHE_VERSION && data.chapter) {
            // Migrate to new structure
            this.setCachedChapter(chapterId, data.chapter, data.translations);
            // Remove old key
            localStorage.removeItem(oldKey);
            
            // Attach translations if available
            const chapter = data.chapter as ChapterWithVerses;
            if (data.translations) {
              // Handle both old format (string[]) and new format (object with english/bengali/urdu)
              if (Array.isArray(data.translations)) {
                // Old format - only english translations
                chapter._translations = data.translations;
                (chapter as any)._translations_bengali = [];
                (chapter as any)._translations_urdu = [];
              } else {
                // New format - all translations
                chapter._translations = data.translations.english || [];
                (chapter as any)._translations_bengali = data.translations.bengali || [];
                (chapter as any)._translations_urdu = data.translations.urdu || [];
              }
            }
            return chapter;
          }
        } catch (error) {
          // Invalid old data, ignore
        }
      }

      return null;
    } catch (error) {
      if (isDevMode()) {
        Logger.error(`Error reading chapter ${chapterId} from localStorage:`, error);
      }
      return null;
    }
  }

  /**
   * Save chapter to localStorage
   * Implements LRU-like behavior by limiting cache size
   */
  private setCachedChapter(
    chapterId: number, 
    chapter: ChapterWithVerses, 
    translations?: { english?: string[]; bengali?: string[]; urdu?: string[] }
  ): void {
    try {
      if (typeof localStorage === 'undefined') {
        return;
      }

      // Load existing cache or create new
      let cache: { version?: string; chapters?: Chapter[]; reciters?: Reciter[]; chapterCache?: Record<string, any>; timestamp?: string } = {};
      const cacheStored = localStorage.getItem(this.STORAGE_KEY_CACHE);
      if (cacheStored) {
        try {
          cache = JSON.parse(cacheStored);
        } catch (error) {
          // Invalid cache, create new
          cache = {};
        }
      }

      // Initialize chapterCache if it doesn't exist
      if (!cache.chapterCache) {
        cache.chapterCache = {};
      }

      // Prepare chapter data
      interface ChapterCacheData {
        version: string;
        chapter: ChapterWithVerses;
        timestamp: string;
        chapterId: number;
        translations?: { english?: string[]; bengali?: string[]; urdu?: string[] };
      }
      
      const chapterData: ChapterCacheData = {
        version: this.CACHE_VERSION,
        chapter,
        timestamp: new Date().toISOString(),
        chapterId
      };
      
      // Store all translations separately
      if (translations) {
        chapterData.translations = translations;
      }

      // Update cache
      cache.version = this.CACHE_VERSION;
      cache.chapterCache[chapterId.toString()] = chapterData;
      cache.timestamp = new Date().toISOString();

      // Clean up old chapters if cache limit is exceeded
      this.cleanupOldChapters(cache);

      localStorage.setItem(this.STORAGE_KEY_CACHE, JSON.stringify(cache));
    } catch (error) {
      if (isDevMode()) {
        Logger.error(`Error saving chapter ${chapterId} to localStorage:`, error);
      }
      // Silently fail - in-memory cache will still work
      
      // If quota exceeded, try cleaning up and retry once
      if (error instanceof DOMException && error.name === 'QuotaExceededError') {
        try {
          // Load cache again
          const cacheStored = localStorage.getItem(this.STORAGE_KEY_CACHE);
          if (cacheStored) {
            const cache = JSON.parse(cacheStored);
            this.cleanupOldChapters(cache, true); // Force cleanup
            
            // Retry saving
            if (!cache.chapterCache) {
              cache.chapterCache = {};
            }
            interface ChapterCacheData {
              version: string;
              chapter: ChapterWithVerses;
              timestamp: string;
              chapterId: number;
              translations?: { english?: string[]; bengali?: string[]; urdu?: string[] };
            }
            const chapterData: ChapterCacheData = {
              version: this.CACHE_VERSION,
              chapter,
              timestamp: new Date().toISOString(),
              chapterId
            };
            if (translations) {
              chapterData.translations = translations;
            }
            cache.version = this.CACHE_VERSION;
            cache.chapterCache[chapterId.toString()] = chapterData;
            cache.timestamp = new Date().toISOString();
            localStorage.setItem(this.STORAGE_KEY_CACHE, JSON.stringify(cache));
          }
        } catch (retryError) {
          // Give up after retry
        }
      }
    }
  }

  /**
   * Clean up old chapters from localStorage to prevent storage bloat
   * Keeps the most recently accessed chapters
   */
  private cleanupOldChapters(cache?: { chapterCache?: Record<string, any> }, force: boolean = false): void {
    try {
      if (typeof localStorage === 'undefined') {
        return;
      }

      // Load cache if not provided
      if (!cache) {
        const cacheStored = localStorage.getItem(this.STORAGE_KEY_CACHE);
        if (!cacheStored) {
          return;
        }
        try {
          cache = JSON.parse(cacheStored);
        } catch (error) {
          return;
        }
      }

      // Type guard: ensure cache is defined
      if (!cache || !cache.chapterCache) {
        return;
      }

      const chapters: Array<{ chapterId: string; timestamp: string }> = [];
      
      // Collect all cached chapters with their timestamps
      for (const [chapterId, data] of Object.entries(cache.chapterCache)) {
        try {
          if (data && data.version === this.CACHE_VERSION && data.timestamp) {
            chapters.push({
              chapterId,
              timestamp: data.timestamp
            });
          }
        } catch (error) {
          // Skip invalid entries
          continue;
        }
      }

      // Sort by timestamp (newest first)
      chapters.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      // Remove oldest chapters if over limit
      const limit = force ? Math.max(1, Math.floor(this.MAX_CACHED_CHAPTERS / 2)) : this.MAX_CACHED_CHAPTERS;
      if (chapters.length > limit && cache && cache.chapterCache) {
        const toRemove = chapters.slice(limit);
        for (const item of toRemove) {
          delete cache.chapterCache[item.chapterId];
        }
        // Save updated cache
        localStorage.setItem(this.STORAGE_KEY_CACHE, JSON.stringify(cache));
      }

      // Also clean up any remaining old keys (migration cleanup)
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(this.STORAGE_KEY_CHAPTER_PREFIX)) {
          localStorage.removeItem(key);
        }
      }
    } catch (error) {
      if (isDevMode()) {
        Logger.error('Error cleaning up old chapters:', error);
      }
    }
  }

  /**
   * Clear all cached chapters from memory (useful for testing or memory management)
   */
  clearChapterCache(): void {
    this.chapterCacheMap.clear();
  }
}

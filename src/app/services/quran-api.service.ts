import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

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
} from './quran-api.types';

@Injectable({
  providedIn: 'root'
})
export class QuranApiService {
  private readonly baseUrl = 'https://quranapi.pages.dev/api/';

  constructor(private http: HttpClient) {}

  /**
   * Get list of all chapters (surahs)
   * Endpoint: GET /api/surah.json
   * @returns Observable of Chapter array
   */
  getChapters(): Observable<Chapter[]> {
    return this.http
      .get<SurahListItem[]>(`${this.baseUrl}surah.json`)
      .pipe(
        map(items => items.map((item, index) => this.mapSurahListItemToChapter(item, index + 1))),
        catchError(this.handleError)
      );
  }

  /**
   * Get a specific chapter by ID
   * Endpoint: GET /api/{surahNumber}.json
   * @param chapterId - Chapter number (1-114)
   * @returns Observable of ChapterWithVerses
   */
  getChapter(chapterId: number): Observable<ChapterWithVerses> {
    return this.http
      .get<SurahResponse>(`${this.baseUrl}${chapterId}.json`)
      .pipe(
        map(response => this.mapSurahResponseToChapterWithVerses(response)),
        catchError(this.handleError)
      );
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
   * @returns Observable of Reciter array
   */
  getReciters(): Observable<Reciter[]> {
    return this.http
      .get<RecitersResponse>(`${this.baseUrl}reciters.json`)
      .pipe(
        map(response => this.mapRecitersResponseToReciterArray(response)),
        catchError(this.handleError)
      );
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
    let errorMessage = 'An unknown error occurred';
    
    if (error.error instanceof ErrorEvent) {
      // Client-side error
      errorMessage = `Error: ${error.error.message}`;
    } else {
      // Server-side error
      errorMessage = `Error Code: ${error.status}\nMessage: ${error.message}`;
    }
    
    console.error('Quran API Error:', errorMessage);
    return throwError(() => new Error(errorMessage));
  }
}

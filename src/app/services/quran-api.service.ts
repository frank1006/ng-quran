import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';

import {
  Chapter,
  Verse,
  VerseWithTranslation,
  ChapterWithVerses,
  Tafsir,
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
   * @returns Observable of Chapter array
   */
  getChapters(): Observable<Chapter[]> {
    return this.http
      .get<Chapter[]>(`${this.baseUrl}chapters`)
      .pipe(catchError(this.handleError));
  }

  /**
   * Get a specific chapter by ID
   * @param chapterId - Chapter number (1-114)
   * @param language - Optional translation language
   * @returns Observable of Chapter with verses
   */
  getChapter(chapterId: number, language?: TranslationLanguage): Observable<ChapterWithVerses> {
    let url = `${this.baseUrl}chapters/${chapterId}`;
    if (language) {
      url += `?language=${language}`;
    }
    return this.http
      .get<ChapterWithVerses>(url)
      .pipe(catchError(this.handleError));
  }

  /**
   * Get a specific verse by chapter and verse number
   * @param chapterId - Chapter number (1-114)
   * @param verseNumber - Verse number
   * @param language - Optional translation language
   * @returns Observable of Verse with translation
   */
  getVerse(
    chapterId: number,
    verseNumber: number,
    language?: TranslationLanguage
  ): Observable<VerseWithTranslation> {
    let url = `${this.baseUrl}chapters/${chapterId}/verses/${verseNumber}`;
    if (language) {
      url += `?language=${language}`;
    }
    return this.http
      .get<VerseWithTranslation>(url)
      .pipe(catchError(this.handleError));
  }

  /**
   * Get tafsir (explanation/commentary) for a specific verse
   * @param chapterId - Chapter number (1-114)
   * @param verseNumber - Verse number
   * @returns Observable of Tafsir array
   */
  getTafsir(chapterId: number, verseNumber: number): Observable<Tafsir[]> {
    return this.http
      .get<Tafsir[]>(`${this.baseUrl}chapters/${chapterId}/verses/${verseNumber}/tafsir`)
      .pipe(catchError(this.handleError));
  }

  /**
   * Get full translation of the Quran
   * @param language - Translation language ('en', 'bn', or 'ar')
   * @returns Observable of translation data
   */
  getTranslation(language: TranslationLanguage): Observable<any> {
    return this.http
      .get<any>(`${this.baseUrl}translations/${language}`)
      .pipe(catchError(this.handleError));
  }

  /**
   * Get list of available reciters
   * @returns Observable of Reciter array
   */
  getReciters(): Observable<Reciter[]> {
    return this.http
      .get<Reciter[]>(`${this.baseUrl}reciters`)
      .pipe(catchError(this.handleError));
  }

  /**
   * Get audio recitation URL for a specific verse
   * @param reciterId - Reciter ID or name
   * @param chapterId - Chapter number (1-114)
   * @param verseNumber - Verse number
   * @returns Observable of AudioRecitation
   */
  getAudioRecitation(
    reciterId: string | number,
    chapterId: number,
    verseNumber: number
  ): Observable<AudioRecitation> {
    return this.http
      .get<AudioRecitation>(
        `${this.baseUrl}reciters/${reciterId}/chapters/${chapterId}/verses/${verseNumber}/audio`
      )
      .pipe(catchError(this.handleError));
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


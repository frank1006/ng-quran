/**
 * Types and interfaces for Quran API responses
 * Based on: https://quranapi.pages.dev/getting-started
 */

// Surah list item from /api/surah.json
export interface SurahListItem {
  surahName: string;
  surahNameArabic: string;
  surahNameArabicLong: string;
  surahNameTranslation: string;
  revelationPlace: 'Mecca' | 'Madina';
  totalAyah: number;
}

// Full surah/chapter response from /api/{surahNumber}.json
export interface SurahResponse {
  surahName: string;
  surahNameArabic: string;
  surahNameArabicLong: string;
  surahNameTranslation: string;
  revelationPlace: 'Mecca' | 'Madina';
  totalAyah: number;
  surahNo: number;
  audio: {
    [reciterId: string]: {
      reciter: string;
      url: string;
      originalUrl: string;
    };
  };
  english: string[];
  arabic1: string[]; // Uthmani
  arabic2: string[]; // Simple
  bengali?: string[];
  urdu?: string[];
}

// Verse response from /api/{chapterNumber}/{verseNumber}.json
export interface VerseResponse {
  surahName: string;
  surahNameArabic: string;
  surahNameArabicLong: string;
  surahNameTranslation: string;
  revelationPlace: 'Mecca' | 'Madina';
  totalAyah: number;
  surahNo: number;
  ayahNo: number;
  audio: {
    [reciterId: string]: {
      reciter: string;
      url: string;
      originalUrl: string;
    };
  };
  english: string;
  arabic1: string;
  arabic2: string;
  bengali?: string;
  urdu?: string;
}

// Reciters response from /api/reciters.json - returns object with id as key
export interface RecitersResponse {
  [reciterId: string]: string; // "1": "Mishary Rashid Al Afasy"
}

// Audio response from /api/audio/{reciterId}/{verseNumber}.json
export interface AudioResponse {
  [reciterId: string]: {
    reciter: string;
    url: string;
    originalUrl: string;
  };
}

// Tafsir response from /api/tafsir/{chapter}_{verse}.json
export interface TafsirResponse {
  text: string;
  source?: string;
}

// Translation response from /api/{language}.json
export interface TranslationResponse {
  [surahNumber: string]: {
    [ayahNumber: string]: string;
  };
}

// Legacy interfaces for backward compatibility (will be mapped)
export interface Chapter {
  id: number;
  name: string;
  transliteration: string;
  translation: string;
  type: 'Meccan' | 'Medinan';
  total_verses: number;
}

export interface Verse {
  id: number;
  verse_number: number;
  chapter_id: number;
  verse_key: string;
  text_uthmani?: string;
  text_indopak?: string;
  text_simple?: string;
  juz_number?: number;
  hizb_number?: number;
  rub_el_hizb_number?: number;
  ruku_number?: number;
  manzil_number?: number;
  sajdah_type?: string | null;
  sajdah_number?: number | null;
}

export interface VerseTranslation {
  id: number;
  resource_id: number;
  text: string;
}

export interface VerseWithTranslation extends Verse {
  translations?: VerseTranslation[];
}

export interface Tafsir {
  id: number;
  resource_id: number;
  text: string;
}

export interface ChapterWithVerses extends Chapter {
  verses: Verse[];
  _translations?: string[]; // Optional translations array attached by service
}

export interface Reciter {
  id: number;
  name: string;
  recitation_style?: string;
  qirat?: string;
}

export interface AudioRecitation {
  audio_url: string;
  duration?: number;
  format?: string;
}

export type TranslationLanguage = 'en' | 'bn' | 'ar' | 'urdu';

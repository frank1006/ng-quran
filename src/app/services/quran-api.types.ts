/**
 * Types and interfaces for Quran API responses
 */

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

export type TranslationLanguage = 'en' | 'bn' | 'ar';


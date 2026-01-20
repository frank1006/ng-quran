import { Injectable, NotFoundException } from '@nestjs/common';
import { QuranRepository } from './quran.repository';
import { Surah } from './entities/surah.entity';
import { Ayah } from './entities/ayah.entity';
import { Translation } from './entities/translation.entity';

/**
 * Quran Service
 * Business logic for Quran data retrieval.
 * Formats data to match frontend expectations.
 */
@Injectable()
export class QuranService {
  constructor(private readonly quranRepository: QuranRepository) {}

  /**
   * Get all surahs (chapters)
   * Returns data in format compatible with frontend
   */
  async getAllSurahs(): Promise<any[]> {
    const surahs = await this.quranRepository.findAllSurahs();
    return surahs.map((surah) => this.mapSurahToChapter(surah));
  }

  /**
   * Get a single surah by ID with all ayahs
   * Returns data in format compatible with frontend ChapterWithVerses
   */
  async getSurahById(id: number, language?: string): Promise<any> {
    const surah = await this.quranRepository.findSurahById(id);
    if (!surah) {
      throw new NotFoundException(`Surah with ID ${id} not found`);
    }

    const ayahs = await this.quranRepository.findAyahsBySurahId(id);
    const verses = await Promise.all(
      ayahs.map((ayah) => this.mapAyahToVerse(ayah, language)),
    );

    return {
      ...this.mapSurahToChapter(surah),
      verses,
    };
  }

  /**
   * Get all ayahs for a specific surah
   */
  async getAyahsBySurahId(surahId: number, language?: string): Promise<any[]> {
    const ayahs = await this.quranRepository.findAyahsBySurahId(surahId);
    return Promise.all(ayahs.map((ayah) => this.mapAyahToVerse(ayah, language)));
  }

  /**
   * Get a single ayah by ID
   */
  async getAyahById(id: string, language?: string): Promise<any> {
    const ayah = await this.quranRepository.findAyahById(id);
    if (!ayah) {
      throw new NotFoundException(`Ayah with ID ${id} not found`);
    }
    return this.mapAyahToVerse(ayah, language);
  }

  /**
   * Get a single ayah by surah_id and ayah_number
   */
  async getAyahBySurahAndNumber(
    surahId: number,
    ayahNumber: number,
    language?: string,
  ): Promise<any> {
    const ayah = await this.quranRepository.findAyahBySurahAndNumber(
      surahId,
      ayahNumber,
    );
    if (!ayah) {
      throw new NotFoundException(
        `Ayah ${ayahNumber} in Surah ${surahId} not found`,
      );
    }
    return this.mapAyahToVerse(ayah, language);
  }

  /**
   * Get translations for an ayah
   */
  async getTranslationsByAyahId(
    ayahId: string,
    languageCode?: string,
  ): Promise<Translation[]> {
    return this.quranRepository.findTranslationsByAyahId(ayahId, languageCode);
  }

  /**
   * Map Surah entity to frontend Chapter format
   */
  private mapSurahToChapter(surah: Surah): any {
    return {
      id: surah.id,
      name: surah.name_en,
      transliteration: surah.transliteration || surah.name_en,
      translation: surah.name_en,
      type: surah.revelation_type === 'Mecca' ? 'Meccan' : 'Medinan',
      total_verses: surah.ayah_count,
    };
  }

  /**
   * Map Ayah entity to frontend Verse format
   */
  private async mapAyahToVerse(ayah: Ayah, language?: string): Promise<any> {
    // Get translations if needed
    let translations: Translation[] = [];
    if (language || ayah.translations) {
      translations = language
        ? await this.quranRepository.findTranslationsByAyahId(ayah.id, language)
        : ayah.translations || [];
    }

    // Map language codes
    const langMap: Record<string, string> = {
      en: 'english',
      ur: 'urdu',
      bn: 'bengali',
    };

    const result: any = {
      id: ayah.id,
      verse_number: ayah.ayah_number,
      chapter_id: ayah.surah_id,
      verse_key: `${ayah.surah_id}:${ayah.ayah_number}`,
      text_uthmani: ayah.arabic_text,
      text_simple: ayah.arabic_text_simple || ayah.arabic_text,
    };

    // Add Mushaf metadata
    if (ayah.juz) result.juz_number = ayah.juz;
    if (ayah.hizb) result.hizb_number = ayah.hizb;
    if (ayah.rub_el_hizb) result.rub_el_hizb_number = ayah.rub_el_hizb;
    if (ayah.ruku) result.ruku_number = ayah.ruku;
    if (ayah.manzil) result.manzil_number = ayah.manzil;
    if (ayah.sajdah_type) result.sajdah_type = ayah.sajdah_type;
    if (ayah.sajdah_number) result.sajdah_number = ayah.sajdah_number;

    // Add translations in the format expected by frontend
    if (translations.length > 0) {
      result.translations = translations.map((t) => ({
        id: t.id,
        resource_id: 1, // Default resource ID
        text: t.text,
        language: t.language_code,
        source: t.source || t.translator,
      }));

      // Also add as flat properties for backward compatibility
      translations.forEach((t) => {
        const propName = langMap[t.language_code] || t.language_code;
        if (propName) {
          result[propName] = t.text;
        }
      });
    }

    return result;
  }
}


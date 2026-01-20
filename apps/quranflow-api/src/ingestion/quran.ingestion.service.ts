import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Surah } from '../quran/entities/surah.entity';
import { Ayah } from '../quran/entities/ayah.entity';
import { Translation } from '../quran/entities/translation.entity';

/**
 * External API response types (from quranapi.pages.dev)
 */
interface SurahListItem {
  surahName: string;
  surahNameArabic: string;
  surahNameArabicLong: string;
  surahNameTranslation: string;
  revelationPlace: 'Mecca' | 'Madina';
  totalAyah: number;
}

interface SurahResponse {
  surahName: string;
  surahNameArabic: string;
  surahNameArabicLong: string;
  surahNameTranslation: string;
  revelationPlace: 'Mecca' | 'Madina';
  totalAyah: number;
  surahNo: number;
  english: string[];
  arabic1: string[]; // Uthmani
  arabic2: string[]; // Simple
  bengali?: string[];
  urdu?: string[];
}

/**
 * Quran Ingestion Service
 * Fetches data from external API, validates, and stores in database.
 * Idempotent - safe to run multiple times.
 */
@Injectable()
export class QuranIngestionService {
  private readonly logger = new Logger(QuranIngestionService.name);
  private readonly EXTERNAL_API_BASE = 'https://quranapi.pages.dev/api';
  private readonly EXPECTED_SURAH_COUNT = 114;

  constructor(
    @InjectRepository(Surah)
    private surahRepository: Repository<Surah>,
    @InjectRepository(Ayah)
    private ayahRepository: Repository<Ayah>,
    @InjectRepository(Translation)
    private translationRepository: Repository<Translation>,
  ) {}

  /**
   * Main ingestion method
   * Orchestrates the entire ingestion process
   */
  async ingestQuranData(): Promise<{
    success: boolean;
    surahsProcessed: number;
    ayahsProcessed: number;
    translationsProcessed: number;
    errors: string[];
  }> {
    const errors: string[] = [];
    let surahsProcessed = 0;
    let ayahsProcessed = 0;
    let translationsProcessed = 0;

    try {
      this.logger.log('Starting Quran data ingestion...');

      // Step 1: Fetch surah list
      this.logger.log('Fetching surah list...');
      const surahList = await this.fetchSurahList();
      this.logger.log(`Fetched ${surahList.length} surahs from API`);

      // Step 2: Validate surah count
      if (surahList.length !== this.EXPECTED_SURAH_COUNT) {
        const error = `Expected ${this.EXPECTED_SURAH_COUNT} surahs, got ${surahList.length}`;
        this.logger.error(error);
        errors.push(error);
        throw new Error(error);
      }

      // Step 3: Process each surah
      for (let index = 0; index < surahList.length; index++) {
        const surahItem = surahList[index];
        const surahNumber = index + 1; // API uses 1-based indexing

        try {
          this.logger.log(
            `Processing Surah ${surahNumber}: ${surahItem.surahName} (${surahItem.totalAyah} ayahs)...`,
          );

          // Fetch full surah data using surah number
          const surahData = await this.fetchSurahData(surahNumber);
          if (!surahData) {
            errors.push(`Failed to fetch data for Surah ${surahNumber}`);
            continue;
          }

          // Upsert surah (use surahNumber from API response or index)
          const surah = await this.upsertSurah(surahData, surahNumber);
          surahsProcessed++;

          // Process ayahs
          const { ayahsCount, translationsCount } = await this.processAyahs(
            surah,
            surahData,
          );
          ayahsProcessed += ayahsCount;
          translationsProcessed += translationsCount;

          this.logger.log(
            `✓ Processed Surah ${surah.id}: ${ayahsCount} ayahs, ${translationsCount} translations`,
          );

          // Add delay between requests to avoid rate limiting (100ms)
          if (index < surahList.length - 1) {
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
        } catch (error) {
          const errorMsg = `Error processing Surah ${surahItem.surahName}: ${error.message}`;
          this.logger.error(errorMsg);
          errors.push(errorMsg);
        }
      }

      // Step 4: Verify integrity
      const verification = await this.verifyIngestion();
      if (!verification.valid) {
        errors.push(...verification.errors);
      }

      this.logger.log('Ingestion completed successfully');
      return {
        success: errors.length === 0,
        surahsProcessed,
        ayahsProcessed,
        translationsProcessed,
        errors,
      };
    } catch (error) {
      this.logger.error(`Ingestion failed: ${error.message}`, error.stack);
      return {
        success: false,
        surahsProcessed,
        ayahsProcessed,
        translationsProcessed,
        errors: [...errors, error.message],
      };
    }
  }

  /**
   * Fetch surah list from external API
   */
  private async fetchSurahList(): Promise<SurahListItem[]> {
    const response = await fetch(`${this.EXTERNAL_API_BASE}/surah.json`);
    if (!response.ok) {
      throw new Error(`Failed to fetch surah list: ${response.statusText}`);
    }
    return response.json();
  }

  /**
   * Fetch full surah data from external API
   * API endpoint: /api/{surahNumber}.json where surahNumber is 1-114
   */
  private async fetchSurahData(surahNumber: number): Promise<SurahResponse | null> {
    try {
      const response = await fetch(`${this.EXTERNAL_API_BASE}/${surahNumber}.json`);
      if (!response.ok) {
        this.logger.warn(`Failed to fetch surah ${surahNumber}: ${response.statusText}`);
        return null;
      }
      return response.json();
    } catch (error) {
      this.logger.error(`Error fetching surah ${surahNumber}: ${error.message}`);
      return null;
    }
  }

  /**
   * Upsert surah (insert or update)
   */
  private async upsertSurah(surahData: SurahResponse, surahNumber: number): Promise<Surah> {
    const surah = this.surahRepository.create({
      id: surahData.surahNo || surahNumber,
      name_ar: surahData.surahNameArabic,
      name_en: surahData.surahNameTranslation,
      name_ar_long: surahData.surahNameArabicLong,
      revelation_type: surahData.revelationPlace,
      ayah_count: surahData.totalAyah,
      transliteration: surahData.surahNameTranslation,
    });

    return this.surahRepository.save(surah);
  }

  /**
   * Process ayahs for a surah
   */
  private async processAyahs(
    surah: Surah,
    surahData: SurahResponse,
  ): Promise<{ ayahsCount: number; translationsCount: number }> {
    let ayahsCount = 0;
    let translationsCount = 0;

    // Validate ayah count and array consistency
    const expectedAyahCount = surahData.totalAyah;
    const arabic1Count = surahData.arabic1?.length || 0;
    const arabic2Count = surahData.arabic2?.length || 0;
    const englishCount = surahData.english?.length || 0;
    const actualAyahCount = Math.max(
      arabic1Count,
      arabic2Count,
      englishCount,
      surahData.bengali?.length || 0,
      surahData.urdu?.length || 0,
    );

    if (actualAyahCount !== expectedAyahCount) {
      this.logger.warn(
        `Surah ${surah.id}: Expected ${expectedAyahCount} ayahs, got ${actualAyahCount}`,
      );
    }

    // Validate that we have at least Arabic text
    if (arabic1Count === 0) {
      throw new Error(`Surah ${surah.id}: No Arabic text found`);
    }

    // Process each ayah
    for (let i = 0; i < actualAyahCount; i++) {
      const ayahNumber = i + 1;

      // Upsert ayah
      const existingAyah = await this.ayahRepository.findOne({
        where: { surah_id: surah.id, ayah_number: ayahNumber },
      });

      let ayah: Ayah;
      if (existingAyah) {
        // Update only if needed (preserve existing data)
        existingAyah.arabic_text = surahData.arabic1?.[i] || existingAyah.arabic_text;
        existingAyah.arabic_text_simple =
          surahData.arabic2?.[i] || existingAyah.arabic_text_simple;
        ayah = await this.ayahRepository.save(existingAyah);
      } else {
        ayah = this.ayahRepository.create({
          surah_id: surah.id,
          ayah_number: ayahNumber,
          arabic_text: surahData.arabic1?.[i] || '',
          arabic_text_simple: surahData.arabic2?.[i] || '',
        });
        ayah = await this.ayahRepository.save(ayah);
      }
      ayahsCount++;

      // Process translations
      if (surahData.english?.[i]) {
        await this.upsertTranslation(ayah.id, 'en', surahData.english[i]);
        translationsCount++;
      }
      if (surahData.bengali?.[i]) {
        await this.upsertTranslation(ayah.id, 'bn', surahData.bengali[i]);
        translationsCount++;
      }
      if (surahData.urdu?.[i]) {
        await this.upsertTranslation(ayah.id, 'ur', surahData.urdu[i]);
        translationsCount++;
      }
    }

    return { ayahsCount, translationsCount };
  }

  /**
   * Upsert translation
   */
  private async upsertTranslation(
    ayahId: string,
    languageCode: string,
    text: string,
  ): Promise<Translation> {
    // Check if translation already exists
    const existing = await this.translationRepository.findOne({
      where: { ayah_id: ayahId, language_code: languageCode },
    });

    if (existing) {
      // Update only if text changed
      if (existing.text !== text) {
        existing.text = text;
        return this.translationRepository.save(existing);
      }
      return existing;
    }

      // Create new translation
      const translation = this.translationRepository.create({
        ayah_id: ayahId,
        language_code: languageCode,
        text: text.trim(), // Clean whitespace
        source: 'quranapi.pages.dev',
        attribution: {
          source: 'quranapi.pages.dev',
          url: 'https://quranapi.pages.dev',
        },
      });

      return this.translationRepository.save(translation);
    }

  /**
   * Verify ingestion integrity
   */
  private async verifyIngestion(): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    // Check surah count
    const surahCount = await this.surahRepository.count();
    if (surahCount !== this.EXPECTED_SURAH_COUNT) {
      errors.push(
        `Expected ${this.EXPECTED_SURAH_COUNT} surahs, found ${surahCount}`,
      );
    }

    // Check each surah has correct ayah count
    const surahs = await this.surahRepository.find();
    for (const surah of surahs) {
      const ayahCount = await this.ayahRepository.count({
        where: { surah_id: surah.id },
      });
      if (ayahCount !== surah.ayah_count) {
        errors.push(
          `Surah ${surah.id}: Expected ${surah.ayah_count} ayahs, found ${ayahCount}`,
        );
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}


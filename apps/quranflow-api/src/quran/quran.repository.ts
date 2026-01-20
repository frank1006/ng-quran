import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Surah } from './entities/surah.entity';
import { Ayah } from './entities/ayah.entity';
import { Translation } from './entities/translation.entity';

/**
 * Quran Repository
 * Handles all database operations for Quran data.
 * Read-only operations for frontend consumption.
 */
@Injectable()
export class QuranRepository {
  constructor(
    @InjectRepository(Surah)
    private surahRepository: Repository<Surah>,
    @InjectRepository(Ayah)
    private ayahRepository: Repository<Ayah>,
    @InjectRepository(Translation)
    private translationRepository: Repository<Translation>,
  ) {}

  /**
   * Get all surahs
   */
  async findAllSurahs(): Promise<Surah[]> {
    return this.surahRepository.find({
      order: { id: 'ASC' },
    });
  }

  /**
   * Get a single surah by ID
   */
  async findSurahById(id: number): Promise<Surah | null> {
    return this.surahRepository.findOne({
      where: { id },
      relations: ['ayahs'],
    });
  }

  /**
   * Get all ayahs for a specific surah
   */
  async findAyahsBySurahId(surahId: number): Promise<Ayah[]> {
    return this.ayahRepository.find({
      where: { surah_id: surahId },
      order: { ayah_number: 'ASC' },
      relations: ['translations'],
    });
  }

  /**
   * Get a single ayah by ID
   */
  async findAyahById(id: string): Promise<Ayah | null> {
    return this.ayahRepository.findOne({
      where: { id },
      relations: ['surah', 'translations'],
    });
  }

  /**
   * Get a single ayah by surah_id and ayah_number
   */
  async findAyahBySurahAndNumber(
    surahId: number,
    ayahNumber: number,
  ): Promise<Ayah | null> {
    return this.ayahRepository.findOne({
      where: { surah_id: surahId, ayah_number: ayahNumber },
      relations: ['surah', 'translations'],
    });
  }

  /**
   * Get translations for an ayah, optionally filtered by language
   */
  async findTranslationsByAyahId(
    ayahId: string,
    languageCode?: string,
  ): Promise<Translation[]> {
    const where: any = { ayah_id: ayahId };
    if (languageCode) {
      where.language_code = languageCode;
    }
    return this.translationRepository.find({
      where,
      order: { language_code: 'ASC', created_at: 'ASC' },
    });
  }

  /**
   * Get translations for multiple ayahs
   */
  async findTranslationsByAyahIds(
    ayahIds: string[],
    languageCode?: string,
  ): Promise<Translation[]> {
    const where: any = { ayah_id: In(ayahIds) };
    if (languageCode) {
      where.language_code = languageCode;
    }
    return this.translationRepository.find({
      where,
      order: { ayah_id: 'ASC', language_code: 'ASC' },
    });
  }

  /**
   * Count total surahs (should be 114)
   */
  async countSurahs(): Promise<number> {
    return this.surahRepository.count();
  }

  /**
   * Count total ayahs for a surah
   */
  async countAyahsBySurahId(surahId: number): Promise<number> {
    return this.ayahRepository.count({
      where: { surah_id: surahId },
    });
  }
}


import {
  Controller,
  Get,
  Param,
  Query,
  ParseIntPipe,
  ParseUUIDPipe,
} from '@nestjs/common';
import { QuranService } from './quran.service';

/**
 * Quran Controller
 * Read-only API endpoints for Quran data.
 * Designed to be compatible with existing frontend expectations.
 */
@Controller('quran')
export class QuranController {
  constructor(private readonly quranService: QuranService) {}

  /**
   * GET /quran/surahs
   * Get list of all surahs (chapters)
   */
  @Get('surahs')
  async getSurahs() {
    return this.quranService.getAllSurahs();
  }

  /**
   * GET /quran/surah/:id
   * Get a specific surah by ID with all ayahs
   */
  @Get('surah/:id')
  async getSurahById(
    @Param('id', ParseIntPipe) id: number,
    @Query('language') language?: string,
  ) {
    return this.quranService.getSurahById(id, language);
  }

  /**
   * GET /quran/surah/:id/ayahs
   * Get all ayahs for a specific surah
   */
  @Get('surah/:id/ayahs')
  async getAyahsBySurahId(
    @Param('id', ParseIntPipe) surahId: number,
    @Query('language') language?: string,
  ) {
    return this.quranService.getAyahsBySurahId(surahId, language);
  }

  /**
   * GET /quran/ayah/:id
   * Get a specific ayah by UUID
   */
  @Get('ayah/:id')
  async getAyahById(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('language') language?: string,
  ) {
    return this.quranService.getAyahById(id, language);
  }

  /**
   * GET /quran/ayah/:id/translations
   * Get translations for a specific ayah
   * Query param: ?lang=en (optional, filters by language)
   */
  @Get('ayah/:id/translations')
  async getTranslationsByAyahId(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('lang') lang?: string,
  ) {
    return this.quranService.getTranslationsByAyahId(id, lang);
  }
}


import {
  Controller,
  Post,
  HttpCode,
  HttpStatus,
  UseGuards,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { QuranIngestionService } from './quran.ingestion.service';

/**
 * Simple guard to protect ingestion endpoints (dev-only for now)
 * In production, implement proper authentication (JWT, API keys, etc.)
 */
class DevOnlyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    if (process.env.NODE_ENV === 'production') {
      throw new ForbiddenException(
        'Ingestion endpoints are only available in development mode',
      );
    }
    return true;
  }
}

/**
 * Ingestion Controller
 * Admin endpoints for data ingestion.
 * Protected - should only be accessible in development or with proper auth.
 */
@Controller('admin/ingest')
export class IngestionController {
  constructor(private readonly ingestionService: QuranIngestionService) {}

  /**
   * POST /admin/ingest/quran
   * Trigger Quran data ingestion manually
   * Protected: dev-only (implement proper auth for production)
   */
  @Post('quran')
  @HttpCode(HttpStatus.OK)
  @UseGuards(DevOnlyGuard)
  async ingestQuran() {
    const result = await this.ingestionService.ingestQuranData();
    return {
      message: result.success
        ? 'Quran data ingestion completed successfully'
        : 'Quran data ingestion completed with errors',
      ...result,
    };
  }
}


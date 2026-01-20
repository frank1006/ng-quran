import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IngestionController } from './ingestion.controller';
import { QuranIngestionService } from './quran.ingestion.service';
import { Surah } from '../quran/entities/surah.entity';
import { Ayah } from '../quran/entities/ayah.entity';
import { Translation } from '../quran/entities/translation.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Surah, Ayah, Translation])],
  controllers: [IngestionController],
  providers: [QuranIngestionService],
  exports: [QuranIngestionService],
})
export class IngestionModule {}


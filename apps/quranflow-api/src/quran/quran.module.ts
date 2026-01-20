import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QuranController } from './quran.controller';
import { QuranService } from './quran.service';
import { QuranRepository } from './quran.repository';
import { Surah } from './entities/surah.entity';
import { Ayah } from './entities/ayah.entity';
import { Translation } from './entities/translation.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Surah, Ayah, Translation])],
  controllers: [QuranController],
  providers: [QuranService, QuranRepository],
  exports: [QuranService, QuranRepository],
})
export class QuranModule {}


import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from '../database/database.module';
import { QuranModule } from '../quran/quran.module';
import { IngestionModule } from '../ingestion/ingestion.module';

@Module({
  imports: [DatabaseModule, QuranModule, IngestionModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}


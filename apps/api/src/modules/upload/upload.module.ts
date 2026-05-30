import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { memoryStorage } from 'multer';
import { UploadController } from './upload.controller';
import { UploadService } from './upload.service';
import { OcrModule } from '../ocr/ocr.module';
import { AiParserModule } from '../ai-parser/ai-parser.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { ZohoModule } from '../zoho/zoho.module';
import { WarehousesModule } from '../warehouses/warehouses.module';

@Module({
  imports: [
    OcrModule,
    AiParserModule,
    TransactionsModule,
    ZohoModule,
    WarehousesModule,
    MulterModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        storage: memoryStorage(),
        limits: { fileSize: (Number(cfg.get('MAX_UPLOAD_SIZE_MB') ?? 15)) * 1024 * 1024 },
      }),
    }),
  ],
  controllers: [UploadController],
  providers: [UploadService],
})
export class UploadModule {}

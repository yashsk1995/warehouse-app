import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { STORAGE_SERVICE } from './storage.interface';
import { LocalStorageService } from './local-storage.service';
import { S3StorageService } from './s3-storage.service';

/**
 * StorageModule wires the StorageService strategy:
 * - ENV_DEV=true  -> LocalStorageService (writes to /uploads, exposes via static route)
 * - ENV_DEV=false -> S3StorageService    (uploads to AWS S3)
 *
 * Code depends on the STORAGE_SERVICE token, never on a concrete class.
 */
@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    LocalStorageService,
    S3StorageService,
    {
      provide: STORAGE_SERVICE,
      inject: [ConfigService, LocalStorageService, S3StorageService],
      useFactory: (cfg: ConfigService, local: LocalStorageService, s3: S3StorageService) => {
        const isDev = String(cfg.get('ENV_DEV') ?? 'true').toLowerCase() === 'true';
        return isDev ? local : s3;
      },
    },
  ],
  exports: [STORAGE_SERVICE],
})
export class StorageModule {}

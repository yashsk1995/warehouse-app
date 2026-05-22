import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUE_NAMES } from './queue.constants';
import { QueuesService } from './queues.service';
import { ZohoSyncProcessor } from './processors/zoho-sync.processor';
import { ImageOptimizeProcessor } from './processors/image-optimize.processor';
import { ZohoCatalogSyncProcessor } from './processors/zoho-catalog-sync.processor';
import { ZohoModule } from '../zoho/zoho.module';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: QUEUE_NAMES.ZOHO_SYNC },
      { name: QUEUE_NAMES.IMAGE_OPTIMIZE },
      { name: QUEUE_NAMES.ZOHO_CATALOG_SYNC },
    ),
    ZohoModule,
  ],
  providers: [QueuesService, ZohoSyncProcessor, ImageOptimizeProcessor, ZohoCatalogSyncProcessor],
  exports: [QueuesService, BullModule],
})
export class QueuesModule {}

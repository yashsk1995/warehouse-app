import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUE_NAMES } from './queue.constants';
import { QueuesService } from './queues.service';
import { ZohoSyncProcessor } from './processors/zoho-sync.processor';
import { ImageOptimizeProcessor } from './processors/image-optimize.processor';
import { ZohoModule } from '../zoho/zoho.module';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: QUEUE_NAMES.ZOHO_SYNC },
      { name: QUEUE_NAMES.IMAGE_OPTIMIZE },
    ),
    ZohoModule,
  ],
  providers: [QueuesService, ZohoSyncProcessor, ImageOptimizeProcessor],
  exports: [QueuesService, BullModule],
})
export class QueuesModule {}

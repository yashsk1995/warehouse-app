import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { JOB_NAMES, QUEUE_NAMES } from '../queue.constants';
import { ZohoInventoryService } from '../../zoho/zoho-inventory.service';

@Processor(QUEUE_NAMES.ZOHO_SYNC)
export class ZohoSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(ZohoSyncProcessor.name);

  constructor(private readonly zoho: ZohoInventoryService) {
    super();
  }

  async process(job: Job<{ transactionId: string }>): Promise<void> {
    if (job.name !== JOB_NAMES.ZOHO_SYNC_TRANSACTION) return;
    this.logger.log(`Zoho sync attempt ${job.attemptsMade + 1} for ${job.data.transactionId}`);
    await this.zoho.syncTransaction(job.data.transactionId);
  }
}

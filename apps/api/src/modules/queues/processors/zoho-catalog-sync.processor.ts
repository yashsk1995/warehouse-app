import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { QUEUE_NAMES } from '../queue.constants';
import { ZohoInventoryService } from '../../zoho/zoho-inventory.service';

@Processor(QUEUE_NAMES.ZOHO_CATALOG_SYNC)
export class ZohoCatalogSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(ZohoCatalogSyncProcessor.name);

  constructor(private readonly zoho: ZohoInventoryService) {
    super();
  }

  async process(_job: Job): Promise<void> {
    this.logger.log('Catalog cron fired — pulling Zoho items...');
    const result = await this.zoho.syncCatalog();
    this.logger.log(
      `Catalog cron done: ${result.total} items, +${result.created} created, ~${result.updated} updated, ${result.skipped} skipped`,
    );
  }
}

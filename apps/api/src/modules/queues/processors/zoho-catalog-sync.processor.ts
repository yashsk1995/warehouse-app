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
    this.logger.log('Catalog cron fired — syncing warehouses + items...');
    // Warehouses first — items reference them in the upload flow.
    const wh = await this.zoho.syncWarehouses();
    const items = await this.zoho.syncCatalog();
    this.logger.log(
      `Catalog cron done — warehouses: ${wh.total} (+${wh.created}, ~${wh.updated}); items: ${items.total} (+${items.created}, ~${items.updated})`,
    );
  }
}

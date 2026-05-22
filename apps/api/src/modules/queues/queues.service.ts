import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { JOB_NAMES, QUEUE_NAMES, ZOHO_CATALOG_CRON } from './queue.constants';

@Injectable()
export class QueuesService implements OnApplicationBootstrap {
  private readonly logger = new Logger(QueuesService.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.ZOHO_SYNC) private readonly zohoQueue: Queue,
    @InjectQueue(QUEUE_NAMES.IMAGE_OPTIMIZE) private readonly imageQueue: Queue,
    @InjectQueue(QUEUE_NAMES.ZOHO_CATALOG_SYNC) private readonly catalogQueue: Queue,
  ) {}

  /**
   * Registers the catalog-sync cron once on application boot.
   * BullMQ uses a stable jobId so re-runs (server restarts) don't double-schedule.
   */
  async onApplicationBootstrap(): Promise<void> {
    // Clean up any lingering repeatable jobs from older schedules first.
    const existing = await this.catalogQueue.getRepeatableJobs();
    for (const rep of existing) {
      await this.catalogQueue.removeRepeatableByKey(rep.key);
    }

    await this.catalogQueue.add(
      JOB_NAMES.ZOHO_CATALOG_SYNC,
      {},
      {
        repeat: { pattern: ZOHO_CATALOG_CRON },
        jobId: 'cron:zoho-catalog-sync', // stable id so duplicates are no-ops
        removeOnComplete: { age: 7 * 24 * 3600, count: 100 },
        removeOnFail: { age: 30 * 24 * 3600 },
      },
    );

    this.logger.log(`Zoho catalog cron registered: pattern "${ZOHO_CATALOG_CRON}" (every 30 min)`);
  }

  enqueueZohoSync(transactionId: string) {
    return this.zohoQueue.add(
      JOB_NAMES.ZOHO_SYNC_TRANSACTION,
      { transactionId },
      {
        attempts: 5,
        backoff: { type: 'exponential', delay: 30_000 },
        removeOnComplete: { age: 24 * 3600, count: 1000 },
        removeOnFail: { age: 7 * 24 * 3600 },
      },
    );
  }

  enqueueImageOptimize(imageKey: string) {
    return this.imageQueue.add(
      JOB_NAMES.IMAGE_OPTIMIZE,
      { imageKey },
      { attempts: 3, removeOnComplete: true },
    );
  }

  /** Trigger an immediate catalog sync (used by the admin /zoho/sync-catalog endpoint flow). */
  enqueueCatalogSyncNow() {
    return this.catalogQueue.add(JOB_NAMES.ZOHO_CATALOG_SYNC, {}, { removeOnComplete: true });
  }
}

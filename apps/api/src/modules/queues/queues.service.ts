import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { JOB_NAMES, QUEUE_NAMES } from './queue.constants';

@Injectable()
export class QueuesService {
  constructor(
    @InjectQueue(QUEUE_NAMES.ZOHO_SYNC) private readonly zohoQueue: Queue,
    @InjectQueue(QUEUE_NAMES.IMAGE_OPTIMIZE) private readonly imageQueue: Queue,
  ) {}

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
}

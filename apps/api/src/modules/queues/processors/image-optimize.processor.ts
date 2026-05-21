import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { QUEUE_NAMES } from '../queue.constants';

@Processor(QUEUE_NAMES.IMAGE_OPTIMIZE)
export class ImageOptimizeProcessor extends WorkerHost {
  private readonly logger = new Logger(ImageOptimizeProcessor.name);

  async process(job: Job<{ imageKey: string }>): Promise<void> {
    // Hook for follow-up image work (thumbnails, content moderation, deskew).
    this.logger.debug(`Image optimize requested for ${job.data.imageKey}`);
  }
}

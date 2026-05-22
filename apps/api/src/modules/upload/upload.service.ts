import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
import sharp from 'sharp';
import { ActionType } from '@prisma/client';
import { STORAGE_SERVICE, StorageService } from '../storage/storage.interface';
import { OcrService } from '../ocr/ocr.service';
import { AiParserService } from '../ai-parser/ai-parser.service';
import { TransactionsService } from '../transactions/transactions.service';

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);

  constructor(
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
    private readonly ocr: OcrService,
    private readonly parser: AiParserService,
    private readonly transactions: TransactionsService,
  ) {}

  async uploadAndProcess(params: {
    userId: string;
    actionType: ActionType;
    file: Express.Multer.File;
  }) {
    if (!params.file?.buffer?.length) {
      throw new BadRequestException('No image uploaded');
    }
    if (!params.file.mimetype.startsWith('image/')) {
      throw new BadRequestException('Only image uploads are accepted');
    }

    // Compress + normalize to JPEG so OCR + storage are predictable.
    const optimized = await sharp(params.file.buffer)
      .rotate()
      .resize({ width: 2000, withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();

    const stored = await this.storage.upload({
      buffer: optimized,
      originalName: params.file.originalname || 'sheet.jpg',
      mimeType: 'image/jpeg',
    });

    const ocrResult = await this.ocr.extractText(optimized, 'image/jpeg');
    this.logger.log(
      `OCR (${ocrResult.text.length} chars) ----\n${ocrResult.text}\n----`,
    );

    const parsed = await this.parser.parse(ocrResult.text);
    this.logger.log(
      `Parser produced ${parsed.items.length} items: ${JSON.stringify(parsed.items)}`,
    );

    if (parsed.items.length === 0) {
      // Don't create an empty PENDING txn — the admin would have nothing to approve.
      // Surface a clear message to the user so they can retake the photo.
      throw new UnprocessableEntityException({
        message:
          'No SKU + quantity lines detected. Make sure the sheet is well lit, the handwriting is clear, and each line has a numeric SKU followed by a pcs count.',
        rawOcrText: ocrResult.text,
      });
    }

    return this.transactions.createPending({
      userId: params.userId,
      actionType: params.actionType,
      imageUrl: stored.url,
      imageKey: stored.key,
      rawOcrText: ocrResult.text,
      parsedItems: parsed.items,
    });
  }
}

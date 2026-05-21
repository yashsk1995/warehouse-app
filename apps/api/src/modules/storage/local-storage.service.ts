import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { v4 as uuid } from 'uuid';
import type { StorageService, StoredFile } from './storage.interface';

@Injectable()
export class LocalStorageService implements StorageService {
  private readonly logger = new Logger(LocalStorageService.name);
  private readonly dir: string;
  private readonly baseUrl: string;

  constructor(cfg: ConfigService) {
    this.dir = path.resolve(cfg.get<string>('LOCAL_UPLOAD_DIR') ?? './uploads');
    this.baseUrl = `${cfg.get<string>('API_BASE_URL') ?? 'http://localhost:3000'}/uploads`;
  }

  async upload(file: { buffer: Buffer; originalName: string; mimeType: string }): Promise<StoredFile> {
    await fs.mkdir(this.dir, { recursive: true });
    const ext = path.extname(file.originalName) || this.extFromMime(file.mimeType);
    const key = `${Date.now()}-${uuid()}${ext}`;
    const filePath = path.join(this.dir, key);
    await fs.writeFile(filePath, file.buffer);
    this.logger.debug(`Saved upload to ${filePath}`);
    return {
      url: `${this.baseUrl}/${key}`,
      key,
      size: file.buffer.length,
      contentType: file.mimeType,
    };
  }

  async delete(key: string): Promise<void> {
    const filePath = path.join(this.dir, key);
    await fs.unlink(filePath).catch(() => undefined);
  }

  private extFromMime(mime: string): string {
    if (mime.includes('jpeg')) return '.jpg';
    if (mime.includes('png')) return '.png';
    if (mime.includes('webp')) return '.webp';
    return '.bin';
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GetObjectCommand, PutObjectCommand, S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuid } from 'uuid';
import * as path from 'node:path';
import type { StorageService, StoredFile } from './storage.interface';

@Injectable()
export class S3StorageService implements StorageService {
  private readonly logger = new Logger(S3StorageService.name);
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly region: string;

  constructor(cfg: ConfigService) {
    this.bucket = cfg.get<string>('AWS_S3_BUCKET') ?? '';
    this.region = cfg.get<string>('AWS_REGION') ?? 'ap-south-1';
    this.client = new S3Client({
      region: this.region,
      credentials: {
        accessKeyId: cfg.get<string>('AWS_ACCESS_KEY_ID') ?? '',
        secretAccessKey: cfg.get<string>('AWS_SECRET_ACCESS_KEY') ?? '',
      },
    });
  }

  async upload(file: { buffer: Buffer; originalName: string; mimeType: string }): Promise<StoredFile> {
    if (!this.bucket) throw new Error('AWS_S3_BUCKET is not configured');
    const ext = path.extname(file.originalName) || '.bin';
    const key = `uploads/${new Date().toISOString().slice(0, 10)}/${uuid()}${ext}`;
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimeType,
      }),
    );
    this.logger.debug(`Uploaded to s3://${this.bucket}/${key}`);
    return {
      url: `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`,
      key,
      size: file.buffer.length,
      contentType: file.mimeType,
    };
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async getSignedUrl(key: string, expiresSec = 3600): Promise<string> {
    const cmd = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    return getSignedUrl(this.client, cmd, { expiresIn: expiresSec });
  }
}

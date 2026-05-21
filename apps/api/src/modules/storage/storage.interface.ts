export interface StoredFile {
  /** Publicly accessible URL (or local path served via /uploads). */
  url: string;
  /** Provider-specific key (filename for local, S3 key for s3). */
  key: string;
  size: number;
  contentType: string;
}

export interface StorageService {
  upload(file: { buffer: Buffer; originalName: string; mimeType: string }): Promise<StoredFile>;
  delete(key: string): Promise<void>;
  getSignedUrl?(key: string, expiresSec?: number): Promise<string>;
}

export const STORAGE_SERVICE = Symbol('STORAGE_SERVICE');

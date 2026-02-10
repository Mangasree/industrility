import { S3Provider } from '../providers/storage/s3Provider';

export class StorageService {
  private provider: S3Provider;
  private bucketName: string;

  constructor(provider: S3Provider, bucketName: string) {
    this.provider = provider;
    this.bucketName = bucketName;
  }

  async uploadReferenceImage(key: string, body: Buffer): Promise<void> {
    await this.provider.putObject({
      bucket: this.bucketName,
      key,
      body,
      contentType: 'image/png'
    });
  }

  async getSignedReferenceUrl(key: string, expiresInSeconds = 900): Promise<string> {
    return this.provider.getPresignedUrl(this.bucketName, key, expiresInSeconds);
  }
}

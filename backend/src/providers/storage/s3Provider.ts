import { GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export type PutObjectInput = {
  bucket: string;
  key: string;
  body: Buffer;
  contentType: string;
};

export class S3Provider {
  private client: S3Client;

  constructor(region: string) {
    this.client = new S3Client({ region });
  }

  async putObject(input: PutObjectInput): Promise<void> {
    const command = new PutObjectCommand({
      Bucket: input.bucket,
      Key: input.key,
      Body: input.body,
      ContentType: input.contentType
    });
    await this.client.send(command);
  }

  async getPresignedUrl(bucket: string, key: string, expiresInSeconds: number): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key
    });
    return getSignedUrl(this.client, command, { expiresIn: expiresInSeconds });
  }

  async listObjectKeys(bucket: string, prefix: string): Promise<string[]> {
    const keys: string[] = [];
    let continuationToken: string | undefined;

    do {
      const response = await this.client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken
        })
      );

      for (const obj of response.Contents ?? []) {
        if (obj.Key) {
          keys.push(obj.Key);
        }
      }
      continuationToken = response.NextContinuationToken;
    } while (continuationToken);

    return keys;
  }

  async getObjectBuffer(bucket: string, key: string): Promise<Buffer> {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: key
      })
    );

    if (!response.Body) {
      throw new Error(`Empty S3 object body for s3://${bucket}/${key}`);
    }

    const body = response.Body as unknown as { transformToByteArray?: () => Promise<Uint8Array> };
    if (typeof body.transformToByteArray !== 'function') {
      throw new Error(`Unsupported S3 body stream type for s3://${bucket}/${key}`);
    }

    const bytes = await body.transformToByteArray();
    return Buffer.from(bytes);
  }
}

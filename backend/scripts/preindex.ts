import fs from 'fs/promises';
import path from 'path';
import { validatePreindexEnv } from '../src/config/env';
import { sampleModels, sampleViews, getSampleImagePath } from '../src/config/sampleData';
import { S3Provider } from '../src/providers/storage/s3Provider';
import { DynamoDbProvider } from '../src/providers/metadata/dynamodbProvider';
import { PineconeProvider } from '../src/providers/vector/pineconeProvider';
import { ClipXenovaProvider } from '../src/providers/embedding/clipXenovaProvider';
import { StorageService } from '../src/services/storageService';
import { MetadataService } from '../src/services/metadataService';
import { EmbeddingService } from '../src/services/embeddingService';
import { PineconeService } from '../src/services/pineconeService';
import { generatePlaceholders } from './gen_placeholders';
import { logger } from '../src/utils/logger';

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function ensureSampleData(sampleRoot: string): Promise<void> {
  for (const model of sampleModels) {
    for (const view of sampleViews) {
      const filePath = getSampleImagePath(sampleRoot, model, view);
      if (!(await fileExists(filePath))) {
        logger.warn(`Missing sample image detected, regenerating placeholders in ${sampleRoot}`);
        await generatePlaceholders(sampleRoot);
        return;
      }
    }
  }
}

async function run(): Promise<void> {
  const { awsRegion, s3BucketName, dynamodbTableName, pineconeApiKey, pineconeIndex, pineconeNamespace } =
    validatePreindexEnv();
  const sampleRoot = path.resolve(__dirname, '..', 'sample_data');

  await ensureSampleData(sampleRoot);

  const s3Provider = new S3Provider(awsRegion);
  const storageService = new StorageService(s3Provider, s3BucketName);
  const dynamoProvider = new DynamoDbProvider(awsRegion);
  const metadataService = new MetadataService(dynamoProvider, dynamodbTableName);
  const pineconeProvider = new PineconeProvider(pineconeApiKey);
  const pineconeService = new PineconeService(pineconeProvider, pineconeIndex, pineconeNamespace);
  const clipProvider = new ClipXenovaProvider();
  const embeddingService = new EmbeddingService(clipProvider);

  for (const model of sampleModels) {
    for (const view of sampleViews) {
      const localPath = getSampleImagePath(sampleRoot, model, view);
      const key = `reference/${model}/${view}.png`;
      const label = `${model} — ${view} view`;
      const id = `${model}-${view}`;

      logger.info(`Upload start: ${localPath} -> ${key}`);
      const body = await fs.readFile(localPath);
      await storageService.uploadReferenceImage(key, body);
      logger.info(`Upload done: ${key}`);

      logger.info(`DynamoDB write: ${id}`);
      await metadataService.writeReferenceMetadata({
        id,
        model,
        view,
        s3Key: key,
        label
      });
      logger.info(`DynamoDB wrote: ${id}`);

      logger.info(`Embedding start: ${id}`);
      const embedding = await embeddingService.embedImage(body);
      logger.info(`Embedding done: ${id} (${embedding.length} dims)`);

      logger.info(`Pinecone upsert: ${id}`);
      await pineconeService.upsertReferenceVector(id, embedding, {
        model,
        view,
        s3Key: key
      });
      logger.info(`Pinecone upserted: ${id}`);
    }
  }

  logger.info('Preindex complete');
}

run().catch((error) => {
  logger.error(`Preindex failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});

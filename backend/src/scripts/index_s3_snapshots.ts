import path from 'path';
import { validatePreindexEnv } from '../config/env';
import { S3Provider } from '../providers/storage/s3Provider';
import { DynamoDbProvider } from '../providers/metadata/dynamodbProvider';
import { PineconeProvider } from '../providers/vector/pineconeProvider';
import { ClipXenovaProvider } from '../providers/embedding/clipXenovaProvider';
import { MetadataService } from '../services/metadataService';
import { EmbeddingService } from '../services/embeddingService';
import { PineconeService } from '../services/pineconeService';
import { logger } from '../utils/logger';

const DEFAULT_PREFIX = process.env.S3_PREFIX || 'reference_snapshots/';
const VALID_VIEWS = new Set([
  'top',
  'bottom',
  'left',
  'right',
  'front',
  'back',
  'isometric'
]);

type CliOptions = {
  prefix: string;
  concurrency: number;
  dryRun: boolean;
};

type Summary = {
  keysScanned: number;
  indexed: number;
  errors: number;
  skipped: number;
};

function normalizePrefix(prefix: string): string {
  const clean = prefix.trim().replace(/^\/+/, '');
  if (!clean) {
    return '';
  }
  return clean.endsWith('/') ? clean : `${clean}/`;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    prefix: normalizePrefix(DEFAULT_PREFIX),
    concurrency: 2,
    dryRun: false
  };

  const nextValue = (index: number, flag: string): string => {
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for ${flag}`);
    }
    return value;
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--prefix':
        options.prefix = normalizePrefix(nextValue(i, arg));
        i += 1;
        break;
      case '--concurrency':
        options.concurrency = Number.parseInt(nextValue(i, arg), 10);
        i += 1;
        break;
      case '--dry_run':
        options.dryRun = true;
        break;
      default:
        if (arg.startsWith('--')) {
          throw new Error(`Unknown argument: ${arg}`);
        }
    }
  }

  if (!Number.isInteger(options.concurrency) || options.concurrency <= 0) {
    throw new Error('Invalid --concurrency value. Expected a positive integer.');
  }

  return options;
}

function parseSnapshotKey(prefix: string, key: string): { partId: string; view: string } | null {
  if (!key.startsWith(prefix)) {
    return null;
  }
  const relative = key.slice(prefix.length);
  const parsed = path.posix.parse(relative);
  const partId = parsed.dir;
  const view = parsed.name.toLowerCase();
  if (!partId || !VALID_VIEWS.has(view) || parsed.ext.toLowerCase() !== '.png') {
    return null;
  }
  return { partId, view };
}

async function runWorkerPool<T>(items: T[], concurrency: number, worker: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const idx = cursor;
      cursor += 1;
      if (idx >= items.length) {
        return;
      }
      await worker(items[idx]);
    }
  });
  await Promise.all(workers);
}

async function run(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const { awsRegion, s3BucketName, dynamodbTableName, pineconeApiKey, pineconeIndex, pineconeNamespace } =
    validatePreindexEnv();

  logger.info('[INDEX CONFIG]');
  logger.info(`- bucket: ${s3BucketName}`);
  logger.info(`- prefix: ${options.prefix}`);
  logger.info(`- region: ${awsRegion}`);
  logger.info(`- pinecone_index: ${pineconeIndex}`);
  logger.info(`- pinecone_namespace: ${pineconeNamespace}`);
  logger.info(`- concurrency: ${options.concurrency}`);
  logger.info(`- dry_run: ${options.dryRun}`);

  const summary: Summary = {
    keysScanned: 0,
    indexed: 0,
    errors: 0,
    skipped: 0
  };

  const s3Provider = new S3Provider(awsRegion);
  const metadataService = new MetadataService(new DynamoDbProvider(awsRegion), dynamodbTableName);
  const pineconeService = new PineconeService(new PineconeProvider(pineconeApiKey), pineconeIndex, pineconeNamespace);
  const embeddingService = new EmbeddingService(new ClipXenovaProvider());

  const keys = (await s3Provider.listObjectKeys(s3BucketName, options.prefix)).sort();
  const pngKeys = keys.filter((key) => key.toLowerCase().endsWith('.png'));

  if (pngKeys.length === 0) {
    logger.warn(`No PNG keys found under s3://${s3BucketName}/${options.prefix}`);
    return;
  }

  await runWorkerPool(pngKeys, options.concurrency, async (key) => {
    summary.keysScanned += 1;
    const parsed = parseSnapshotKey(options.prefix, key);
    if (!parsed) {
      summary.skipped += 1;
      logger.warn(`[SKIP] Key does not match expected format: ${key}`);
      return;
    }

    const id = `${parsed.partId}-${parsed.view}`;
    const label = `${parsed.partId} - ${parsed.view} view`;
    try {
      logger.info(`[INDEX] Downloading ${key}`);
      const imageBuffer = await s3Provider.getObjectBuffer(s3BucketName, key);
      const embedding = await embeddingService.embedImage(imageBuffer);

      if (!options.dryRun) {
        await metadataService.writeReferenceMetadata({
          id,
          model: parsed.partId,
          view: parsed.view,
          s3Key: key,
          label
        });
        await pineconeService.upsertReferenceVector(id, embedding, {
          model: parsed.partId,
          view: parsed.view,
          s3Key: key
        });
      }

      summary.indexed += 1;
      logger.info(`[INDEXED] ${id} (${embedding.length} dims)`);
    } catch (error) {
      summary.errors += 1;
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`[ERROR] ${key}: ${message}`);
    }
  });

  logger.info('[INDEX SUMMARY]');
  logger.info(`- Keys scanned: ${summary.keysScanned}`);
  logger.info(`- Indexed: ${summary.indexed}`);
  logger.info(`- Skipped: ${summary.skipped}`);
  logger.info(`- Errors: ${summary.errors}`);
}

run().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  logger.error(`[FATAL] ${message}`);
  process.exit(1);
});

"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const path_1 = __importDefault(require("path"));
const env_1 = require("../config/env");
const s3Provider_1 = require("../providers/storage/s3Provider");
const dynamodbProvider_1 = require("../providers/metadata/dynamodbProvider");
const pineconeProvider_1 = require("../providers/vector/pineconeProvider");
const clipXenovaProvider_1 = require("../providers/embedding/clipXenovaProvider");
const metadataService_1 = require("../services/metadataService");
const embeddingService_1 = require("../services/embeddingService");
const pineconeService_1 = require("../services/pineconeService");
const logger_1 = require("../utils/logger");
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
function normalizePrefix(prefix) {
    const clean = prefix.trim().replace(/^\/+/, '');
    if (!clean) {
        return '';
    }
    return clean.endsWith('/') ? clean : `${clean}/`;
}
function parseArgs(argv) {
    const options = {
        prefix: normalizePrefix(DEFAULT_PREFIX),
        concurrency: 2,
        dryRun: false
    };
    const nextValue = (index, flag) => {
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
function parseSnapshotKey(prefix, key) {
    if (!key.startsWith(prefix)) {
        return null;
    }
    const relative = key.slice(prefix.length);
    const parsed = path_1.default.posix.parse(relative);
    const partId = parsed.dir;
    const view = parsed.name.toLowerCase();
    if (!partId || !VALID_VIEWS.has(view) || parsed.ext.toLowerCase() !== '.png') {
        return null;
    }
    return { partId, view };
}
async function runWorkerPool(items, concurrency, worker) {
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
async function run() {
    const options = parseArgs(process.argv.slice(2));
    const { awsRegion, s3BucketName, dynamodbTableName, pineconeApiKey, pineconeIndex, pineconeNamespace } = (0, env_1.validatePreindexEnv)();
    logger_1.logger.info('[INDEX CONFIG]');
    logger_1.logger.info(`- bucket: ${s3BucketName}`);
    logger_1.logger.info(`- prefix: ${options.prefix}`);
    logger_1.logger.info(`- region: ${awsRegion}`);
    logger_1.logger.info(`- pinecone_index: ${pineconeIndex}`);
    logger_1.logger.info(`- pinecone_namespace: ${pineconeNamespace}`);
    logger_1.logger.info(`- concurrency: ${options.concurrency}`);
    logger_1.logger.info(`- dry_run: ${options.dryRun}`);
    const summary = {
        keysScanned: 0,
        indexed: 0,
        errors: 0,
        skipped: 0
    };
    const s3Provider = new s3Provider_1.S3Provider(awsRegion);
    const metadataService = new metadataService_1.MetadataService(new dynamodbProvider_1.DynamoDbProvider(awsRegion), dynamodbTableName);
    const pineconeService = new pineconeService_1.PineconeService(new pineconeProvider_1.PineconeProvider(pineconeApiKey), pineconeIndex, pineconeNamespace);
    const embeddingService = new embeddingService_1.EmbeddingService(new clipXenovaProvider_1.ClipXenovaProvider());
    const keys = (await s3Provider.listObjectKeys(s3BucketName, options.prefix)).sort();
    const pngKeys = keys.filter((key) => key.toLowerCase().endsWith('.png'));
    if (pngKeys.length === 0) {
        logger_1.logger.warn(`No PNG keys found under s3://${s3BucketName}/${options.prefix}`);
        return;
    }
    await runWorkerPool(pngKeys, options.concurrency, async (key) => {
        summary.keysScanned += 1;
        const parsed = parseSnapshotKey(options.prefix, key);
        if (!parsed) {
            summary.skipped += 1;
            logger_1.logger.warn(`[SKIP] Key does not match expected format: ${key}`);
            return;
        }
        const id = `${parsed.partId}-${parsed.view}`;
        const label = `${parsed.partId} - ${parsed.view} view`;
        try {
            logger_1.logger.info(`[INDEX] Downloading ${key}`);
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
            logger_1.logger.info(`[INDEXED] ${id} (${embedding.length} dims)`);
        }
        catch (error) {
            summary.errors += 1;
            const message = error instanceof Error ? error.message : String(error);
            logger_1.logger.error(`[ERROR] ${key}: ${message}`);
        }
    });
    logger_1.logger.info('[INDEX SUMMARY]');
    logger_1.logger.info(`- Keys scanned: ${summary.keysScanned}`);
    logger_1.logger.info(`- Indexed: ${summary.indexed}`);
    logger_1.logger.info(`- Skipped: ${summary.skipped}`);
    logger_1.logger.info(`- Errors: ${summary.errors}`);
}
run().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    logger_1.logger.error(`[FATAL] ${message}`);
    process.exit(1);
});

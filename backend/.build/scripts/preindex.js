"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const env_1 = require("../src/config/env");
const sampleData_1 = require("../src/config/sampleData");
const s3Provider_1 = require("../src/providers/storage/s3Provider");
const dynamodbProvider_1 = require("../src/providers/metadata/dynamodbProvider");
const pineconeProvider_1 = require("../src/providers/vector/pineconeProvider");
const clipXenovaProvider_1 = require("../src/providers/embedding/clipXenovaProvider");
const storageService_1 = require("../src/services/storageService");
const metadataService_1 = require("../src/services/metadataService");
const embeddingService_1 = require("../src/services/embeddingService");
const pineconeService_1 = require("../src/services/pineconeService");
const gen_placeholders_1 = require("./gen_placeholders");
const logger_1 = require("../src/utils/logger");
async function fileExists(filePath) {
    try {
        await promises_1.default.access(filePath);
        return true;
    }
    catch {
        return false;
    }
}
async function ensureSampleData(sampleRoot) {
    for (const model of sampleData_1.sampleModels) {
        for (const view of sampleData_1.sampleViews) {
            const filePath = (0, sampleData_1.getSampleImagePath)(sampleRoot, model, view);
            if (!(await fileExists(filePath))) {
                logger_1.logger.warn(`Missing sample image detected, regenerating placeholders in ${sampleRoot}`);
                await (0, gen_placeholders_1.generatePlaceholders)(sampleRoot);
                return;
            }
        }
    }
}
async function run() {
    const { awsRegion, s3BucketName, dynamodbTableName, pineconeApiKey, pineconeIndex, pineconeNamespace } = (0, env_1.validatePreindexEnv)();
    const sampleRoot = path_1.default.resolve(__dirname, '..', 'sample_data');
    await ensureSampleData(sampleRoot);
    const s3Provider = new s3Provider_1.S3Provider(awsRegion);
    const storageService = new storageService_1.StorageService(s3Provider, s3BucketName);
    const dynamoProvider = new dynamodbProvider_1.DynamoDbProvider(awsRegion);
    const metadataService = new metadataService_1.MetadataService(dynamoProvider, dynamodbTableName);
    const pineconeProvider = new pineconeProvider_1.PineconeProvider(pineconeApiKey);
    const pineconeService = new pineconeService_1.PineconeService(pineconeProvider, pineconeIndex, pineconeNamespace);
    const clipProvider = new clipXenovaProvider_1.ClipXenovaProvider();
    const embeddingService = new embeddingService_1.EmbeddingService(clipProvider);
    for (const model of sampleData_1.sampleModels) {
        for (const view of sampleData_1.sampleViews) {
            const localPath = (0, sampleData_1.getSampleImagePath)(sampleRoot, model, view);
            const key = `reference/${model}/${view}.png`;
            const label = `${model} — ${view} view`;
            const id = `${model}-${view}`;
            logger_1.logger.info(`Upload start: ${localPath} -> ${key}`);
            const body = await promises_1.default.readFile(localPath);
            await storageService.uploadReferenceImage(key, body);
            logger_1.logger.info(`Upload done: ${key}`);
            logger_1.logger.info(`DynamoDB write: ${id}`);
            await metadataService.writeReferenceMetadata({
                id,
                model,
                view,
                s3Key: key,
                label
            });
            logger_1.logger.info(`DynamoDB wrote: ${id}`);
            logger_1.logger.info(`Embedding start: ${id}`);
            const embedding = await embeddingService.embedImage(body);
            logger_1.logger.info(`Embedding done: ${id} (${embedding.length} dims)`);
            logger_1.logger.info(`Pinecone upsert: ${id}`);
            await pineconeService.upsertReferenceVector(id, embedding, {
                model,
                view,
                s3Key: key
            });
            logger_1.logger.info(`Pinecone upserted: ${id}`);
        }
    }
    logger_1.logger.info('Preindex complete');
}
run().catch((error) => {
    logger_1.logger.error(`Preindex failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
});

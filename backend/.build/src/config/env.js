"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
exports.validateSearchEnv = validateSearchEnv;
exports.validatePreindexEnv = validatePreindexEnv;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
let envFileLoaded = false;
function loadDotEnvIfPresent() {
    if (envFileLoaded) {
        return;
    }
    envFileLoaded = true;
    const candidates = [
        path_1.default.resolve(process.cwd(), '.env'),
        path_1.default.resolve(process.cwd(), 'backend', '.env')
    ];
    let envPath = null;
    for (const candidate of candidates) {
        if (fs_1.default.existsSync(candidate)) {
            envPath = candidate;
            break;
        }
    }
    if (!envPath) {
        return;
    }
    const lines = fs_1.default.readFileSync(envPath, 'utf8').split(/\r?\n/);
    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) {
            continue;
        }
        const eqIdx = line.indexOf('=');
        if (eqIdx <= 0) {
            continue;
        }
        const key = line.slice(0, eqIdx).trim();
        let value = line.slice(eqIdx + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        if (process.env[key] === undefined) {
            process.env[key] = value;
        }
    }
}
function getEnv(name, fallback) {
    loadDotEnvIfPresent();
    const value = process.env[name];
    if (value === undefined || value.trim() === '') {
        return fallback;
    }
    return value;
}
exports.env = {
    nodeEnv: getEnv('NODE_ENV', 'development') ?? 'development',
    apiBaseUrl: getEnv('API_BASE_URL'),
    awsRegion: getEnv('AWS_REGION'),
    s3BucketName: getEnv('S3_BUCKET_NAME'),
    dynamodbTableName: getEnv('DYNAMODB_TABLE_NAME'),
    pineconeApiKey: getEnv('PINECONE_API_KEY'),
    pineconeIndex: getEnv('PINECONE_INDEX'),
    pineconeNamespace: getEnv('PINECONE_NAMESPACE', 'industrility-demo')
};
function requireEnv(name) {
    const value = getEnv(name);
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
}
function validateSearchEnv() {
    const awsRegion = getEnv('AWS_REGION', 'ap-south-1') ?? 'ap-south-1';
    return {
        awsRegion,
        s3BucketName: requireEnv('S3_BUCKET_NAME'),
        dynamodbTableName: requireEnv('DYNAMODB_TABLE_NAME'),
        pineconeApiKey: requireEnv('PINECONE_API_KEY'),
        pineconeIndex: requireEnv('PINECONE_INDEX'),
        pineconeNamespace: getEnv('PINECONE_NAMESPACE', 'industrility-demo') ?? 'industrility-demo'
    };
}
function validatePreindexEnv() {
    const awsRegion = getEnv('AWS_REGION', 'ap-south-1') ?? 'ap-south-1';
    return {
        awsRegion,
        s3BucketName: requireEnv('S3_BUCKET_NAME'),
        dynamodbTableName: requireEnv('DYNAMODB_TABLE_NAME'),
        pineconeApiKey: requireEnv('PINECONE_API_KEY'),
        pineconeIndex: requireEnv('PINECONE_INDEX'),
        pineconeNamespace: getEnv('PINECONE_NAMESPACE', 'industrility-demo') ?? 'industrility-demo'
    };
}

import fs from 'fs';
import path from 'path';

export type EnvConfig = {
  nodeEnv: string;
  apiBaseUrl?: string;
  awsRegion?: string;
  s3BucketName?: string;
  dynamodbTableName?: string;
  pineconeApiKey?: string;
  pineconeIndex?: string;
  pineconeNamespace?: string;
};

let envFileLoaded = false;

function loadDotEnvIfPresent(): void {
  if (envFileLoaded) {
    return;
  }
  envFileLoaded = true;

  const candidates = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), 'backend', '.env')
  ];

  let envPath: string | null = null;
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      envPath = candidate;
      break;
    }
  }

  if (!envPath) {
    return;
  }

  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
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

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function getEnv(name: string, fallback?: string): string | undefined {
  loadDotEnvIfPresent();
  const value = process.env[name];
  if (value === undefined || value.trim() === '') {
    return fallback;
  }
  return value;
}

export const env: EnvConfig = {
  nodeEnv: getEnv('NODE_ENV', 'development') ?? 'development',
  apiBaseUrl: getEnv('API_BASE_URL'),
  awsRegion: getEnv('AWS_REGION'),
  s3BucketName: getEnv('S3_BUCKET_NAME'),
  dynamodbTableName: getEnv('DYNAMODB_TABLE_NAME'),
  pineconeApiKey: getEnv('PINECONE_API_KEY'),
  pineconeIndex: getEnv('PINECONE_INDEX'),
  pineconeNamespace: getEnv('PINECONE_NAMESPACE', 'industrility-demo')
};

function requireEnv(name: string): string {
  const value = getEnv(name);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

type PineconeEnv = {
  pineconeApiKey: string;
  pineconeIndex: string;
  pineconeNamespace: string;
};

export function validateSearchEnv(): {
  awsRegion: string;
  s3BucketName: string;
  dynamodbTableName: string;
} & PineconeEnv {
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

export function validatePreindexEnv(): {
  awsRegion: string;
  s3BucketName: string;
  dynamodbTableName: string;
} & PineconeEnv {
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

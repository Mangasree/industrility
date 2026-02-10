"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.S3Provider = void 0;
const client_s3_1 = require("@aws-sdk/client-s3");
const s3_request_presigner_1 = require("@aws-sdk/s3-request-presigner");
class S3Provider {
    constructor(region) {
        this.client = new client_s3_1.S3Client({ region });
    }
    async putObject(input) {
        const command = new client_s3_1.PutObjectCommand({
            Bucket: input.bucket,
            Key: input.key,
            Body: input.body,
            ContentType: input.contentType
        });
        await this.client.send(command);
    }
    async getPresignedUrl(bucket, key, expiresInSeconds) {
        const command = new client_s3_1.GetObjectCommand({
            Bucket: bucket,
            Key: key
        });
        return (0, s3_request_presigner_1.getSignedUrl)(this.client, command, { expiresIn: expiresInSeconds });
    }
    async listObjectKeys(bucket, prefix) {
        const keys = [];
        let continuationToken;
        do {
            const response = await this.client.send(new client_s3_1.ListObjectsV2Command({
                Bucket: bucket,
                Prefix: prefix,
                ContinuationToken: continuationToken
            }));
            for (const obj of response.Contents ?? []) {
                if (obj.Key) {
                    keys.push(obj.Key);
                }
            }
            continuationToken = response.NextContinuationToken;
        } while (continuationToken);
        return keys;
    }
    async getObjectBuffer(bucket, key) {
        const response = await this.client.send(new client_s3_1.GetObjectCommand({
            Bucket: bucket,
            Key: key
        }));
        if (!response.Body) {
            throw new Error(`Empty S3 object body for s3://${bucket}/${key}`);
        }
        const body = response.Body;
        if (typeof body.transformToByteArray !== 'function') {
            throw new Error(`Unsupported S3 body stream type for s3://${bucket}/${key}`);
        }
        const bytes = await body.transformToByteArray();
        return Buffer.from(bytes);
    }
}
exports.S3Provider = S3Provider;

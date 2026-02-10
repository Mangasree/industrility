"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StorageService = void 0;
class StorageService {
    constructor(provider, bucketName) {
        this.provider = provider;
        this.bucketName = bucketName;
    }
    async uploadReferenceImage(key, body) {
        await this.provider.putObject({
            bucket: this.bucketName,
            key,
            body,
            contentType: 'image/png'
        });
    }
    async getSignedReferenceUrl(key, expiresInSeconds = 900) {
        return this.provider.getPresignedUrl(this.bucketName, key, expiresInSeconds);
    }
}
exports.StorageService = StorageService;

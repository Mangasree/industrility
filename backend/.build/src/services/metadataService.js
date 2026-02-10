"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MetadataService = void 0;
class MetadataService {
    constructor(provider, tableName) {
        this.provider = provider;
        this.tableName = tableName;
    }
    async writeReferenceMetadata(item) {
        await this.provider.putMetadata(this.tableName, item);
    }
    async getReferenceMetadata(id) {
        return this.provider.getMetadata(this.tableName, id);
    }
}
exports.MetadataService = MetadataService;

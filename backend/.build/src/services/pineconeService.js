"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PineconeService = void 0;
class PineconeService {
    constructor(provider, indexName, namespace) {
        this.provider = provider;
        this.indexName = indexName;
        this.namespace = namespace;
    }
    async upsertReferenceVector(id, values, metadata) {
        await this.provider.upsertVector(this.indexName, this.namespace, id, values, {
            model: metadata.model,
            view: metadata.view,
            s3Key: metadata.s3Key
        });
    }
    async querySimilar(vector, topK) {
        return this.provider.queryVectors(this.indexName, this.namespace, vector, topK);
    }
}
exports.PineconeService = PineconeService;

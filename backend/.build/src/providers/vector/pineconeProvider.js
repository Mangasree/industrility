"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PineconeProvider = void 0;
const pinecone_1 = require("@pinecone-database/pinecone");
class PineconeProvider {
    constructor(apiKey) {
        this.client = new pinecone_1.Pinecone({ apiKey });
    }
    async upsertVector(indexName, namespace, id, values, metadata) {
        const index = this.client.index(indexName);
        await index.namespace(namespace).upsert([
            {
                id,
                values,
                metadata
            }
        ]);
    }
    async queryVectors(indexName, namespace, vector, topK) {
        const index = this.client.index(indexName);
        const response = await index.namespace(namespace).query({
            vector,
            topK,
            includeMetadata: false
        });
        return (response.matches ?? [])
            .filter((match) => typeof match.id === 'string' && match.id.length > 0)
            .map((match) => ({
            id: match.id,
            score: match.score ?? 0
        }));
    }
}
exports.PineconeProvider = PineconeProvider;

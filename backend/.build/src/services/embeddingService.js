"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmbeddingService = void 0;
class EmbeddingService {
    constructor(provider) {
        this.provider = provider;
    }
    async embedImage(buffer) {
        return this.provider.embedBuffer(buffer);
    }
}
exports.EmbeddingService = EmbeddingService;

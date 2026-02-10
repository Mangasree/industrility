"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClipXenovaProvider = void 0;
const logger_1 = require("../../utils/logger");
let transformersPromise = null;
let pipelinePromise = null;
async function loadTransformers() {
    if (!transformersPromise) {
        transformersPromise = Promise.resolve().then(() => __importStar(require('@xenova/transformers')));
    }
    return transformersPromise;
}
async function loadPipeline() {
    if (!pipelinePromise) {
        pipelinePromise = (async () => {
            logger_1.logger.info('Loading CLIP model (Xenova) for image embeddings');
            const module = await loadTransformers();
            const extractor = await module.pipeline('image-feature-extraction', 'Xenova/clip-vit-base-patch32');
            logger_1.logger.info('CLIP model loaded');
            return extractor;
        })();
    }
    return pipelinePromise;
}
class ClipXenovaProvider {
    async embedBuffer(buffer) {
        const module = await loadTransformers();
        const extractor = await loadPipeline();
        const blob = new Blob([buffer], { type: 'image/png' });
        const rawImage = await module.RawImage.fromBlob(blob);
        const output = await extractor(rawImage, { pooling: 'mean', normalize: true });
        const data = output.data instanceof Float32Array ? Array.from(output.data) : output.data;
        return data;
    }
}
exports.ClipXenovaProvider = ClipXenovaProvider;

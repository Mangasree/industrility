"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const env_1 = require("../config/env");
const multipart_1 = require("../utils/multipart");
const logger_1 = require("../utils/logger");
const clipXenovaProvider_1 = require("../providers/embedding/clipXenovaProvider");
const embeddingService_1 = require("../services/embeddingService");
const pineconeProvider_1 = require("../providers/vector/pineconeProvider");
const pineconeService_1 = require("../services/pineconeService");
const dynamodbProvider_1 = require("../providers/metadata/dynamodbProvider");
const metadataService_1 = require("../services/metadataService");
const s3Provider_1 = require("../providers/storage/s3Provider");
const storageService_1 = require("../services/storageService");
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp']);
const CRASH_HOOK_KEY = '__INDUSTRILITY_SEARCH_CRASH_HOOK__';
const VIEW_SUFFIXES = ['top', 'bottom', 'left', 'right', 'front', 'back', 'isometric'];
const DEFAULT_MIN_PART_SCORE = 0.72;
if (!globalThis[CRASH_HOOK_KEY]) {
    globalThis[CRASH_HOOK_KEY] = true;
    process.on('uncaughtException', (error) => {
        const head = error.stack ? error.stack.split('\n')[0] : error.message;
        logger_1.logger.error(`[PROCESS_CRASH] type=uncaughtException message=${error.message} stack_head=${head}`);
    });
    process.on('unhandledRejection', (reason) => {
        const err = reason instanceof Error ? reason : new Error(String(reason));
        const head = err.stack ? err.stack.split('\n')[0] : err.message;
        logger_1.logger.error(`[PROCESS_CRASH] type=unhandledRejection message=${err.message} stack_head=${head}`);
    });
}
function jsonResponse(statusCode, payload, requestId) {
    return {
        statusCode,
        headers: {
            'content-type': 'application/json',
            ...(requestId ? { 'x-request-id': requestId } : {})
        },
        body: JSON.stringify(payload)
    };
}
const handler = async (event) => {
    const start = Date.now();
    const requestId = event.requestContext?.requestId;
    const logStep = (step, details) => {
        const elapsedMs = Date.now() - start;
        logger_1.logger.info(`[SEARCH_STEP] t+${elapsedMs}ms | ${step}${details ? ` | ${details}` : ''}`, { requestId });
    };
    logStep('request_received', `method=${event.requestContext?.http?.method ?? 'unknown'} path=${event.requestContext?.http?.path ?? '/search'}`);
    try {
        const { awsRegion, s3BucketName, dynamodbTableName, pineconeApiKey, pineconeIndex, pineconeNamespace } = (0, env_1.validateSearchEnv)();
        logStep('env_validated', `region=${awsRegion} bucket=${s3BucketName} table=${dynamodbTableName} pinecone_index=${pineconeIndex} namespace=${pineconeNamespace} api_key_set=${pineconeApiKey ? 'yes' : 'no'}`);
        logStep('multipart_parse_start');
        const file = await (0, multipart_1.parseMultipartFile)(event, {
            fieldName: 'file',
            maxBytes: MAX_UPLOAD_BYTES
        });
        logStep('multipart_parse_done', `filename=${file.filename} bytes=${file.size} mime=${file.mimeType}`);
        if (!ALLOWED_MIME_TYPES.has(file.mimeType)) {
            logStep('validation_rejected', `unsupported_mime=${file.mimeType}`);
            return jsonResponse(400, {
                error: 'Unsupported file type',
                error_code: 'UNSUPPORTED_FILE_TYPE',
                request_id: requestId
            }, requestId);
        }
        const clipProvider = new clipXenovaProvider_1.ClipXenovaProvider();
        const embeddingService = new embeddingService_1.EmbeddingService(clipProvider);
        const pineconeProvider = new pineconeProvider_1.PineconeProvider(pineconeApiKey);
        const pineconeService = new pineconeService_1.PineconeService(pineconeProvider, pineconeIndex, pineconeNamespace);
        const dynamoProvider = new dynamodbProvider_1.DynamoDbProvider(awsRegion);
        const metadataService = new metadataService_1.MetadataService(dynamoProvider, dynamodbTableName);
        const s3Provider = new s3Provider_1.S3Provider(awsRegion);
        const storageService = new storageService_1.StorageService(s3Provider, s3BucketName);
        logStep('providers_initialized');
        logStep('embedding_start');
        const embedding = await embeddingService.embedImage(file.buffer);
        logStep('embedding_done', `dims=${embedding.length}`);
        const topK = 20;
        const rawMinPartScore = process.env.SEARCH_MIN_SCORE;
        const parsedMinPartScore = rawMinPartScore ? Number.parseFloat(rawMinPartScore) : Number.NaN;
        const isValidMinPartScore = Number.isFinite(parsedMinPartScore) && parsedMinPartScore >= 0 && parsedMinPartScore <= 1;
        const minPartScore = isValidMinPartScore ? parsedMinPartScore : DEFAULT_MIN_PART_SCORE;
        const minPartScoreSource = isValidMinPartScore ? 'env' : 'default';
        if (rawMinPartScore && !isValidMinPartScore) {
            logStep('config_warn', `invalid_SEARCH_MIN_SCORE=${rawMinPartScore} fallback=${DEFAULT_MIN_PART_SCORE}`);
        }
        logStep('pinecone_query_start', `topK=${topK} min_part_score=${minPartScore} source=${minPartScoreSource}`);
        const matches = await pineconeService.querySimilar(embedding, topK);
        logStep('pinecone_query_done', `match_count=${matches.length}`);
        const rawCandidates = [];
        let i = 0;
        for (const match of matches) {
            i += 1;
            logStep('match_process_start', `rank=${i} id=${match.id} score=${match.score.toFixed(6)}`);
            logStep('dynamodb_get_start', `id=${match.id}`);
            const metadata = await metadataService.getReferenceMetadata(match.id);
            if (!metadata) {
                logStep('dynamodb_get_missing', `id=${match.id}`);
                continue;
            }
            logStep('dynamodb_get_done', `id=${match.id} model=${metadata.model} view=${metadata.view} s3_key=${metadata.s3Key}`);
            logStep('s3_presign_start', `s3_key=${metadata.s3Key}`);
            const signedImageUrl = await storageService.getSignedReferenceUrl(metadata.s3Key);
            logStep('s3_presign_done', `id=${match.id}`);
            rawCandidates.push({
                id: match.id,
                score: match.score,
                partId: metadata.model,
                model: metadata.model,
                view: metadata.view,
                label: metadata.label,
                signedImageUrl
            });
            logStep('match_process_done', `rank=${i} id=${match.id}`);
        }
        const grouped = new Map();
        for (const candidate of rawCandidates) {
            const existing = grouped.get(candidate.partId);
            if (!existing) {
                grouped.set(candidate.partId, {
                    partId: candidate.partId,
                    bestScore: candidate.score,
                    totalScore: candidate.score,
                    count: 1,
                    bestCandidate: candidate
                });
                continue;
            }
            existing.totalScore += candidate.score;
            existing.count += 1;
            if (candidate.score > existing.bestScore) {
                existing.bestScore = candidate.score;
                existing.bestCandidate = candidate;
            }
        }
        const aggregated = Array.from(grouped.values())
            .map((part) => {
            const meanScore = part.totalScore / part.count;
            const aggregateScore = part.bestScore * 0.7 + meanScore * 0.3;
            return { ...part, aggregateScore };
        })
            .sort((a, b) => b.aggregateScore - a.aggregateScore);
        logStep('part_aggregation_done', `parts=${aggregated.length}`);
        const filtered = aggregated.filter((item) => item.aggregateScore >= minPartScore).slice(0, 5);
        logStep('part_filter_done', `threshold=${minPartScore} qualified=${filtered.length}${filtered[0] ? ` top_score=${filtered[0].aggregateScore.toFixed(6)}` : ''}`);
        const partSelection = filtered.length > 0 ? filtered : aggregated.slice(0, 5);
        if (filtered.length === 0 && aggregated.length > 0) {
            logStep('part_filter_fallback', `using_top_parts_without_threshold count=${partSelection.length}`);
        }
        const modelCandidates = [];
        for (const item of partSelection) {
            const canonicalViews = [];
            for (const view of VIEW_SUFFIXES) {
                const id = `${item.partId}-${view}`;
                const matchForView = rawCandidates.find((candidate) => candidate.id === id);
                const metadata = await metadataService.getReferenceMetadata(id);
                if (!metadata) {
                    continue;
                }
                const signedImageUrl = await storageService.getSignedReferenceUrl(metadata.s3Key);
                canonicalViews.push({
                    id,
                    score: matchForView?.score ?? item.aggregateScore,
                    model: metadata.model,
                    view: metadata.view,
                    label: metadata.label,
                    signedImageUrl
                });
            }
            const fallbackViews = rawCandidates
                .filter((candidate) => candidate.partId === item.partId)
                .sort((a, b) => b.score - a.score)
                .slice(0, 7)
                .map((candidate) => ({
                id: candidate.id,
                score: candidate.score,
                model: candidate.model,
                view: candidate.view,
                label: candidate.label,
                signedImageUrl: candidate.signedImageUrl
            }));
            const views = canonicalViews.length > 0 ? canonicalViews : fallbackViews;
            modelCandidates.push({
                partId: item.partId,
                model: item.bestCandidate.model,
                aggregateScore: item.aggregateScore,
                views
            });
            logStep('model_candidate_views_done', `part=${item.partId} views=${views.length} source=${canonicalViews.length > 0 ? 'canonical' : 'fallback'}`);
        }
        logStep('model_candidates_built', `count=${modelCandidates.length}`);
        const results = modelCandidates[0]?.views ?? [];
        const latencyMs = Date.now() - start;
        logStep('response_ready', `latency_ms=${latencyMs} returned_matches=${results.length} returned_models=${modelCandidates.length}`);
        return jsonResponse(200, { matches: results, modelCandidates, request_id: requestId }, requestId);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const stackHead = error instanceof Error && error.stack ? error.stack.split('\n')[0]?.trim() ?? 'no_stack' : 'no_stack';
        logStep('search_failed', `message=${message} stack=${stackHead}`);
        if (message.includes('Missing Content-Type') ||
            message.includes('Missing request body') ||
            message.includes('Missing file field')) {
            return jsonResponse(400, {
                error: message,
                error_code: 'BAD_MULTIPART_REQUEST',
                request_id: requestId
            }, requestId);
        }
        if (message.includes('File exceeds')) {
            return jsonResponse(413, {
                error: message,
                error_code: 'FILE_TOO_LARGE',
                request_id: requestId
            }, requestId);
        }
        if (message.includes('Unsupported file type')) {
            return jsonResponse(400, {
                error: message,
                error_code: 'UNSUPPORTED_FILE_TYPE',
                request_id: requestId
            }, requestId);
        }
        if (message.toLowerCase().includes('pinecone')) {
            return jsonResponse(502, {
                error: 'Vector search provider error',
                error_code: 'PINECONE_ERROR',
                request_id: requestId
            }, requestId);
        }
        return jsonResponse(500, {
            error: 'Internal server error',
            error_code: 'INTERNAL_ERROR',
            request_id: requestId
        }, requestId);
    }
};
exports.handler = handler;

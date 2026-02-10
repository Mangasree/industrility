import { logger } from '../../utils/logger';

type ClipPipeline = (input: unknown, options?: Record<string, unknown>) => Promise<{
  data: Float32Array | number[];
}>;

type TransformersModule = {
  pipeline: (task: string, model: string) => Promise<ClipPipeline>;
  RawImage: {
    fromBlob: (blob: Blob) => Promise<unknown>;
  };
};

let transformersPromise: Promise<TransformersModule> | null = null;
let pipelinePromise: Promise<ClipPipeline> | null = null;

async function loadTransformers(): Promise<TransformersModule> {
  if (!transformersPromise) {
    transformersPromise = import('@xenova/transformers') as Promise<TransformersModule>;
  }
  return transformersPromise;
}

async function loadPipeline(): Promise<ClipPipeline> {
  if (!pipelinePromise) {
    pipelinePromise = (async () => {
      logger.info('Loading CLIP model (Xenova) for image embeddings');
      const module = await loadTransformers();
      const extractor = await module.pipeline('image-feature-extraction', 'Xenova/clip-vit-base-patch32');
      logger.info('CLIP model loaded');
      return extractor;
    })();
  }
  return pipelinePromise;
}

export class ClipXenovaProvider {
  async embedBuffer(buffer: Buffer): Promise<number[]> {
    const module = await loadTransformers();
    const extractor = await loadPipeline();
    const blob = new Blob([buffer], { type: 'image/png' });
    const rawImage = await module.RawImage.fromBlob(blob);
    const output = await extractor(rawImage, { pooling: 'mean', normalize: true });
    const data = output.data instanceof Float32Array ? Array.from(output.data) : (output.data as number[]);
    return data;
  }
}

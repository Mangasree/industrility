import { PineconeProvider, PineconeMatch } from '../providers/vector/pineconeProvider';

export class PineconeService {
  private provider: PineconeProvider;
  private indexName: string;
  private namespace: string;

  constructor(provider: PineconeProvider, indexName: string, namespace: string) {
    this.provider = provider;
    this.indexName = indexName;
    this.namespace = namespace;
  }

  async upsertReferenceVector(
    id: string,
    values: number[],
    metadata: { model: string; view: string; s3Key: string }
  ): Promise<void> {
    await this.provider.upsertVector(this.indexName, this.namespace, id, values, {
      model: metadata.model,
      view: metadata.view,
      s3Key: metadata.s3Key
    });
  }

  async querySimilar(vector: number[], topK: number): Promise<PineconeMatch[]> {
    return this.provider.queryVectors(this.indexName, this.namespace, vector, topK);
  }
}

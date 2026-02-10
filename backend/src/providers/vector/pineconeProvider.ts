import { Pinecone } from '@pinecone-database/pinecone';

export type PineconeMatch = {
  id: string;
  score: number;
};

export class PineconeProvider {
  private client: Pinecone;

  constructor(apiKey: string) {
    this.client = new Pinecone({ apiKey });
  }

  async upsertVector(
    indexName: string,
    namespace: string,
    id: string,
    values: number[],
    metadata: Record<string, string>
  ): Promise<void> {
    const index = this.client.index(indexName);
    await index.namespace(namespace).upsert([
      {
        id,
        values,
        metadata
      }
    ]);
  }

  async queryVectors(
    indexName: string,
    namespace: string,
    vector: number[],
    topK: number
  ): Promise<PineconeMatch[]> {
    const index = this.client.index(indexName);
    const response = await index.namespace(namespace).query({
      vector,
      topK,
      includeMetadata: false
    });
    return (response.matches ?? [])
      .filter((match): match is typeof match & { id: string } => typeof match.id === 'string' && match.id.length > 0)
      .map((match) => ({
        id: match.id,
        score: match.score ?? 0
      }));
  }
}

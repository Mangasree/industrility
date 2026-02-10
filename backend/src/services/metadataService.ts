import type { ReferenceMetadata } from '../types/metadata';
import { DynamoDbProvider } from '../providers/metadata/dynamodbProvider';

export class MetadataService {
  private provider: DynamoDbProvider;
  private tableName: string;

  constructor(provider: DynamoDbProvider, tableName: string) {
    this.provider = provider;
    this.tableName = tableName;
  }

  async writeReferenceMetadata(item: ReferenceMetadata): Promise<void> {
    await this.provider.putMetadata(this.tableName, item);
  }

  async getReferenceMetadata(id: string): Promise<ReferenceMetadata | null> {
    return this.provider.getMetadata(this.tableName, id);
  }
}

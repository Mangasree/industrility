import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import type { ReferenceMetadata } from '../../types/metadata';

export class DynamoDbProvider {
  private client: DynamoDBDocumentClient;

  constructor(region: string) {
    const baseClient = new DynamoDBClient({ region });
    this.client = DynamoDBDocumentClient.from(baseClient);
  }

  async putMetadata(tableName: string, item: ReferenceMetadata): Promise<void> {
    // Tolerate existing table schemas that use pk/sk keys.
    // Keep id for app-level compatibility.
    const normalizedItem = {
      ...item,
      pk: (item as ReferenceMetadata & { pk?: string }).pk ?? item.id,
      sk: (item as ReferenceMetadata & { sk?: string }).sk ?? 'METADATA'
    };
    const command = new PutCommand({
      TableName: tableName,
      Item: normalizedItem
    });
    await this.client.send(command);
  }

  async getMetadata(tableName: string, id: string): Promise<ReferenceMetadata | null> {
    // Try pk-first (current AWS table), then fallback to id for older/local tables.
    try {
      const responsePk = await this.client.send(
        new GetCommand({
          TableName: tableName,
          Key: { pk: id, sk: 'METADATA' }
        })
      );
      if (responsePk.Item) {
        const item = responsePk.Item as ReferenceMetadata & { pk?: string };
        return {
          ...item,
          id: item.id ?? item.pk ?? id
        };
      }
    } catch {
      // Fallback below.
    }

    try {
      const responseId = await this.client.send(
        new GetCommand({
          TableName: tableName,
          Key: { id }
        })
      );
      if (responseId.Item) {
        const item = responseId.Item as ReferenceMetadata & { pk?: string };
        return {
          ...item,
          id: item.id ?? item.pk ?? id
        };
      }
    } catch {
      // No compatible key schema.
    }

    return null;
  }
}

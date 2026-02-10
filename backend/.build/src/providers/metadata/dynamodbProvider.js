"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DynamoDbProvider = void 0;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
class DynamoDbProvider {
    constructor(region) {
        const baseClient = new client_dynamodb_1.DynamoDBClient({ region });
        this.client = lib_dynamodb_1.DynamoDBDocumentClient.from(baseClient);
    }
    async putMetadata(tableName, item) {
        // Tolerate existing table schemas that use pk/sk keys.
        // Keep id for app-level compatibility.
        const normalizedItem = {
            ...item,
            pk: item.pk ?? item.id,
            sk: item.sk ?? 'METADATA'
        };
        const command = new lib_dynamodb_1.PutCommand({
            TableName: tableName,
            Item: normalizedItem
        });
        await this.client.send(command);
    }
    async getMetadata(tableName, id) {
        // Try pk-first (current AWS table), then fallback to id for older/local tables.
        try {
            const responsePk = await this.client.send(new lib_dynamodb_1.GetCommand({
                TableName: tableName,
                Key: { pk: id, sk: 'METADATA' }
            }));
            if (responsePk.Item) {
                const item = responsePk.Item;
                return {
                    ...item,
                    id: item.id ?? item.pk ?? id
                };
            }
        }
        catch {
            // Fallback below.
        }
        try {
            const responseId = await this.client.send(new lib_dynamodb_1.GetCommand({
                TableName: tableName,
                Key: { id }
            }));
            if (responseId.Item) {
                const item = responseId.Item;
                return {
                    ...item,
                    id: item.id ?? item.pk ?? id
                };
            }
        }
        catch {
            // No compatible key schema.
        }
        return null;
    }
}
exports.DynamoDbProvider = DynamoDbProvider;

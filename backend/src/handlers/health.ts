import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { formatIstTimestamp, logger } from '../utils/logger';

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const requestId = event.requestContext?.requestId;
  logger.info('Health check invoked', { requestId });

  const timeIst = formatIstTimestamp(new Date());

  return {
    statusCode: 200,
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      ok: true,
      timeIst
    })
  };
};

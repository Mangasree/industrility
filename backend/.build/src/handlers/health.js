"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const logger_1 = require("../utils/logger");
const handler = async (event) => {
    const requestId = event.requestContext?.requestId;
    logger_1.logger.info('Health check invoked', { requestId });
    const timeIst = (0, logger_1.formatIstTimestamp)(new Date());
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
exports.handler = handler;

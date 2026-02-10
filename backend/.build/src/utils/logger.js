"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
exports.formatIstTimestamp = formatIstTimestamp;
const istFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
});
function formatIstTimestamp(date) {
    const parts = istFormatter.formatToParts(date);
    const lookup = {};
    for (const part of parts) {
        if (part.type !== 'literal') {
            lookup[part.type] = part.value;
        }
    }
    return `${lookup.year}-${lookup.month}-${lookup.day} ${lookup.hour}:${lookup.minute}:${lookup.second} IST`;
}
function log(level, message, options) {
    const timestamp = formatIstTimestamp(new Date());
    const requestId = options?.requestId ?? '-';
    const line = `${timestamp} | ${level} | requestId=${requestId} | ${message}`;
    console.log(line);
}
exports.logger = {
    debug: (message, options) => log('DEBUG', message, options),
    info: (message, options) => log('INFO', message, options),
    warn: (message, options) => log('WARN', message, options),
    error: (message, options) => log('ERROR', message, options)
};

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

type LogOptions = {
  requestId?: string;
};

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

export function formatIstTimestamp(date: Date): string {
  const parts = istFormatter.formatToParts(date);
  const lookup: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== 'literal') {
      lookup[part.type] = part.value;
    }
  }

  return `${lookup.year}-${lookup.month}-${lookup.day} ${lookup.hour}:${lookup.minute}:${lookup.second} IST`;
}

function log(level: LogLevel, message: string, options?: LogOptions): void {
  const timestamp = formatIstTimestamp(new Date());
  const requestId = options?.requestId ?? '-';
  const line = `${timestamp} | ${level} | requestId=${requestId} | ${message}`;
  console.log(line);
}

export const logger = {
  debug: (message: string, options?: LogOptions) => log('DEBUG', message, options),
  info: (message: string, options?: LogOptions) => log('INFO', message, options),
  warn: (message: string, options?: LogOptions) => log('WARN', message, options),
  error: (message: string, options?: LogOptions) => log('ERROR', message, options)
};

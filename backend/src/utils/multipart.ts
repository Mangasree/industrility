import Busboy from 'busboy';
import { Readable } from 'stream';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';

export type MultipartFile = {
  fieldname: string;
  filename: string;
  mimeType: string;
  buffer: Buffer;
  size: number;
};

export async function parseMultipartFile(
  event: APIGatewayProxyEventV2,
  options: { fieldName: string; maxBytes: number }
): Promise<MultipartFile> {
  const contentType = event.headers['content-type'] || event.headers['Content-Type'];
  if (!contentType) {
    throw new Error('Missing Content-Type header');
  }

  const body = event.body ?? '';
  if (!body) {
    throw new Error('Missing request body');
  }
  const buffer = event.isBase64Encoded ? Buffer.from(body, 'base64') : Buffer.from(body, 'binary');

  return new Promise((resolve, reject) => {
    const busboy = Busboy({ headers: { 'content-type': contentType } });
    let fileFound = false;
    let receivedFile: MultipartFile | null = null;
    let rejected = false;

    busboy.on('file', (fieldname, file, info) => {
      if (fieldname !== options.fieldName) {
        file.resume();
        return;
      }
      fileFound = true;
      const chunks: Buffer[] = [];
      let total = 0;

      file.on('data', (data: Buffer) => {
        total += data.length;
        if (total > options.maxBytes) {
          file.unpipe();
          file.resume();
          if (!rejected) {
            rejected = true;
            reject(new Error(`File exceeds max size of ${options.maxBytes} bytes`));
          }
          return;
        }
        chunks.push(data);
      });

      file.on('end', () => {
        const fileBuffer = Buffer.concat(chunks);
        receivedFile = {
          fieldname,
          filename: info.filename || 'upload',
          mimeType: info.mimeType || 'application/octet-stream',
          buffer: fileBuffer,
          size: total
        };
      });
    });

    busboy.on('finish', () => {
      if (rejected) {
        return;
      }
      if (!fileFound || !receivedFile) {
        reject(new Error(`Missing file field: ${options.fieldName}`));
        return;
      }
      resolve(receivedFile);
    });

    busboy.on('error', (error) => reject(error));

    Readable.from(buffer).pipe(busboy);
  });
}

// Runs in a utilityProcess so parsing ~100k cards never blocks the main
// process. Messages: see IngestRequest / IngestMessage.
import { Readable } from 'node:stream';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';

import { getErrorMessage } from '../util';
import { ingestBulkFile } from './ingest';
import type { IngestMessage, IngestRequest } from './ingestMessages';

const post = (message: IngestMessage) =>
  process.parentPort.postMessage(message);

const run = async (request: IngestRequest) => {
  const response = await fetch(request.url, { headers: request.headers });
  if (!response.ok || !response.body) {
    throw new Error(`card data download failed (${response.status})`);
  }
  const length = Number(response.headers.get('content-length'));

  const { rows } = await ingestBulkFile({
    source: Readable.fromWeb(response.body as NodeReadableStream<Uint8Array>),
    totalBytes: length > 0 ? length : request.totalBytes,
    dbPath: request.dbPath,
    sourceUpdatedAt: request.sourceUpdatedAt,
    onProgress: (progress) => post({ type: 'progress', progress }),
  });
  post({ type: 'done', rows });
};

process.parentPort.once('message', (event) => {
  // The parent kills this process once it has the final message.
  run(event.data as IngestRequest).catch((err: unknown) => {
    post({ type: 'error', message: getErrorMessage(err) });
  });
});

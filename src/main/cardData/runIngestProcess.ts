import { utilityProcess } from 'electron';

import type { RunIngest } from './CardDataService';
import type { IngestMessage } from './ingestMessages';
import workerPath from './ingestWorker?modulePath';

// Runs one ingest in a fresh utility process and settles on its final
// message, or rejects if the process dies without sending one.
const runIngestProcess: RunIngest = (request, onProgress) =>
  new Promise((resolve, reject) => {
    const child = utilityProcess.fork(workerPath, [], {
      serviceName: 'MTG Play Mat card data',
    });
    let settled = false;

    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
      child.kill();
    };

    child.on('message', (message: IngestMessage) => {
      if (message.type === 'progress') onProgress(message.progress);
      else if (message.type === 'done') settle(() => resolve(message.rows));
      else settle(() => reject(new Error(message.message)));
    });
    child.once('exit', (code) => {
      settle(() => reject(new Error(`card data worker exited (${code})`)));
    });

    child.postMessage(request);
  });

export default runIngestProcess;

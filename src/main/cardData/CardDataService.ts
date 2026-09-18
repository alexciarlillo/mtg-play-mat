import { renameSync, rmSync } from 'node:fs';

import type { CardDataProgress, CardDataStatus } from '@shared/types/cardData';

import type CardDB from '../shared/db/CardDB';
import { getErrorMessage } from '../util';
import type { IngestRequest } from './ingestMessages';
import {
  type BulkDataInfo,
  CARD_DATA_MAX_AGE_MS,
  fetchBulkDataInfo,
  scryfallHeaders,
  shouldDownload,
} from './scryfall';

export type RunIngest = (
  request: IngestRequest,
  onProgress: (progress: CardDataProgress) => void
) => Promise<number>;

interface Deps {
  cardDb: CardDB;
  appVersion: string;
  bulkDataUrl: string;
  runIngest: RunIngest;
  onStatus(status: CardDataStatus): void;
  fetchInfo?(url: string, appVersion: string): Promise<BulkDataInfo>;
  now?(): Date;
  maxAgeMs?: number;
}

// Keeps the card database current. The old file stays in use until a new
// one is fully built, so a failed or offline update never loses data.
export default class CardDataService {
  private status: CardDataStatus;

  private running: Promise<void> | null = null;

  constructor(private readonly deps: Deps) {
    this.status = {
      phase: 'idle',
      local: deps.cardDb.getMeta(),
      progress: null,
      error: null,
    };
  }

  getStatus = (): CardDataStatus => this.status;

  // Resolves when the check (and any update it starts) finishes.
  check = ({ force = false } = {}): Promise<void> => {
    this.running ??= this.run(force).finally(() => {
      this.running = null;
    });
    return this.running;
  };

  private setStatus = (patch: Partial<CardDataStatus>) => {
    this.status = { ...this.status, ...patch };
    this.deps.onStatus(this.status);
  };

  private run = async (force: boolean) => {
    const { cardDb, appVersion, bulkDataUrl } = this.deps;
    const fetchInfo = this.deps.fetchInfo ?? fetchBulkDataInfo;
    const now = this.deps.now ?? (() => new Date());

    this.setStatus({ phase: 'checking', error: null, progress: null });
    const tmpPath = `${cardDb.filePath}.new`;

    try {
      const info = await fetchInfo(bulkDataUrl, appVersion);
      const local = cardDb.getMeta();
      const download = shouldDownload({
        local,
        remoteUpdatedAt: info.updatedAt,
        now: now(),
        maxAgeMs: this.deps.maxAgeMs ?? CARD_DATA_MAX_AGE_MS,
        force,
      });
      if (!download) {
        this.setStatus({ phase: 'idle', local });
        return;
      }

      const initial = { bytes: 0, totalBytes: info.size, rows: 0 };
      this.setStatus({ phase: 'updating', progress: initial });
      await this.deps.runIngest(
        {
          url: info.downloadUrl,
          headers: scryfallHeaders(appVersion),
          totalBytes: info.size,
          dbPath: tmpPath,
          sourceUpdatedAt: info.updatedAt,
        },
        (progress) => this.setStatus({ progress })
      );

      // Windows can't rename over an open file, so let go of it first.
      cardDb.close();
      try {
        rmSync(`${cardDb.filePath}-journal`, { force: true });
        renameSync(tmpPath, cardDb.filePath);
      } finally {
        cardDb.open();
      }
      this.setStatus({ phase: 'idle', local: cardDb.getMeta() });
    } catch (err) {
      rmSync(tmpPath, { force: true });
      console.warn('[cardData] update failed', getErrorMessage(err));
      this.setStatus({
        phase: 'error',
        local: cardDb.getMeta(),
        error: getErrorMessage(err),
      });
    }
  };
}

import type { CardDataProgress } from '@shared/types/cardData';

export interface IngestRequest {
  url: string;
  headers: Record<string, string>;
  totalBytes: number | null;
  dbPath: string;
  sourceUpdatedAt: string;
}

export type IngestMessage =
  | { type: 'progress'; progress: CardDataProgress }
  | { type: 'done'; rows: number }
  | { type: 'error'; message: string };

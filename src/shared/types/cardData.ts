export interface CardDataProgress {
  // Compressed bytes received so far.
  bytes: number;
  totalBytes: number | null;
  rows: number;
}

export interface LocalCardData {
  // Scryfall's updated_at for the bulk file that was ingested.
  sourceUpdatedAt: string;
  ingestedAt: string;
  printings: number;
  // The file was upgraded in place and lacks data only a download brings
  // (each card's related tokens), so the next check downloads again.
  needsRefresh?: true;
}

export type CardDataPhase = 'idle' | 'checking' | 'updating' | 'error';

export interface CardDataStatus {
  phase: CardDataPhase;
  local: LocalCardData | null;
  progress: CardDataProgress | null;
  // Set when the last check or update failed; the old data is kept.
  error: string | null;
}

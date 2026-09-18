export const BULK_DATA_URL = 'https://api.scryfall.com/bulk-data/default-cards';

// Scryfall publishes daily; refreshing more often than this isn't worth a
// ~80 MB download.
export const CARD_DATA_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export interface BulkDataInfo {
  updatedAt: string;
  downloadUrl: string;
  size: number | null;
}

// Scryfall asks every client to identify itself and to request JSON.
export const scryfallHeaders = (appVersion: string) => ({
  'User-Agent': `MTGPlayMat/${appVersion}`,
  Accept: 'application/json',
});

export const parseBulkDataInfo = (body: unknown): BulkDataInfo => {
  const info = body as Record<string, unknown>;
  const downloadUrl = info.jsonl_download_uri ?? info.download_uri;
  const size = info.compressed_size ?? info.size;

  if (typeof info.updated_at !== 'string' || typeof downloadUrl !== 'string') {
    throw new Error('unexpected bulk-data response from Scryfall');
  }
  return {
    updatedAt: info.updated_at,
    downloadUrl,
    size: typeof size === 'number' ? size : null,
  };
};

export const fetchBulkDataInfo = async (
  url: string,
  appVersion: string,
  fetchImpl: typeof fetch = fetch
): Promise<BulkDataInfo> => {
  const response = await fetchImpl(url, {
    headers: scryfallHeaders(appVersion),
  });
  if (!response.ok) {
    throw new Error(`Scryfall bulk-data request failed (${response.status})`);
  }
  return parseBulkDataInfo(await response.json());
};

interface LocalMeta {
  sourceUpdatedAt: string;
}

// Download when there's nothing local, or when Scryfall has something
// newer and ours is past the age limit. A forced (manual) update skips
// the age limit but still won't re-fetch identical data.
export const shouldDownload = ({
  local,
  remoteUpdatedAt,
  now,
  maxAgeMs = CARD_DATA_MAX_AGE_MS,
  force = false,
}: {
  local: LocalMeta | null;
  remoteUpdatedAt: string;
  now: Date;
  maxAgeMs?: number;
  force?: boolean;
}): boolean => {
  if (!local) return true;
  const localTime = Date.parse(local.sourceUpdatedAt);
  const remoteTime = Date.parse(remoteUpdatedAt);
  if (Number.isNaN(localTime)) return true;
  if (!(remoteTime > localTime)) return false;
  return force || now.getTime() - localTime >= maxAgeMs;
};

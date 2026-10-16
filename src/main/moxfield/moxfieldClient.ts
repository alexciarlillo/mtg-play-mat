import {
  type MoxfieldDeck,
  MoxfieldError,
  type MoxfieldSearchPage,
  parseDeck,
  parseSearchPage,
  SEARCH_PAGE_SIZE,
} from './moxfieldApi';

export const MOXFIELD_API_URL = 'https://api2.moxfield.com';

// A 100-card deck with its maybeboard is about 600 KB.
export const MAX_SEARCH_BYTES = 2_000_000;
export const MAX_DECK_BYTES = 12_000_000;

const TIMEOUT_MS = 30_000;

export type FetchFn = (
  url: string,
  init: { signal: AbortSignal; headers: Record<string, string> }
) => Promise<Response>;

export interface MoxfieldClient {
  searchPage(
    user: string,
    page: number,
    signal: AbortSignal
  ): Promise<MoxfieldSearchPage>;
  getDeck(publicId: string, signal: AbortSignal): Promise<MoxfieldDeck>;
}

const cancelled = () =>
  new MoxfieldError('cancelled', 'The sync was cancelled.');

const statusError = (
  res: Response,
  isJson: boolean,
  notFound: string
): MoxfieldError => {
  if (res.status === 404) return new MoxfieldError('notFound', notFound);
  if (res.status === 429) {
    return new MoxfieldError(
      'rateLimited',
      'Moxfield asked this app to slow down. Try again in a few minutes.'
    );
  }
  // Cloudflare answers a refused client with an HTML page.
  if (res.status === 403 || res.status === 503 || !isJson) {
    return new MoxfieldError(
      'blocked',
      `Moxfield refused the request (HTTP ${res.status}). ` +
        'It may be blocking this app; try again later.'
    );
  }
  return new MoxfieldError(
    'network',
    `Moxfield answered with HTTP ${res.status}. Try again later.`
  );
};

// Reads at most max bytes, so an oversized answer can't fill memory.
const readCapped = async (res: Response, max: number): Promise<string> => {
  const tooBig = () =>
    new MoxfieldError(
      'schema',
      'Moxfield sent far more data than a deck should need.'
    );
  const declared = Number(res.headers.get('content-length'));
  if (declared > max) throw tooBig();
  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      throw tooBig();
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
};

export const createMoxfieldClient = ({
  fetch,
  baseUrl = MOXFIELD_API_URL,
  timeoutMs = TIMEOUT_MS,
}: {
  fetch: FetchFn;
  baseUrl?: string;
  timeoutMs?: number;
}): MoxfieldClient => {
  const getJson = async (
    url: string,
    max: number,
    signal: AbortSignal,
    notFound: string
  ): Promise<unknown> => {
    if (signal.aborted) throw cancelled();
    const timeout = AbortSignal.timeout(timeoutMs);
    const both = AbortSignal.any([signal, timeout]);
    try {
      const res = await fetch(url, {
        signal: both,
        headers: { Accept: 'application/json' },
      });
      const isJson = (res.headers.get('content-type') ?? '').includes('json');
      if (!res.ok || !isJson) {
        await res.body?.cancel();
        throw statusError(res, isJson, notFound);
      }
      const body = await readCapped(res, max);
      try {
        return JSON.parse(body) as unknown;
      } catch {
        throw new MoxfieldError(
          'schema',
          'Moxfield sent a response this app could not read.'
        );
      }
    } catch (err) {
      if (err instanceof MoxfieldError) throw err;
      if (signal.aborted) throw cancelled();
      if (timeout.aborted) {
        throw new MoxfieldError(
          'network',
          'Moxfield took too long to answer. Try again later.'
        );
      }
      throw new MoxfieldError(
        'network',
        'Could not reach Moxfield. Check your internet connection.'
      );
    }
  };

  return {
    searchPage: async (user, page, signal) => {
      const query = new URLSearchParams({
        authorUserNames: user,
        pageNumber: String(page),
        pageSize: String(SEARCH_PAGE_SIZE),
        // Creation order doesn't move while the user edits a deck, so a
        // page boundary can't shift mid-sync the way update order can.
        sortType: 'created',
        sortDirection: 'Ascending',
      });
      const json = await getJson(
        `${baseUrl}/v2/decks/search?${query.toString()}`,
        MAX_SEARCH_BYTES,
        signal,
        "Moxfield's deck search wasn't there. Its API may have changed."
      );
      return parseSearchPage(json, user);
    },
    getDeck: async (publicId, signal) => {
      const json = await getJson(
        `${baseUrl}/v3/decks/all/${encodeURIComponent(publicId)}`,
        MAX_DECK_BYTES,
        signal,
        'This deck is no longer public on Moxfield.'
      );
      return parseDeck(json, publicId);
    },
  };
};

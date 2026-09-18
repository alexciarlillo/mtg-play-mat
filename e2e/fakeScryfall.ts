import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';

// A local stand-in for Scryfall: the bulk-data endpoint and a small real
// bulk file, so the full download -> ingest -> swap path runs offline.
export const fixture = readFileSync(
  path.join(
    __dirname,
    '../src/main/cardData/fixtures/default-cards.sample.jsonl.gz'
  )
);
export const FIXTURE_CARDS = 39;

export interface FakeScryfall {
  bulkDataUrl: string;
  bulkRequests: { url?: string; userAgent?: string }[];
  close(): void;
}

export const startFakeScryfall = async (): Promise<FakeScryfall> => {
  const bulkRequests: FakeScryfall['bulkRequests'] = [];
  const server = createServer((req, res) => {
    const { port } = server.address() as AddressInfo;
    if (req.url === '/bulk-data/default-cards') {
      bulkRequests.push({ url: req.url, userAgent: req.headers['user-agent'] });
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          object: 'bulk_data',
          type: 'default_cards',
          updated_at: '2026-09-18T09:05:32.127+00:00',
          jsonl_download_uri: `http://127.0.0.1:${port}/cards.jsonl.gz`,
          compressed_size: fixture.length,
        })
      );
    } else if (req.url === '/cards.jsonl.gz') {
      res.setHeader('Content-Length', fixture.length);
      res.end(fixture);
    } else {
      res.statusCode = 404;
      res.end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    bulkDataUrl: `http://127.0.0.1:${port}/bulk-data/default-cards`,
    bulkRequests,
    close: () => server.close(),
  };
};

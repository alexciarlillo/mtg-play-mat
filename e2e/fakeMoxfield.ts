import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

// A local stand-in for Moxfield's deck search and deck endpoints, shaped
// like the real responses, with cards from the fake Scryfall's sample so
// the sync resolves them. Tests change `decks` and `mode` between syncs.

export interface FakeCard {
  name: string;
  qty: number;
  scryfallId?: string;
  set?: string;
  cn?: string;
}

export interface FakeDeck {
  publicId: string;
  name: string;
  format: string;
  lastUpdatedAtUtc: string;
  commanders?: FakeCard[];
  mainboard: FakeCard[];
  sideboard?: FakeCard[];
  maybeboard?: FakeCard[];
}

export interface FakeMoxfield {
  baseUrl: string;
  decks: FakeDeck[];
  // 'blocked' answers like Cloudflare does when it turns a client away.
  mode: 'ok' | 'blocked';
  requests: string[];
  close(): void;
}

export const FAKE_USER = 'e2e_player';

const user = (userName: string) => ({
  userName,
  displayName: userName,
  badges: [],
});

const board = (cards: FakeCard[] = []) => ({
  count: cards.reduce((n, c) => n + c.qty, 0),
  cards: Object.fromEntries(
    cards.map((c, i) => [
      `k${i}`,
      {
        quantity: c.qty,
        boardType: 'mainboard',
        finish: 'nonFoil',
        card: {
          name: c.name,
          scryfall_id: c.scryfallId,
          set: c.set,
          cn: c.cn,
          layout: 'normal',
        },
      },
    ])
  ),
});

const item = (deck: FakeDeck, author: string) => ({
  name: deck.name,
  format: deck.format,
  visibility: 'public',
  publicUrl: `https://moxfield.com/decks/${deck.publicId}`,
  publicId: deck.publicId,
  createdByUser: user(author),
  authors: [user(author)],
  lastUpdatedAtUtc: deck.lastUpdatedAtUtc,
});

const fullDeck = (deck: FakeDeck) => ({
  ...item(deck, FAKE_USER),
  boards: {
    mainboard: board(deck.mainboard),
    sideboard: board(deck.sideboard),
    maybeboard: board(deck.maybeboard),
    commanders: board(deck.commanders),
    companions: board(),
    tokens: board(),
  },
});

export const startFakeMoxfield = async (
  decks: FakeDeck[]
): Promise<FakeMoxfield> => {
  const fake: Omit<FakeMoxfield, 'baseUrl' | 'close'> = {
    decks,
    mode: 'ok',
    requests: [],
  };
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    fake.requests.push(`${url.pathname}${url.search}`);
    if (fake.mode === 'blocked') {
      res.statusCode = 403;
      res.setHeader('Content-Type', 'text/html');
      res.end('<html><title>Attention Required!</title></html>');
      return;
    }
    const json = (body: unknown) => {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify(body));
    };
    if (url.pathname === '/v2/decks/search') {
      const wanted = url.searchParams.get('authorUserNames') ?? '';
      // Moxfield ignores a name it doesn't know and lists everyone's.
      const known = wanted.toLowerCase() === FAKE_USER.toLowerCase();
      const data = fake.decks.map((d) =>
        item(d, known ? FAKE_USER : 'someone_else')
      );
      json({
        pageNumber: 1,
        pageSize: 50,
        totalResults: data.length,
        totalPages: 1,
        data,
      });
      return;
    }
    const deckId = /^\/v3\/decks\/all\/([\w-]+)$/.exec(url.pathname)?.[1];
    const deck = fake.decks.find((d) => d.publicId === deckId);
    if (deck) {
      json(fullDeck(deck));
      return;
    }
    res.statusCode = 404;
    json({ title: 'Not Found', status: 404 });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return Object.assign(fake, {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => server.close(),
  });
};

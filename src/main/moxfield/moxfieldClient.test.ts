// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { deckFixture, readFixture, SATORU } from './fixtures';
import { MoxfieldError } from './moxfieldApi';
import { createMoxfieldClient, type FetchFn } from './moxfieldClient';

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8' },
    ...init,
  });

const clientWith = (respond: FetchFn, timeoutMs?: number) => {
  const fetch = vi.fn(respond);
  return {
    fetch,
    client: createMoxfieldClient({
      fetch,
      baseUrl: 'http://moxfield.test',
      timeoutMs,
    }),
  };
};

const signal = () => new AbortController().signal;

const failure = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (err) {
    if (err instanceof MoxfieldError)
      return { kind: err.kind, message: err.message };
    throw err;
  }
  throw new Error('expected a failure');
};

describe('createMoxfieldClient', () => {
  it("asks the search for one user's decks, newest first", async () => {
    const { client, fetch } = clientWith(async () =>
      json(readFixture('search'))
    );
    const page = await client.searchPage('aciarlillo', 2, signal());
    expect(page.decks).toHaveLength(2);
    expect(fetch.mock.calls[0][0]).toBe(
      'http://moxfield.test/v2/decks/search?authorUserNames=aciarlillo' +
        '&pageNumber=2&pageSize=50&sortType=created&sortDirection=Ascending'
    );
    expect(fetch.mock.calls[0][1].headers).toEqual({
      Accept: 'application/json',
    });
  });

  it('fetches a whole deck by its id', async () => {
    const { client, fetch } = clientWith(async () => json(deckFixture(SATORU)));
    const deck = await client.getDeck(SATORU, signal());
    expect(deck.name).toBe('Satoru Home Wrecker');
    expect(fetch.mock.calls[0][0]).toBe(
      `http://moxfield.test/v3/decks/all/${SATORU}`
    );
  });

  it('says when Cloudflare blocks the app', async () => {
    const { client } = clientWith(
      async () =>
        new Response('<html>you have been blocked</html>', {
          status: 403,
          headers: { 'content-type': 'text/html' },
        })
    );
    expect(await failure(client.searchPage('a', 1, signal()))).toMatchObject({
      kind: 'blocked',
      message: expect.stringContaining('HTTP 403'),
    });
  });

  it('treats an HTML page with a 200 as blocked too', async () => {
    const { client } = clientWith(
      async () =>
        new Response('<html></html>', {
          headers: { 'content-type': 'text/html' },
        })
    );
    expect((await failure(client.searchPage('a', 1, signal()))).kind).toBe(
      'blocked'
    );
  });

  it('names rate limits, missing decks and other statuses', async () => {
    const status = (code: number) =>
      clientWith(async () => json({}, { status: code })).client;
    expect((await failure(status(429).getDeck(SATORU, signal()))).kind).toBe(
      'rateLimited'
    );
    expect(await failure(status(404).getDeck(SATORU, signal()))).toEqual({
      kind: 'notFound',
      message: 'This deck is no longer public on Moxfield.',
    });
    expect((await failure(status(500).getDeck(SATORU, signal()))).kind).toBe(
      'network'
    );
  });

  it('refuses an answer that is too big, declared or not', async () => {
    const declared = clientWith(
      async () =>
        new Response('{}', {
          headers: {
            'content-type': 'application/json',
            'content-length': '99999999',
          },
        })
    ).client;
    expect((await failure(declared.getDeck(SATORU, signal()))).kind).toBe(
      'schema'
    );

    const stream = new ReadableStream({
      start(controller) {
        const chunk = new Uint8Array(1_000_000);
        for (let i = 0; i < 3; i += 1) controller.enqueue(chunk);
        controller.close();
      },
    });
    const streamed = clientWith(
      async () =>
        new Response(stream, {
          headers: { 'content-type': 'application/json' },
        })
    ).client;
    expect(
      await failure(streamed.searchPage('aciarlillo', 1, signal()))
    ).toMatchObject({ kind: 'schema', message: /far more data/ });
  });

  it('refuses JSON it cannot parse', async () => {
    const { client } = clientWith(
      async () =>
        new Response('{"data": [', {
          headers: { 'content-type': 'application/json' },
        })
    );
    expect((await failure(client.searchPage('a', 1, signal()))).kind).toBe(
      'schema'
    );
  });

  it('reports a network failure, a timeout and a cancel apart', async () => {
    const offline = clientWith(async () => {
      throw new TypeError('net::ERR_INTERNET_DISCONNECTED');
    }).client;
    expect(await failure(offline.getDeck(SATORU, signal()))).toMatchObject({
      kind: 'network',
      message: expect.stringContaining('internet connection'),
    });

    const hang: FetchFn = (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () =>
          reject(new DOMException('aborted', 'AbortError'))
        );
      });
    const slow = clientWith(hang, 20).client;
    expect(await failure(slow.getDeck(SATORU, signal()))).toMatchObject({
      kind: 'network',
      message: expect.stringContaining('too long'),
    });

    const controller = new AbortController();
    const pending = clientWith(hang).client.getDeck(SATORU, controller.signal);
    controller.abort();
    expect((await failure(pending)).kind).toBe('cancelled');

    const { client, fetch } = clientWith(hang);
    expect(
      (await failure(client.getDeck(SATORU, controller.signal))).kind
    ).toBe('cancelled');
    expect(fetch).not.toHaveBeenCalled();
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';

const facts = {
  mv: 1,
  colors: [],
  colorIdentity: [],
  keywords: [],
  faces: [{ name: 'A', typeLine: 'Artifact' }],
};

const freshModule = async (getCardFacts: (ids: string[]) => unknown) => {
  vi.resetModules();
  Object.assign(window, { api: { getCardFacts } });
  return import('./cardFacts');
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('card facts cache', () => {
  it('asks once per id, including ids the database lacks', async () => {
    const getCardFacts = vi.fn(() => Promise.resolve({ a: facts }));
    const { cardFacts, loadCardFacts } = await freshModule(getCardFacts);

    loadCardFacts(['a', 'b', 'a', '']);
    loadCardFacts(['b']);
    expect(getCardFacts.mock.calls).toEqual([[['a', 'b']]]);
    await vi.waitFor(() => expect(cardFacts('a')).toEqual(facts));
    expect(cardFacts('b')).toBeUndefined();
    loadCardFacts(['a', 'b']);
    expect(getCardFacts).toHaveBeenCalledTimes(1);
  });

  it('asks again after a failed request', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const getCardFacts = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValue({ a: facts });
    const { cardFacts, loadCardFacts } = await freshModule(getCardFacts);

    loadCardFacts(['a']);
    await vi.waitFor(() => expect(console.error).toHaveBeenCalled());
    loadCardFacts(['a']);
    await vi.waitFor(() => expect(cardFacts('a')).toEqual(facts));
    expect(getCardFacts).toHaveBeenCalledTimes(2);
  });

  it('caches prototype names as unknown, not as Object members', async () => {
    const getCardFacts = vi.fn(() => Promise.resolve({}));
    const { cardFacts, loadCardFacts } = await freshModule(getCardFacts);
    loadCardFacts(['constructor', 'toString']);
    await vi.waitFor(() => expect(getCardFacts).toHaveBeenCalled());
    await Promise.resolve();
    expect(cardFacts('constructor')).toBeUndefined();
    expect(cardFacts('toString')).toBeUndefined();
  });
});

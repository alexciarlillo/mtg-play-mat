import { describe, expect, it } from 'vitest';

import {
  formatLobbyCode,
  generateLobbyCode,
  isLobbyCode,
  LOBBY_CODE_LENGTH,
  normalizeLobbyCode,
} from './lobbyCode';

describe('generateLobbyCode', () => {
  it('makes a code of the right shape', () => {
    for (let i = 0; i < 200; i += 1) {
      const code = generateLobbyCode();
      expect(code).toHaveLength(LOBBY_CODE_LENGTH);
      expect(normalizeLobbyCode(code)).toBe(code);
    }
  });

  it('never emits a look-alike letter', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i += 1) {
      [...generateLobbyCode()].forEach((char) => seen.add(char));
    }
    ['I', 'L', 'O', 'U'].forEach((char) => expect(seen.has(char)).toBe(false));
  });

  it('uses the whole alphabet without bias', () => {
    const bytes = Array.from({ length: 256 }, (_, i) => i);
    let next = 0;
    const counts = new Map<string, number>();
    for (let i = 0; i < 256; i += 1) {
      const code = generateLobbyCode((size) =>
        Uint8Array.from({ length: size }, () => {
          const byte = bytes[next % bytes.length];
          next += 1;
          return byte;
        })
      );
      [...code].forEach((char) =>
        counts.set(char, (counts.get(char) ?? 0) + 1)
      );
    }
    expect(counts.size).toBe(32);
    expect(new Set(counts.values())).toEqual(new Set([48]));
  });
});

describe('normalizeLobbyCode', () => {
  it('accepts the canonical form', () => {
    expect(normalizeLobbyCode('ABC123')).toBe('ABC123');
  });

  it('accepts what a person would actually type', () => {
    expect(normalizeLobbyCode('abc-123')).toBe('ABC123');
    expect(normalizeLobbyCode('  abc 123 ')).toBe('ABC123');
    expect(normalizeLobbyCode('AB-C1-23')).toBe('ABC123');
  });

  it('folds the look-alikes', () => {
    expect(normalizeLobbyCode('oil0u9')).toBe('0110V9');
  });

  it('rejects anything else', () => {
    [
      '',
      'ABC12',
      'ABC1234',
      'ABC12!',
      'ABC 12',
      42,
      null,
      undefined,
      ['ABC123'],
    ].forEach((input) => expect(normalizeLobbyCode(input)).toBeNull());
  });
});

describe('isLobbyCode', () => {
  it('follows normalization', () => {
    expect(isLobbyCode('abc-123')).toBe(true);
    expect(isLobbyCode('nope')).toBe(false);
  });
});

describe('formatLobbyCode', () => {
  it('groups for reading', () => {
    expect(formatLobbyCode('ABC123')).toBe('ABC-123');
  });

  it('leaves anything unexpected alone', () => {
    expect(formatLobbyCode('SHORT')).toBe('SHORT');
  });

  it('round-trips through normalization', () => {
    const code = generateLobbyCode();
    expect(normalizeLobbyCode(formatLobbyCode(code))).toBe(code);
  });
});

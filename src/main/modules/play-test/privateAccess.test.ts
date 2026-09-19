import { describe, expect, it } from 'vitest';

import {
  mayReadHand,
  mayReadLibrary,
  type PlayTestSenders,
} from './privateAccess';

const board = { id: 'board' };
const hand = { id: 'hand' };
const app = { id: 'app' };

const split: PlayTestSenders<object> = { board, hand, handInBoard: false };
const single: PlayTestSenders<object> = {
  board,
  hand: null,
  handInBoard: true,
};

describe('split windows', () => {
  it('refuses the board the library and the hand view', () => {
    expect(mayReadLibrary(split, board)).toBe(false);
    expect(mayReadHand(split, board)).toBe(false);
  });

  it('gives the hand window both', () => {
    expect(mayReadLibrary(split, hand)).toBe(true);
    expect(mayReadHand(split, hand)).toBe(true);
  });

  it('lets other windows read the hand view but not the library', () => {
    expect(mayReadHand(split, app)).toBe(true);
    expect(mayReadLibrary(split, app)).toBe(false);
  });
});

describe('hand in the board window', () => {
  it('gives the board the library and the hand view', () => {
    expect(mayReadLibrary(single, board)).toBe(true);
    expect(mayReadHand(single, board)).toBe(true);
  });

  it('still refuses the library to other windows', () => {
    expect(mayReadLibrary(single, app)).toBe(false);
    expect(mayReadLibrary(single, hand)).toBe(false);
  });
});

describe('no play test open', () => {
  const none: PlayTestSenders<object> = {
    board: null,
    hand: null,
    handInBoard: true,
  };

  it('refuses the library to everyone', () => {
    expect(mayReadLibrary(none, board)).toBe(false);
    expect(mayReadLibrary(none, hand)).toBe(false);
  });
});

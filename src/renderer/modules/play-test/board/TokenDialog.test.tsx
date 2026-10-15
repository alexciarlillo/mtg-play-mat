import type { CardRef } from '@shared/game';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import TokenDialog from './TokenDialog';

const soldier = {
  id: '1bdb2914-bba2-4cb6-802e-af2aeef46de8',
  name: 'Soldier',
  typeLine: 'Token Creature — Soldier',
  faces: [{ name: 'Soldier', typeLine: 'Token Creature — Soldier' }],
  power: '1',
  toughness: '1',
};

const tokenRef = (id: string, name: string, typeLine = `Token ${name}`) => ({
  id,
  name,
  typeLine,
  faces: [{ name, typeLine }],
});

const treasure = tokenRef(
  '1728ad2d-c8a6-49e4-85bb-29934fa26208',
  'Treasure',
  'Token Artifact — Treasure'
);
const otherTreasure = {
  ...treasure,
  id: '1be23c27-d8b6-4f59-8ab8-9ce80e9e29dd',
};
const food = tokenRef(
  '95a625ba-330c-4677-a9b3-9c471225b204',
  'Food',
  'Token Artifact — Food'
);
const monarch = tokenRef(
  '40b79918-22a7-4fff-82a6-8ebfe6e87185',
  'The Monarch',
  'Card'
);

const result = (ref: CardRef, oracleId?: string) => ({
  ref,
  setCode: 'tst',
  setName: 'Test Tokens',
  ...(oracleId && { oracleId }),
});

const dispatch = vi.fn(() => Promise.resolve());
const searchTokens = vi.fn((query: string) =>
  Promise.resolve(
    query === 'The Monarch'
      ? [
          // A longer name that also matches comes first; it's skipped.
          result({ ...monarch, id: 'other', name: 'The Monarchy' }),
          result(monarch),
        ]
      : [{ ref: soldier, setCode: 'tm21', setName: 'M21 Tokens' }]
  )
);
const getDeckPrintingIds = vi.fn(() => Promise.resolve<string[]>([]));
const relatedTokens = vi.fn(() => Promise.resolve({}));

beforeEach(() => {
  vi.useFakeTimers();
  Object.assign(window, {
    api: { dispatch, searchTokens, getDeckPrintingIds, relatedTokens },
  });
});

afterEach(() => {
  vi.useRealTimers();
  dispatch.mockClear();
  searchTokens.mockClear();
  getDeckPrintingIds.mockReset();
  getDeckPrintingIds.mockImplementation(() => Promise.resolve([]));
});

describe('TokenDialog', () => {
  it('searches token printings and creates N of the chosen one', async () => {
    const onClose = vi.fn();
    render(<TokenDialog playerId="p1" onClose={onClose} />);

    fireEvent.change(screen.getByLabelText('Token name'), {
      target: { value: 'sold' },
    });
    await act(() => vi.advanceTimersByTimeAsync(250));
    expect(searchTokens).toHaveBeenCalledWith('sold');

    fireEvent.click(screen.getByTestId('token-result'));
    fireEvent.change(screen.getByLabelText('How many?'), {
      target: { value: '3' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    expect(dispatch).toHaveBeenCalledWith({
      type: 'createTokens',
      playerId: 'p1',
      ref: soldier,
      count: 3,
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('creates a custom token with no image', () => {
    render(<TokenDialog playerId="p1" onClose={() => {}} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Custom token' }));
    const create = screen.getByRole('button', { name: 'Create' });
    expect(create).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: ' Spirit ' },
    });
    fireEvent.change(screen.getByLabelText('Type'), {
      target: { value: 'Token Creature — Spirit' },
    });
    fireEvent.click(create);

    const face = {
      name: 'Spirit',
      typeLine: 'Token Creature — Spirit',
      power: '1',
      toughness: '1',
    };
    expect(dispatch).toHaveBeenCalledWith({
      type: 'createTokens',
      playerId: 'p1',
      ref: { id: '', custom: true, ...face, faces: [face] },
      count: 1,
    });
  });

  it("docked, lists the deck's tokens first, once each, before any search", async () => {
    getDeckPrintingIds.mockImplementation(() =>
      Promise.resolve(['deck-a', 'deck-b', 'deck-c'])
    );
    relatedTokens.mockImplementation(() =>
      Promise.resolve({
        'deck-a': [result(treasure, 'o-treasure'), result(food, 'o-food')],
        'deck-b': [result(otherTreasure, 'o-treasure')],
      })
    );
    const onClose = vi.fn();
    render(<TokenDialog playerId="p1" docked onClose={onClose} />);
    await act(() => vi.advanceTimersByTimeAsync(0));

    expect(relatedTokens).toHaveBeenCalledWith(['deck-a', 'deck-b', 'deck-c']);
    expect(screen.queryByText('Show this deck’s tokens')).toBeNull();
    const listed = screen
      .getByTestId('deck-tokens')
      .querySelectorAll('[data-testid="token-result"]');
    expect([...listed].map((el) => el.getAttribute('title'))).toEqual([
      'Food · Test Tokens',
      'Treasure · Test Tokens',
    ]);

    fireEvent.click(listed[1]!);
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(dispatch).toHaveBeenCalledWith({
      type: 'createTokens',
      playerId: 'p1',
      ref: treasure,
      count: 1,
    });

    fireEvent.change(screen.getByLabelText('Token name'), {
      target: { value: 'sold' },
    });
    expect(screen.queryByTestId('deck-tokens')).toBeNull();
  });

  it('places a designation in one click, by its exact printing', async () => {
    const onClose = vi.fn();
    render(<TokenDialog playerId="p1" onClose={onClose} />);
    fireEvent.click(screen.getByTestId('designation-monarch'));
    expect(onClose).toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(0));

    expect(searchTokens).toHaveBeenCalledWith('The Monarch');
    expect(dispatch).toHaveBeenCalledWith({
      type: 'createTokens',
      playerId: 'p1',
      ref: monarch,
      count: 1,
    });
  });

  it('falls back to a stand-in, on the right face, without card data', async () => {
    render(<TokenDialog playerId="p1" onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('designation-initiative'));
    await act(() => vi.advanceTimersByTimeAsync(0));

    expect(dispatch).toHaveBeenCalledWith({
      type: 'createTokens',
      playerId: 'p1',
      ref: {
        id: '',
        custom: true,
        name: 'Undercity // The Initiative',
        typeLine: 'Dungeon — Undercity // Card',
        faces: [
          { name: 'Undercity', typeLine: 'Dungeon — Undercity' },
          { name: 'The Initiative', typeLine: 'Card' },
        ],
        layout: 'double_faced_token',
      },
      count: 1,
      faceIndex: 1,
    });
  });

  it("undocked, keeps the deck's tokens hidden until asked", async () => {
    getDeckPrintingIds.mockImplementation(() => Promise.resolve(['deck-u']));
    relatedTokens.mockImplementation(() =>
      Promise.resolve({ 'deck-u': [result(food, 'o-food')] })
    );
    render(<TokenDialog playerId="p1" onClose={() => {}} />);
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(getDeckPrintingIds).not.toHaveBeenCalled();
    expect(screen.queryByTestId('deck-tokens')).toBeNull();

    fireEvent.click(screen.getByText('Show this deck’s tokens'));
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(screen.getByTestId('deck-tokens')).toHaveTextContent('Food');
    expect(screen.queryByText('Show this deck’s tokens')).toBeNull();
  });

  it('says so when the deck makes no tokens', async () => {
    getDeckPrintingIds.mockImplementation(() => Promise.resolve(['deck-n']));
    relatedTokens.mockImplementation(() => Promise.resolve({}));
    render(<TokenDialog playerId="p1" docked onClose={() => {}} />);
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(screen.getByText(/None found/)).toBeInTheDocument();
  });

  it('creates the Initiative on its Initiative face', async () => {
    const initiative: CardRef = {
      id: '2c65185b-6cf0-451d-985e-56aa45d9a57d',
      name: 'Undercity // The Initiative',
      typeLine: 'Dungeon — Undercity // Card',
      faces: [
        { name: 'Undercity', typeLine: 'Dungeon — Undercity' },
        { name: 'The Initiative', typeLine: 'Card' },
      ],
      layout: 'double_faced_token',
    };
    getDeckPrintingIds.mockImplementation(() => Promise.resolve(['deck-i']));
    relatedTokens.mockImplementation(() =>
      Promise.resolve({ 'deck-i': [result(initiative)] })
    );
    render(<TokenDialog playerId="p1" docked onClose={() => {}} />);
    await act(() => vi.advanceTimersByTimeAsync(0));
    fireEvent.click(screen.getByTestId('token-result'));
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(dispatch).toHaveBeenCalledWith({
      type: 'createTokens',
      playerId: 'p1',
      ref: initiative,
      count: 1,
      faceIndex: 1,
    });
  });

  it('looks a stand-in up again, so card data arriving later is used', async () => {
    const blessing = tokenRef(
      '0f6a6dc8-1c3c-45d2-be4f-bfab58a5a66f',
      "City's Blessing",
      'Card'
    );
    searchTokens.mockImplementationOnce(() => Promise.resolve([]));
    render(<TokenDialog playerId="p1" onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('designation-citys-blessing'));
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(dispatch).toHaveBeenLastCalledWith(
      expect.objectContaining({
        ref: expect.objectContaining({ custom: true }),
      })
    );

    searchTokens.mockImplementationOnce(() =>
      Promise.resolve([result(blessing)])
    );
    fireEvent.click(screen.getByTestId('designation-citys-blessing'));
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(dispatch).toHaveBeenLastCalledWith(
      expect.objectContaining({ ref: blessing })
    );
    // A real printing is kept, so it isn't asked for again.
    fireEvent.click(screen.getByTestId('designation-citys-blessing'));
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(searchTokens).toHaveBeenCalledTimes(2);
  });
});
